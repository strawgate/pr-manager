/**
 * LLM-based Automation Decision Engine
 *
 * Determines whether to automate, suggest, or flag actions for manual review
 * based on complexity, risk, and historical patterns.
 */

import type {
  AutomationConfidence,
  AutomationDecisionFactors,
  ComplexityLevel,
  PrAction,
  PrState,
} from "./pr-state-transitions";

/**
 * Decision result from automation engine
 */
export interface AutomationDecision {
  action: PrAction;
  confidence: AutomationConfidence;
  reasoning: string;
  shouldDelegate: boolean;
  delegationTarget?: "worktree_agent" | "maintainer" | "author";
  estimatedRisk: "LOW" | "MEDIUM" | "HIGH";
  requiresApproval: boolean;
}

/**
 * Complexity assessment based on change characteristics
 */
export function assessComplexity(factors: {
  additions: number;
  deletions: number;
  files: number;
  errorPattern?: string;
  criticalFiles?: boolean;
}): ComplexityLevel {
  // Critical file changes always complex
  if (factors.criticalFiles) {
    return "CRITICAL";
  }

  const totalChanges = factors.additions + factors.deletions;

  // Trivial: Very small, focused changes
  if (totalChanges < 10 && factors.files <= 2) {
    return "TRIVIAL";
  }

  // Simple: Small changes
  if (totalChanges < 50 && factors.files <= 5) {
    return "SIMPLE";
  }

  // Moderate: Medium changes
  if (totalChanges < 200 && factors.files <= 15) {
    return "MODERATE";
  }

  // Complex: Large changes
  if (totalChanges < 500 && factors.files <= 30) {
    return "COMPLEX";
  }

  // Critical: Very large changes
  return "CRITICAL";
}

/**
 * Patterns that can typically be auto-fixed with high confidence
 */
const AUTO_FIXABLE_PATTERNS = {
  CI_FAILURE: [
    /lint.*error/i,
    /format.*check.*failed/i,
    /prettier.*check/i,
    /eslint.*errors/i,
    /biome.*check.*failed/i,
    /type.*error.*null/i, // Simple null checks
    /unused.*import/i,
    /missing.*semicolon/i,
    /trailing.*comma/i,
  ],
  MERGE_CONFLICT: [
    /package-lock\.json/i,
    /yarn\.lock/i,
    /pnpm-lock\.yaml/i,
    /\.prettier.*\.json/i,
    /\.eslintrc/i,
  ],
  REVIEW_FEEDBACK: [
    /rename.*variable/i,
    /fix.*typo/i,
    /add.*comment/i,
    /format.*code/i,
    /remove.*console\.log/i,
    /use.*const.*instead/i,
  ],
};

/**
 * Check if error matches auto-fixable patterns
 */
function matchesAutoFixablePattern(
  errorType: "CI_FAILURE" | "MERGE_CONFLICT" | "REVIEW_FEEDBACK",
  errorDetails: string,
): boolean {
  const patterns = AUTO_FIXABLE_PATTERNS[errorType];
  return patterns.some((pattern) => pattern.test(errorDetails));
}

/**
 * Determine if CI failure can be auto-fixed
 */
function canAutoFixCIFailure(
  errorDetails: string,
  errorMessages: string[],
  complexity: ComplexityLevel,
): { canFix: boolean; confidence: AutomationConfidence } {
  // Never auto-fix critical complexity
  if (complexity === "CRITICAL") {
    return { canFix: false, confidence: "MANUAL" };
  }

  // Check if all errors match auto-fixable patterns
  const allAutoFixable = errorMessages.every(
    (msg) =>
      matchesAutoFixablePattern("CI_FAILURE", msg) ||
      matchesAutoFixablePattern("CI_FAILURE", errorDetails),
  );

  if (allAutoFixable) {
    if (complexity === "TRIVIAL" || complexity === "SIMPLE") {
      return { canFix: true, confidence: "AUTO" };
    }
    return { canFix: true, confidence: "SUGGEST" };
  }

  // Some failures are auto-fixable
  const someAutoFixable = errorMessages.some(
    (msg) =>
      matchesAutoFixablePattern("CI_FAILURE", msg) ||
      matchesAutoFixablePattern("CI_FAILURE", errorDetails),
  );

  if (someAutoFixable && (complexity === "TRIVIAL" || complexity === "SIMPLE")) {
    return { canFix: true, confidence: "SUGGEST" };
  }

  return { canFix: false, confidence: "FLAG" };
}

/**
 * Determine if merge conflicts can be auto-resolved
 */
