/**
 * PR State Machine: Comprehensive mapping of all PR states, transitions, and automation opportunities
 *
 * This module defines the complete state space of a PR from creation to merge/close,
 * including automated responses and manual intervention points.
 */

import type {
  Bucket,
  CheckState,
  MergeableState,
  ReviewDecision,
} from "@/features/dashboard/types";

/**
 * Fine-grained PR states - more detailed than buckets for automation purposes
 */
export type PrState =
  // Draft phase
  | "DRAFT_INITIAL" // Just created as draft
  | "DRAFT_IN_PROGRESS" // Being worked on

  // Pre-review phase
  | "WAITING_FOR_CHECKS_INITIAL" // Checks running for first time
  | "WAITING_FOR_CHECKS_RERUN" // Checks running after changes
  | "CHECKS_FAILED" // CI failed
  | "CHECKS_PASSED_NO_REVIEW" // CI passed, no reviewers assigned
  | "CHECKS_PASSED_AWAITING_REVIEW" // CI passed, awaiting review

  // Review phase
  | "UNDER_REVIEW" // Review in progress
  | "REVIEW_CHANGES_REQUESTED" // Reviewer requested changes
  | "REVIEW_COMMENTS_UNRESOLVED" // Has unresolved review threads
  | "REVIEW_APPROVED_CHECKS_PENDING" // Approved but checks running
  | "REVIEW_APPROVED_CHECKS_FAILED" // Approved but checks failed
  | "REVIEW_APPROVED_CHECKS_PASSED" // Approved and checks passed

  // Merge preparation phase
  | "UPDATE_BRANCH_REQUIRED" // Base branch ahead, needs update
  | "MERGE_CONFLICTS" // Has merge conflicts
  | "READY_TO_MERGE" // All conditions met

  // Terminal states
  | "MERGED" // Successfully merged
  | "CLOSED" // Closed without merging
  | "STALE"; // No activity for long time

/**
 * Automation confidence levels - determines if we auto-act or flag for maintainer
 */
export type AutomationConfidence =
  | "AUTO" // Fully automate
  | "SUGGEST" // Suggest action, wait for approval
  | "FLAG" // Flag for manual review
  | "MANUAL"; // Always manual

/**
 * Action types that can be taken on a PR
 */
export type PrAction =
  | "POST_COMMENT" // Add a comment
  | "REQUEST_REVIEW" // Request review from specific users/teams
  | "UPDATE_BRANCH" // Merge base branch into PR
  | "RESOLVE_CONFLICTS" // Auto-fix merge conflicts via worktree agent
  | "FIX_CI_FAILURE" // Auto-fix CI failures via worktree agent
  | "ADDRESS_REVIEW_COMMENTS" // Auto-address review feedback via worktree agent
  | "MARK_READY" // Convert from draft to ready
  | "MERGE" // Merge the PR
  | "CLOSE" // Close the PR
  | "ASSIGN_LABEL" // Add/remove labels
  | "RERUN_CHECKS" // Trigger CI rerun
  | "NOTIFY_AUTHOR" // Notify PR author
  | "NOTIFY_REVIEWERS" // Notify reviewers
  | "ESCALATE"; // Escalate to maintainer

/**
 * Complexity assessment for determining automation strategy
 */
export type ComplexityLevel = "TRIVIAL" | "SIMPLE" | "MODERATE" | "COMPLEX" | "CRITICAL";

/**
 * Decision factors for LLM-based automation delegation
 */
export interface AutomationDecisionFactors {
  stateTransition: { from: PrState; to: PrState };
  complexityLevel: ComplexityLevel;
  changeSize: { additions: number; deletions: number; files: number };
  failurePattern?: {
    type: "CI_FAILURE" | "MERGE_CONFLICT" | "REVIEW_FEEDBACK";
    details: string;
    errorMessages?: string[];
  };
  historicalSuccess?: {
    similarIssuesAutoFixed: number;
    similarIssuesRequiredManual: number;
  };
}

