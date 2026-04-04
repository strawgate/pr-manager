/**
 * Worktree Agent Integration
 *
 * Scaffolding for integrating with CLI-based worktree agents (like Claude Code, Copilot CLI)
 * for automated PR fixes and improvements.
 */

import type { AutomationDecision } from "./automation-engine";
import type { PrAction } from "./pr-state-transitions";

/**
 * Agent types that can be invoked
 */
export type AgentType = "claude_code" | "github_copilot" | "custom";

/**
 * Agent invocation request
 */
export interface AgentInvocation {
  agent: AgentType;
  action: PrAction;
  context: {
    repositoryNameWithOwner: string;
    prNumber: number;
    branch: string;
    baseBranch: string;
    description: string;
  };
  instruction: string;
  constraints?: {
    maxFiles?: number;
    maxChanges?: number;
    allowedTools?: string[];
    timeout?: number; // seconds
  };
}

/**
 * Agent execution result
 */
export interface AgentResult {
  success: boolean;
  agent: AgentType;
  action: PrAction;
  changes?: {
    filesModified: string[];
    additions: number;
    deletions: number;
    commitSha?: string;
  };
  output?: string;
  error?: string;
  executionTime?: number; // milliseconds
}

/**
 * Build instruction for Claude Code CLI agent
 */
export function buildClaudeCodeInstruction(
  action: PrAction,
  context: {
    prNumber: number;
    title: string;
    description: string;
    failureDetails?: string;
    reviewComments?: string;
    conflictFiles?: string[];
  },
): string {
  switch (action) {
    case "FIX_CI_FAILURE":
      return `Fix CI failures in PR #${context.prNumber} "${context.title}".

CI Failure Details:
${context.failureDetails || "Check the CI logs for details"}

Instructions:
1. Analyze the CI failure logs
2. Identify the root cause (lint errors, test failures, type errors, etc.)
3. Apply fixes using appropriate tools (lint fix, code changes, etc.)
4. Ensure all tests pass locally before committing
5. Commit with message: "fix: address CI failures in PR #${context.prNumber}"

Constraints:
- Only fix issues that are clearly identified in the CI logs
- Do not make unrelated changes
- If the failure is unclear or requires architectural changes, flag for manual review`;

    case "RESOLVE_CONFLICTS":
      return `Resolve merge conflicts in PR #${context.prNumber} "${context.title}".

Conflicting Files:
${context.conflictFiles?.map((f) => `- ${f}`).join("\n") || "Check git status for details"}

Instructions:
1. Fetch the latest base branch
2. Analyze the conflicts in each file
3. For lock files (package-lock.json, yarn.lock, etc.): regenerate them
4. For code files: carefully merge changes, preserving intent from both sides
5. Run tests after resolving to ensure nothing broke
6. Commit with message: "fix: resolve merge conflicts in PR #${context.prNumber}"

Constraints:
- Preserve functionality from both branches
- Do not delete code unless it's clearly redundant
- If conflicts are too complex, flag for manual review`;

    case "ADDRESS_REVIEW_COMMENTS":
      return `Address review feedback in PR #${context.prNumber} "${context.title}".

Review Feedback:
${context.reviewComments || "Check PR review comments for details"}

Instructions:
1. Read all review comments thoroughly
2. Address each comment systematically
3. Make changes as requested by reviewers
4. Add clarifying comments if helpful
5. Mark resolved threads as you address them
6. Commit with message: "fix: address review feedback in PR #${context.prNumber}"

Constraints:
- Only make changes explicitly requested in reviews
- If a review comment is ambiguous, ask for clarification
- Do not make additional "improvements" beyond what was requested`;

    case "UPDATE_BRANCH":
      return `Update PR #${context.prNumber} "${context.title}" with latest base branch changes.

Instructions:
1. Fetch the latest base branch
2. Merge base branch into PR branch (or rebase if that's the repo convention)
3. Resolve any conflicts if they arise
4. Run tests to ensure merge didn't break anything
5. Push the updated branch

Constraints:
- Use merge (not rebase) unless repo explicitly requires rebase
- If conflicts arise, resolve them carefully
- Ensure all tests pass after merge`;

    default:
      return `Perform ${action} on PR #${context.prNumber} "${context.title}".\n\nDescription:\n${context.description}`;
  }
}

/**
 * Build instruction for GitHub Copilot CLI
 */
export function buildCopilotInstruction(
  action: PrAction,
  context: {
    prNumber: number;
    title: string;
    failureDetails?: string;
    reviewComments?: string;
  },
): string {
  switch (action) {
    case "FIX_CI_FAILURE":
      return `Fix CI failures in PR #${context.prNumber}. Details: ${context.failureDetails}`;

    case "RESOLVE_CONFLICTS":
      return `Resolve merge conflicts in PR #${context.prNumber}`;

    case "ADDRESS_REVIEW_COMMENTS":
      return `Address review comments in PR #${context.prNumber}: ${context.reviewComments}`;

    default:
      return `Help with ${action} on PR #${context.prNumber}`;
  }
}