function canAutoResolveConflicts(
  conflictFiles: string[],
  complexity: ComplexityLevel,
): { canResolve: boolean; confidence: AutomationConfidence } {
  // Never auto-resolve critical complexity
  if (complexity === "CRITICAL" || complexity === "COMPLEX") {
    return { canResolve: false, confidence: "MANUAL" };
  }

  // Check if conflicts are in known auto-resolvable files
  const allAutoResolvable = conflictFiles.every((file) =>
    AUTO_FIXABLE_PATTERNS.MERGE_CONFLICT.some((pattern) => pattern.test(file)),
  );

  if (allAutoResolvable) {
    return { canResolve: true, confidence: "SUGGEST" };
  }

  // Single file conflicts in simple PRs
  if (conflictFiles.length === 1 && complexity === "SIMPLE") {
    return { canResolve: true, confidence: "SUGGEST" };
  }

  return { canResolve: false, confidence: "FLAG" };
}

/**
 * Determine if review feedback can be auto-addressed
 */
function canAutoAddressReview(
  feedbackText: string,
  complexity: ComplexityLevel,
): { canAddress: boolean; confidence: AutomationConfidence } {
  // Never auto-address for critical or complex changes
  if (complexity === "CRITICAL" || complexity === "COMPLEX") {
    return { canAddress: false, confidence: "MANUAL" };
  }

  // Check if feedback matches auto-addressable patterns
  const isAutoAddressable = matchesAutoFixablePattern("REVIEW_FEEDBACK", feedbackText);

  if (isAutoAddressable) {
    if (complexity === "TRIVIAL") {
      return { canAddress: true, confidence: "AUTO" };
    }
    if (complexity === "SIMPLE") {
      return { canAddress: true, confidence: "SUGGEST" };
    }
    return { canAddress: true, confidence: "FLAG" };
  }

  return { canAddress: false, confidence: "MANUAL" };
}

/**
 * Main automation decision engine
 */
export function decideAutomation(
  action: PrAction,
  currentState: PrState,
  factors: AutomationDecisionFactors,
): AutomationDecision {
  const { complexityLevel, failurePattern } = factors;

  // Default decision
  const defaultDecision: AutomationDecision = {
    action,
    confidence: "FLAG",
    reasoning: "Default: flag for manual review",
    shouldDelegate: false,
    estimatedRisk: "MEDIUM",
    requiresApproval: true,
  };

  switch (action) {
    case "FIX_CI_FAILURE": {
      if (!failurePattern || failurePattern.type !== "CI_FAILURE") {
        return {
          ...defaultDecision,
          reasoning: "No CI failure pattern provided",
        };
      }

      const { canFix, confidence } = canAutoFixCIFailure(
        failurePattern.details,
        failurePattern.errorMessages || [],
        complexityLevel,
      );

      if (!canFix) {
        return {
          action: "POST_COMMENT",
          confidence: "AUTO",
          reasoning: "CI failure too complex to auto-fix, will comment with suggestions",
          shouldDelegate: false,
          delegationTarget: "author",
          estimatedRisk: "LOW",
          requiresApproval: false,
        };
      }

      return {
        action,
        confidence,
        reasoning: `CI failure matches auto-fixable patterns (complexity: ${complexityLevel})`,
        shouldDelegate: confidence === "AUTO" || confidence === "SUGGEST",
        delegationTarget: "worktree_agent",
        estimatedRisk: confidence === "AUTO" ? "LOW" : "MEDIUM",
        requiresApproval: confidence !== "AUTO",
      };
    }

    case "RESOLVE_CONFLICTS": {
      if (!failurePattern || failurePattern.type !== "MERGE_CONFLICT") {
        return {
          ...defaultDecision,
          reasoning: "No merge conflict pattern provided",
        };
      }

      const conflictFiles = failurePattern.details.split(",");
      const { canResolve, confidence } = canAutoResolveConflicts(conflictFiles, complexityLevel);

      if (!canResolve) {
        return {
          action: "POST_COMMENT",
          confidence: "AUTO",
          reasoning: "Conflicts too complex to auto-resolve, will guide author",
          shouldDelegate: false,
          delegationTarget: "author",
          estimatedRisk: "LOW",
          requiresApproval: false,
        };
      }

      return {
        action,
        confidence,
        reasoning: `Conflicts appear auto-resolvable (${conflictFiles.length} files, complexity: ${complexityLevel})`,
        shouldDelegate: true,
        delegationTarget: "worktree_agent",
        estimatedRisk: "MEDIUM",
        requiresApproval: true,
      };
    }

    case "ADDRESS_REVIEW_COMMENTS": {
      if (!failurePattern || failurePattern.type !== "REVIEW_FEEDBACK") {
        return {
          ...defaultDecision,
          reasoning: "No review feedback pattern provided",
        };
      }

      const { canAddress, confidence } = canAutoAddressReview(
        failurePattern.details,
        complexityLevel,
      );

      if (!canAddress) {
        return {
          action: "POST_COMMENT",
          confidence: "AUTO",
          reasoning: "Review feedback requires author judgment",
          shouldDelegate: false,
          delegationTarget: "author",
          estimatedRisk: "LOW",
          requiresApproval: false,
        };
      }

      return {
        action,
        confidence,
        reasoning: `Review feedback matches auto-addressable patterns (complexity: ${complexityLevel})`,
        shouldDelegate: confidence === "AUTO" || confidence === "SUGGEST",
        delegationTarget: "worktree_agent",
        estimatedRisk: confidence === "AUTO" ? "LOW" : "MEDIUM",
        requiresApproval: confidence !== "AUTO",
      };
    }

    case "UPDATE_BRANCH": {
      // Generally safe to auto-update unless very complex
      if (complexityLevel === "CRITICAL") {
        return {
          action,
          confidence: "SUGGEST",
          reasoning: "Critical complexity - suggest update with approval",
          shouldDelegate: true,
          delegationTarget: "worktree_agent",
          estimatedRisk: "MEDIUM",
          requiresApproval: true,
        };
      }

      return {
        action,
        confidence: "AUTO",
        reasoning: "Branch update is standard operation",
        shouldDelegate: true,
        delegationTarget: "worktree_agent",
        estimatedRisk: "LOW",
        requiresApproval: false,
      };
    }

    case "MERGE": {
      // Only auto-merge if explicitly enabled and low risk
      if (complexityLevel === "TRIVIAL" && currentState === "READY_TO_MERGE") {
        return {
          action,
          confidence: "AUTO",
          reasoning: "Trivial changes, all checks passed, approved",
          shouldDelegate: false,
          estimatedRisk: "LOW",
          requiresApproval: false,
        };
      }

      return {
        action,
        confidence: "SUGGEST",
        reasoning: "Ready to merge but waiting for maintainer confirmation",
        shouldDelegate: false,
        delegationTarget: "maintainer",
        estimatedRisk: "MEDIUM",
        requiresApproval: true,
      };
    }

    case "POST_COMMENT":
    case "NOTIFY_AUTHOR":
    case "NOTIFY_REVIEWERS":
    case "ASSIGN_LABEL":
      // Low-risk actions can be automated
      return {
        action,
        confidence: "AUTO",
        reasoning: "Low-risk notification/organizational action",
        shouldDelegate: false,
        estimatedRisk: "LOW",
        requiresApproval: false,
      };

    case "REQUEST_REVIEW":
      // Can auto-assign based on CODEOWNERS
      return {
        action,
        confidence: "SUGGEST",
        reasoning: "Can suggest reviewers from CODEOWNERS or history",
        shouldDelegate: false,
        estimatedRisk: "LOW",
        requiresApproval: true,
      };

    case "CLOSE":
      // Closing should be suggested, not automatic (except stale)
      if (currentState === "STALE") {
        return {
          action,
          confidence: "SUGGEST",
          reasoning: "Stale PR - suggest closure after warning period",
          shouldDelegate: false,
          delegationTarget: "maintainer",
          estimatedRisk: "LOW",
          requiresApproval: true,
        };
      }

      return {
        action,
        confidence: "FLAG",
        reasoning: "Closing active PR requires maintainer decision",
        shouldDelegate: false,
        delegationTarget: "maintainer",
        estimatedRisk: "MEDIUM",
        requiresApproval: true,
      };

    default:
      return defaultDecision;
  }
}