/**
 * Automated response configuration for each state
 */
export interface StateAutomationConfig {
  state: PrState;
  description: string;

  // Triggers that cause transition to this state
  triggers: {
    fromStates: PrState[];
    conditions: string[];
  };

  // Actions that can be automated
  automatedActions: {
    action: PrAction;
    confidence: AutomationConfidence;
    description: string;
    preconditions?: string[];
    // If LLM should decide whether to automate
    requiresLLMDecision?: boolean;
    // Fallback if automation fails
    fallbackAction?: PrAction;
  }[];

  // What to flag for maintainer attention
  maintainerFlags: {
    condition: string;
    message: string;
    urgency: "LOW" | "MEDIUM" | "HIGH";
  }[];

  // Next possible states
  transitions: {
    toState: PrState;
    trigger: string;
    automated: boolean;
  }[];
}

/**
 * Complete state machine configuration
 */
export const PR_STATE_MACHINE: Record<PrState, StateAutomationConfig> = {
  DRAFT_INITIAL: {
    state: "DRAFT_INITIAL",
    description: "PR just created as draft",
    triggers: {
      fromStates: [],
      conditions: ["PR created with isDraft=true"],
    },
    automatedActions: [
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Welcome message with draft workflow tips",
      },
    ],
    maintainerFlags: [],
    transitions: [
      { toState: "DRAFT_IN_PROGRESS", trigger: "Commits pushed", automated: true },
      { toState: "CHECKS_PASSED_NO_REVIEW", trigger: "Marked ready for review", automated: false },
    ],
  },

  DRAFT_IN_PROGRESS: {
    state: "DRAFT_IN_PROGRESS",
    description: "Draft PR being actively worked on",
    triggers: {
      fromStates: ["DRAFT_INITIAL"],
      conditions: ["New commits while in draft"],
    },
    automatedActions: [
      {
        action: "POST_COMMENT",
        confidence: "SUGGEST",
        description: "Suggest marking ready when CI passes",
        preconditions: ["Draft has passing CI", "More than 3 commits"],
      },
    ],
    maintainerFlags: [
      {
        condition: "Draft open > 14 days with no commits",
        message: "Stale draft - consider closing or prodding author",
        urgency: "LOW",
      },
    ],
    transitions: [
      { toState: "CHECKS_PASSED_NO_REVIEW", trigger: "Marked ready for review", automated: false },
      { toState: "CLOSED", trigger: "Author closes", automated: false },
    ],
  },

  WAITING_FOR_CHECKS_INITIAL: {
    state: "WAITING_FOR_CHECKS_INITIAL",
    description: "First CI run in progress",
    triggers: {
      fromStates: ["DRAFT_IN_PROGRESS", "CHECKS_PASSED_NO_REVIEW"],
      conditions: ["statusCheckState=PENDING or IN_PROGRESS"],
    },
    automatedActions: [
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Status update on check progress",
        preconditions: ["Checks running > 10 minutes"],
      },
    ],
    maintainerFlags: [
      {
        condition: "Checks running > 1 hour",
        message: "CI taking unusually long - may be stuck",
        urgency: "MEDIUM",
      },
    ],
    transitions: [
      { toState: "CHECKS_PASSED_NO_REVIEW", trigger: "All checks pass", automated: true },
      { toState: "CHECKS_FAILED", trigger: "Any check fails", automated: true },
    ],
  },

  WAITING_FOR_CHECKS_RERUN: {
    state: "WAITING_FOR_CHECKS_RERUN",
    description: "CI rerunning after changes",
    triggers: {
      fromStates: ["CHECKS_FAILED", "REVIEW_CHANGES_REQUESTED"],
      conditions: ["New commits pushed", "Checks manually rerun"],
    },
    automatedActions: [],
    maintainerFlags: [
      {
        condition: "Failed > 3 times in a row",
        message: "Repeated CI failures - may need maintainer help",
        urgency: "MEDIUM",
      },
    ],
    transitions: [
      { toState: "CHECKS_PASSED_AWAITING_REVIEW", trigger: "All checks pass", automated: true },
      { toState: "CHECKS_FAILED", trigger: "Any check fails", automated: true },
    ],
  },

  CHECKS_FAILED: {
    state: "CHECKS_FAILED",
    description: "CI checks failed",
    triggers: {
      fromStates: ["WAITING_FOR_CHECKS_INITIAL", "WAITING_FOR_CHECKS_RERUN"],
      conditions: ["statusCheckState=FAILURE or ERROR"],
    },
    automatedActions: [
      {
        action: "FIX_CI_FAILURE",
        confidence: "SUGGEST",
        description: "Auto-fix common CI failures (lint, format, simple test fixes)",
        requiresLLMDecision: true,
        fallbackAction: "POST_COMMENT",
      },
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Comment with failure summary and suggested fixes",
      },
      {
        action: "NOTIFY_AUTHOR",
        confidence: "AUTO",
        description: "Notify author of CI failure",
      },
    ],
    maintainerFlags: [
      {
        condition: "CI failure in infrastructure/config files",
        message: "CI failure in critical infrastructure - needs maintainer review",
        urgency: "HIGH",
      },
      {
        condition: "Failed > 5 times",
        message: "Persistent CI failures - may indicate deeper issue",
        urgency: "HIGH",
      },
    ],
    transitions: [
      { toState: "WAITING_FOR_CHECKS_RERUN", trigger: "New commits pushed", automated: true },
      { toState: "WAITING_FOR_CHECKS_RERUN", trigger: "Checks rerun", automated: false },
      { toState: "CLOSED", trigger: "Author gives up", automated: false },
    ],
  },

  CHECKS_PASSED_NO_REVIEW: {
    state: "CHECKS_PASSED_NO_REVIEW",
    description: "CI passed but no reviewers assigned",
    triggers: {
      fromStates: ["WAITING_FOR_CHECKS_INITIAL", "DRAFT_INITIAL"],
      conditions: ["statusCheckState=SUCCESS", "No reviewers assigned"],
    },
    automatedActions: [
      {
        action: "REQUEST_REVIEW",
        confidence: "SUGGEST",
        description: "Auto-assign reviewers based on CODEOWNERS or past reviews",
        requiresLLMDecision: true,
      },
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Prompt author to request reviewers",
      },
    ],
    maintainerFlags: [
      {
        condition: "High-risk changes (>500 lines or in critical paths)",
        message: "Large PR needs reviewer assignment",
        urgency: "MEDIUM",
      },
    ],
    transitions: [
      { toState: "CHECKS_PASSED_AWAITING_REVIEW", trigger: "Reviewers assigned", automated: false },
      {
        toState: "READY_TO_MERGE",
        trigger: "Auto-merge enabled, all checks pass",
        automated: true,
      },
    ],
  },

  CHECKS_PASSED_AWAITING_REVIEW: {
    state: "CHECKS_PASSED_AWAITING_REVIEW",
    description: "CI passed, awaiting review",
    triggers: {
      fromStates: ["CHECKS_PASSED_NO_REVIEW", "WAITING_FOR_CHECKS_RERUN"],
      conditions: ["statusCheckState=SUCCESS", "Reviewers assigned", "No review submitted"],
    },
    automatedActions: [
      {
        action: "NOTIFY_REVIEWERS",
        confidence: "AUTO",
        description: "Ping reviewers if no response after 24h",
        preconditions: ["Waiting > 24 hours"],
      },
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Status update for waiting on review",
        preconditions: ["Waiting > 48 hours"],
      },
    ],
    maintainerFlags: [
      {
        condition: "Waiting > 7 days",
        message: "Review bottleneck - may need to reassign reviewers",
        urgency: "MEDIUM",
      },
      {
        condition: "Blocking other PRs",
        message: "Blocking PR needs review urgently",
        urgency: "HIGH",
      },
    ],
    transitions: [
      { toState: "UNDER_REVIEW", trigger: "Reviewer starts review", automated: true },
      { toState: "REVIEW_APPROVED_CHECKS_PASSED", trigger: "Approved", automated: true },
      { toState: "REVIEW_CHANGES_REQUESTED", trigger: "Changes requested", automated: true },
    ],
  },

  UNDER_REVIEW: {
    state: "UNDER_REVIEW",
    description: "Review in progress",
    triggers: {
      fromStates: ["CHECKS_PASSED_AWAITING_REVIEW"],
      conditions: ["Review started but not submitted"],
    },
    automatedActions: [],
    maintainerFlags: [],
    transitions: [
      { toState: "REVIEW_APPROVED_CHECKS_PASSED", trigger: "Approved", automated: true },
      { toState: "REVIEW_CHANGES_REQUESTED", trigger: "Changes requested", automated: true },
      { toState: "REVIEW_COMMENTS_UNRESOLVED", trigger: "Comments added", automated: true },
    ],
  },

  REVIEW_CHANGES_REQUESTED: {
    state: "REVIEW_CHANGES_REQUESTED",
    description: "Reviewer requested changes",
    triggers: {
      fromStates: ["UNDER_REVIEW", "CHECKS_PASSED_AWAITING_REVIEW"],
      conditions: ["reviewDecision=CHANGES_REQUESTED"],
    },
    automatedActions: [
      {
        action: "ADDRESS_REVIEW_COMMENTS",
        confidence: "SUGGEST",
        description: "Auto-address simple review feedback (formatting, simple refactors)",
        requiresLLMDecision: true,
        fallbackAction: "POST_COMMENT",
      },
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Summarize requested changes for author",
      },
      {
        action: "NOTIFY_AUTHOR",
        confidence: "AUTO",
        description: "Notify author of requested changes",
      },
    ],
    maintainerFlags: [
      {
        condition: "Review feedback contradicts previous reviews",
        message: "Conflicting review feedback - maintainer should align reviewers",
        urgency: "MEDIUM",
      },
      {
        condition: "Blocked > 7 days on requested changes",
        message: "Author may need help addressing feedback",
        urgency: "MEDIUM",
      },
    ],
    transitions: [
      { toState: "WAITING_FOR_CHECKS_RERUN", trigger: "Author pushes changes", automated: true },
      {
        toState: "REVIEW_COMMENTS_UNRESOLVED",
        trigger: "Author responds to comments",
        automated: true,
      },
    ],
  },

  REVIEW_COMMENTS_UNRESOLVED: {
    state: "REVIEW_COMMENTS_UNRESOLVED",
    description: "Has unresolved review comment threads",
    triggers: {
      fromStates: ["UNDER_REVIEW", "REVIEW_CHANGES_REQUESTED"],
      conditions: ["reviewThreads.unresolved > 0"],
    },
    automatedActions: [
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Remind to resolve threads before merge",
      },
    ],
    maintainerFlags: [
      {
        condition: "Unresolved threads > 10",
        message: "Many unresolved threads - may need discussion sync",
        urgency: "MEDIUM",
      },
    ],
    transitions: [
      {
        toState: "REVIEW_APPROVED_CHECKS_PASSED",
        trigger: "All threads resolved, approved",
        automated: true,
      },
      { toState: "WAITING_FOR_CHECKS_RERUN", trigger: "New commits pushed", automated: true },
    ],
  },

  REVIEW_APPROVED_CHECKS_PENDING: {
    state: "REVIEW_APPROVED_CHECKS_PENDING",
    description: "Approved but checks running",
    triggers: {
      fromStates: ["REVIEW_APPROVED_CHECKS_PASSED"],
      conditions: ["reviewDecision=APPROVED", "statusCheckState=PENDING"],
    },
    automatedActions: [],
    maintainerFlags: [],
    transitions: [
      { toState: "REVIEW_APPROVED_CHECKS_PASSED", trigger: "Checks pass", automated: true },
      { toState: "REVIEW_APPROVED_CHECKS_FAILED", trigger: "Checks fail", automated: true },
    ],
  },

  REVIEW_APPROVED_CHECKS_FAILED: {
    state: "REVIEW_APPROVED_CHECKS_FAILED",
    description: "Approved but checks failed",
    triggers: {
      fromStates: ["REVIEW_APPROVED_CHECKS_PENDING"],
      conditions: ["reviewDecision=APPROVED", "statusCheckState=FAILURE"],
    },
    automatedActions: [
      {
        action: "FIX_CI_FAILURE",
        confidence: "AUTO",
        description: "Auto-fix since already approved (low risk)",
        requiresLLMDecision: true,
        preconditions: ["Simple lint/format failures"],
      },
      {
        action: "NOTIFY_AUTHOR",
        confidence: "AUTO",
        description: "Notify that quick fix needed",
      },
    ],
    maintainerFlags: [
      {
        condition: "Test failures after approval",
        message: "Tests failing after approval - may need re-review",
        urgency: "HIGH",
      },
    ],
    transitions: [
      {
        toState: "REVIEW_APPROVED_CHECKS_PASSED",
        trigger: "Checks fixed and pass",
        automated: true,
      },
      {
        toState: "REVIEW_CHANGES_REQUESTED",
        trigger: "Reviewer revokes approval",
        automated: true,
      },
    ],
  },

  REVIEW_APPROVED_CHECKS_PASSED: {
    state: "REVIEW_APPROVED_CHECKS_PASSED",
    description: "Approved and all checks passed",
    triggers: {
      fromStates: ["UNDER_REVIEW", "REVIEW_APPROVED_CHECKS_PENDING", "REVIEW_COMMENTS_UNRESOLVED"],
      conditions: [
        "reviewDecision=APPROVED",
        "statusCheckState=SUCCESS",
        "reviewThreads.unresolved=0",
      ],
    },
    automatedActions: [
      {
        action: "UPDATE_BRANCH",
        confidence: "AUTO",
        description: "Auto-update branch if behind base",
        preconditions: ["Branch protection requires up-to-date branch"],
      },
    ],
    maintainerFlags: [],
    transitions: [
      { toState: "READY_TO_MERGE", trigger: "Branch up to date", automated: true },
      { toState: "UPDATE_BRANCH_REQUIRED", trigger: "Base branch ahead", automated: true },
      { toState: "MERGE_CONFLICTS", trigger: "Conflicts detected", automated: true },
    ],
  },

  UPDATE_BRANCH_REQUIRED: {
    state: "UPDATE_BRANCH_REQUIRED",
    description: "Base branch is ahead, needs update",
    triggers: {
      fromStates: ["REVIEW_APPROVED_CHECKS_PASSED"],
      conditions: ["Base branch has new commits", "Branch protection requires up-to-date"],
    },
    automatedActions: [
      {
        action: "UPDATE_BRANCH",
        confidence: "AUTO",
        description: "Merge base into PR branch",
        requiresLLMDecision: false,
      },
    ],
    maintainerFlags: [
      {
        condition: "Update causes conflicts",
        message: "Branch update caused conflicts",
        urgency: "MEDIUM",
      },
    ],
    transitions: [
      {
        toState: "REVIEW_APPROVED_CHECKS_PENDING",
        trigger: "Branch updated, checks rerun",
        automated: true,
      },
      { toState: "MERGE_CONFLICTS", trigger: "Update caused conflicts", automated: true },
    ],
  },

  MERGE_CONFLICTS: {
    state: "MERGE_CONFLICTS",
    description: "Has merge conflicts with base",
    triggers: {
      fromStates: ["UPDATE_BRANCH_REQUIRED", "REVIEW_APPROVED_CHECKS_PASSED"],
      conditions: ["mergeable=CONFLICTING"],
    },
    automatedActions: [
      {
        action: "RESOLVE_CONFLICTS",
        confidence: "SUGGEST",
        description: "Auto-resolve conflicts via worktree CLI agent",
        requiresLLMDecision: true,
        fallbackAction: "POST_COMMENT",
      },
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Comment with conflict details and resolution help",
      },
      {
        action: "NOTIFY_AUTHOR",
        confidence: "AUTO",
        description: "Notify author of conflicts",
      },
    ],
    maintainerFlags: [
      {
        condition: "Conflicts in >5 files",
        message: "Complex conflicts - may need manual resolution",
        urgency: "HIGH",
      },
      {
        condition: "Conflicts in migration or schema files",
        message: "Critical file conflicts - manual resolution required",
        urgency: "HIGH",
      },
    ],
    transitions: [
      { toState: "WAITING_FOR_CHECKS_RERUN", trigger: "Conflicts resolved", automated: true },
      { toState: "CLOSED", trigger: "Author closes due to conflicts", automated: false },
    ],
  },

  READY_TO_MERGE: {
    state: "READY_TO_MERGE",
    description: "All conditions met, ready to merge",
    triggers: {
      fromStates: ["REVIEW_APPROVED_CHECKS_PASSED", "CHECKS_PASSED_NO_REVIEW"],
      conditions: ["All merge requirements satisfied"],
    },
    automatedActions: [
      {
        action: "MERGE",
        confidence: "AUTO",
        description: "Auto-merge if enabled in repo settings",
        preconditions: ["Auto-merge enabled", "No blocking labels"],
      },
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Notify ready to merge",
      },
      {
        action: "NOTIFY_AUTHOR",
        confidence: "AUTO",
        description: "Notify author PR is ready",
      },
    ],
    maintainerFlags: [
      {
        condition: "Ready > 7 days but not merged",
        message: "Ready PR not being merged - check if waiting for something",
        urgency: "LOW",
      },
    ],
    transitions: [
      { toState: "MERGED", trigger: "Merged", automated: false },
      {
        toState: "MERGE_CONFLICTS",
        trigger: "New commits in base cause conflicts",
        automated: true,
      },
    ],
  },

  MERGED: {
    state: "MERGED",
    description: "Successfully merged",
    triggers: {
      fromStates: ["READY_TO_MERGE"],
      conditions: ["PR merged"],
    },
    automatedActions: [
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Thank contributors and link to deployment",
      },
      {
        action: "ASSIGN_LABEL",
        confidence: "AUTO",
        description: "Add merged labels, remove in-progress labels",
      },
    ],
    maintainerFlags: [],
    transitions: [],
  },

  CLOSED: {
    state: "CLOSED",
    description: "Closed without merging",
    triggers: {
      fromStates: ["DRAFT_IN_PROGRESS", "CHECKS_FAILED", "MERGE_CONFLICTS", "STALE"],
      conditions: ["PR closed without merge"],
    },
    automatedActions: [
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Comment asking for closure reason if not provided",
      },
    ],
    maintainerFlags: [],
    transitions: [],
  },

  STALE: {
    state: "STALE",
    description: "No activity for extended period",
    triggers: {
      fromStates: ["DRAFT_IN_PROGRESS", "CHECKS_FAILED", "REVIEW_CHANGES_REQUESTED"],
      conditions: ["No activity > 30 days"],
    },
    automatedActions: [
      {
        action: "POST_COMMENT",
        confidence: "AUTO",
        description: "Warn about staleness, ask if should close",
      },
      {
        action: "ASSIGN_LABEL",
        confidence: "AUTO",
        description: "Add 'stale' label",
      },
      {
        action: "CLOSE",
        confidence: "SUGGEST",
        description: "Auto-close after warning period",
        preconditions: ["No response to stale warning after 7 days"],
      },
    ],
    maintainerFlags: [
      {
        condition: "Stale but has approvals",
        message: "Approved PR went stale - may be important",
        urgency: "MEDIUM",
      },
    ],
    transitions: [
      { toState: "CLOSED", trigger: "Auto-closed due to staleness", automated: true },
      { toState: "WAITING_FOR_CHECKS_RERUN", trigger: "Author resumes work", automated: true },
    ],
  },
};