/**
 * Generate CLI command for browser clipboard
 */
export function generateCLICommand(invocation: AgentInvocation): string {
  const { agent, context, instruction, constraints } = invocation;

  switch (agent) {
    case "claude_code": {
      // Build command for Claude Code CLI
      const allowedTools = constraints?.allowedTools?.join(",") || "Read,Write,Edit,Bash,Grep,Glob";
      const timeout = constraints?.timeout || 600;

      return `# Claude Code CLI command (copy and run in your terminal)
cd "${context.repositoryNameWithOwner.split("/")[1]}" || git clone https://github.com/${context.repositoryNameWithOwner}.git
git checkout ${context.branch}
claude -p "${instruction.replace(/"/g, '\\"')}" \\
  --output-format json \\
  --allowedTools "${allowedTools}" \\
  --timeout ${timeout}`;
    }

    case "github_copilot": {
      return `# GitHub Copilot CLI command (copy and run in your terminal)
cd "${context.repositoryNameWithOwner.split("/")[1]}" || git clone https://github.com/${context.repositoryNameWithOwner}.git
git checkout ${context.branch}
gh copilot suggest "${instruction.replace(/"/g, '\\"')}"`;
    }

    case "custom": {
      return `# Custom agent command
# Repository: ${context.repositoryNameWithOwner}
# Branch: ${context.branch}
# PR: #${context.prNumber}
# Instruction: ${instruction}`;
    }

    default:
      return "";
  }
}

/**
 * Create agent invocation from automation decision
 */
export function createAgentInvocation(
  decision: AutomationDecision,
  prContext: {
    repositoryNameWithOwner: string;
    prNumber: number;
    title: string;
    branch: string;
    baseBranch: string;
    description: string;
    failureDetails?: string;
    reviewComments?: string;
    conflictFiles?: string[];
  },
  preferredAgent: AgentType = "claude_code",
): AgentInvocation | null {
  if (!decision.shouldDelegate || decision.delegationTarget !== "worktree_agent") {
    return null;
  }

  const instruction = buildClaudeCodeInstruction(decision.action, {
    prNumber: prContext.prNumber,
    title: prContext.title,
    description: prContext.description,
    failureDetails: prContext.failureDetails,
    reviewComments: prContext.reviewComments,
    conflictFiles: prContext.conflictFiles,
  });

  // Set constraints based on complexity and risk
  const constraints = {
    maxFiles: decision.estimatedRisk === "LOW" ? 10 : 5,
    maxChanges: decision.estimatedRisk === "LOW" ? 200 : 100,
    allowedTools:
      decision.estimatedRisk === "LOW"
        ? ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
        : ["Read", "Write", "Edit", "Grep", "Glob"], // No Bash for higher risk
    timeout: 600, // 10 minutes
  };

  return {
    agent: preferredAgent,
    action: decision.action,
    context: {
      repositoryNameWithOwner: prContext.repositoryNameWithOwner,
      prNumber: prContext.prNumber,
      branch: prContext.branch,
      baseBranch: prContext.baseBranch,
      description: prContext.description,
    },
    instruction,
    constraints,
  };
}

/**
 * WebSocket bridge for local agent communication
 * This would be implemented by a separate local service
 */
export interface AgentBridge {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  invoke(invocation: AgentInvocation): Promise<AgentResult>;
  isConnected(): boolean;
}

/**
 * Mock implementation for development/testing
 */
export class MockAgentBridge implements AgentBridge {
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
    console.log("Mock agent bridge connected");
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log("Mock agent bridge disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  async invoke(invocation: AgentInvocation): Promise<AgentResult> {
    // Simulate agent execution
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock successful result
    return {
      success: true,
      agent: invocation.agent,
      action: invocation.action,
      changes: {
        filesModified: ["src/example.ts", "src/example.test.ts"],
        additions: 10,
        deletions: 5,
        commitSha: "abc123",
      },
      output: `Successfully executed ${invocation.action}`,
      executionTime: 1000,
    };
  }
}

/**
 * Store for tracking agent invocations
 * This would integrate with React state management (Zustand)
 */
export interface AgentInvocationStore {
  invocations: Map<
    string,
    { invocation: AgentInvocation; result?: AgentResult; status: "pending" | "success" | "failed" }
  >;

  addInvocation(key: string, invocation: AgentInvocation): void;
  updateResult(key: string, result: AgentResult): void;
  getInvocation(key: string): AgentInvocation | undefined;
  getPendingInvocations(): Array<{ key: string; invocation: AgentInvocation }>;
}