/**
 * Generate LLM prompt for automation decision
 * This would be used with the OpenRouter client to get more sophisticated decisions
 */
export function generateDecisionPrompt(
  action: PrAction,
  state: PrState,
  factors: AutomationDecisionFactors,
): string {
  const { stateTransition, complexityLevel, changeSize, failurePattern } = factors;

  let prompt = `You are a PR automation assistant. Analyze whether the following action should be automated.

**Context:**
- Current State: ${state}
- State Transition: ${stateTransition.from} → ${stateTransition.to}
- Proposed Action: ${action}
- Complexity Level: ${complexityLevel}
- Change Size: ${changeSize.additions} additions, ${changeSize.deletions} deletions, ${changeSize.files} files
`;

  if (failurePattern) {
    prompt += `
**Failure Pattern:**
- Type: ${failurePattern.type}
- Details: ${failurePattern.details}
${failurePattern.errorMessages ? `- Error Messages:\n${failurePattern.errorMessages.map((msg) => `  * ${msg}`).join("\n")}` : ""}
`;
  }

  prompt += `

**Decision Required:**
Should this action be:
1. AUTO - Fully automated without approval
2. SUGGEST - Suggest to user with one-click approval
3. FLAG - Flag for manual review
4. MANUAL - Requires full manual intervention

**Provide:**
1. Recommended confidence level (AUTO/SUGGEST/FLAG/MANUAL)
2. Whether to delegate to worktree agent (for code changes)
3. Estimated risk (LOW/MEDIUM/HIGH)
4. Brief reasoning

Respond in JSON format:
{
  "confidence": "AUTO|SUGGEST|FLAG|MANUAL",
  "shouldDelegate": true|false,
  "delegationTarget": "worktree_agent|maintainer|author",
  "estimatedRisk": "LOW|MEDIUM|HIGH",
  "reasoning": "explanation"
}`;

  return prompt;
}