/**
 * Map from bucket classification to detailed states
 */
export function mapBucketToStates(bucket: Bucket): PrState[] {
  const mapping: Record<Bucket, PrState[]> = {
    DRAFT: ["DRAFT_INITIAL", "DRAFT_IN_PROGRESS"],
    WAITING_ON_CI: [
      "WAITING_FOR_CHECKS_INITIAL",
      "WAITING_FOR_CHECKS_RERUN",
      "CHECKS_FAILED",
      "REVIEW_APPROVED_CHECKS_PENDING",
      "REVIEW_APPROVED_CHECKS_FAILED",
    ],
    NEEDS_REVIEW: ["CHECKS_PASSED_NO_REVIEW", "CHECKS_PASSED_AWAITING_REVIEW", "UNDER_REVIEW"],
    CHANGES_REQUESTED: ["REVIEW_CHANGES_REQUESTED"],
    UNRESOLVED_THREADS: ["REVIEW_COMMENTS_UNRESOLVED"],
    HAS_CONFLICTS: ["MERGE_CONFLICTS"],
    READY_TO_MERGE: ["READY_TO_MERGE", "UPDATE_BRANCH_REQUIRED"],
    OTHER: ["STALE", "CLOSED", "MERGED"],
  };
  return mapping[bucket] || [];
}

/**
 * Determine specific state from bucket and additional context
 */
export function determineDetailedState(
  bucket: Bucket,
  context: {
    isDraft: boolean;
    statusCheckState: CheckState;
    reviewDecision: ReviewDecision;
    mergeable: MergeableState;
    unresolvedThreads: number;
    hasReviewers: boolean;
    updatedAt: string;
  },
): PrState {
  // Handle merged/closed separately (would need additional data)
  const daysSinceUpdate =
    (Date.now() - new Date(context.updatedAt).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceUpdate > 30) {
    return "STALE";
  }

  // Draft states
  if (context.isDraft) {
    return "DRAFT_IN_PROGRESS";
  }

  // Conflict states
  if (context.mergeable === "CONFLICTING") {
    return "MERGE_CONFLICTS";
  }

  // Review states
  if (context.reviewDecision === "CHANGES_REQUESTED") {
    return "REVIEW_CHANGES_REQUESTED";
  }

  if (context.unresolvedThreads > 0) {
    return "REVIEW_COMMENTS_UNRESOLVED";
  }

  // Check states
  const isCheckPending =
    context.statusCheckState === "PENDING" || context.statusCheckState === "IN_PROGRESS";
  const isCheckFailed =
    context.statusCheckState === "FAILURE" || context.statusCheckState === "ERROR";
  const isCheckPassed = context.statusCheckState === "SUCCESS";

  if (isCheckFailed) {
    return "CHECKS_FAILED";
  }

  if (context.reviewDecision === "APPROVED") {
    if (isCheckPending) {
      return "REVIEW_APPROVED_CHECKS_PENDING";
    }
    if (isCheckPassed) {
      return "REVIEW_APPROVED_CHECKS_PASSED";
    }
  }

  if (isCheckPending) {
    return "WAITING_FOR_CHECKS_INITIAL";
  }

  if (isCheckPassed) {
    if (!context.hasReviewers) {
      return "CHECKS_PASSED_NO_REVIEW";
    }
    if (context.reviewDecision === "REVIEW_REQUIRED") {
      return "CHECKS_PASSED_AWAITING_REVIEW";
    }
  }

  // Ready to merge
  if (bucket === "READY_TO_MERGE") {
    return "READY_TO_MERGE";
  }

  return "STALE";
}
