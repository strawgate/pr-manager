import { describe, expect, it } from "vitest";
import {
  determineDetailedState,
  mapBucketToStates,
  PR_STATE_MACHINE,
  type PrState,
} from "@/features/dashboard/domain/pr-state-transitions";

describe("mapBucketToStates", () => {
  it("maps DRAFT bucket to draft states", () => {
    const states = mapBucketToStates("DRAFT");
    expect(states).toContain("DRAFT_INITIAL");
    expect(states).toContain("DRAFT_IN_PROGRESS");
  });

  it("maps WAITING_ON_CI bucket to check states", () => {
    const states = mapBucketToStates("WAITING_ON_CI");
    expect(states).toContain("WAITING_FOR_CHECKS_INITIAL");
    expect(states).toContain("WAITING_FOR_CHECKS_RERUN");
    expect(states).toContain("CHECKS_FAILED");
  });

  it("maps NEEDS_REVIEW bucket to review states", () => {
    const states = mapBucketToStates("NEEDS_REVIEW");
    expect(states).toContain("CHECKS_PASSED_NO_REVIEW");
    expect(states).toContain("CHECKS_PASSED_AWAITING_REVIEW");
  });

  it("maps HAS_CONFLICTS bucket to conflict state", () => {
    const states = mapBucketToStates("HAS_CONFLICTS");
    expect(states).toContain("MERGE_CONFLICTS");
  });

  it("maps READY_TO_MERGE bucket to ready states", () => {
    const states = mapBucketToStates("READY_TO_MERGE");
    expect(states).toContain("READY_TO_MERGE");
    expect(states).toContain("UPDATE_BRANCH_REQUIRED");
  });
});

describe("determineDetailedState", () => {
  const baseContext = {
    isDraft: false,
    statusCheckState: "SUCCESS" as const,
    reviewDecision: "null" as const,
    mergeable: "MERGEABLE" as const,
    unresolvedThreads: 0,
    hasReviewers: true,
    updatedAt: new Date().toISOString(),
  };

  it("identifies stale PRs", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35); // 35 days ago

    const state = determineDetailedState("DRAFT", {
      ...baseContext,
      isDraft: true,
      updatedAt: oldDate.toISOString(),
    });

    expect(state).toBe("STALE");
  });

  it("identifies draft PRs", () => {
    const state = determineDetailedState("DRAFT", {
      ...baseContext,
      isDraft: true,
    });

    expect(state).toBe("DRAFT_IN_PROGRESS");
  });

  it("identifies merge conflicts", () => {
    const state = determineDetailedState("HAS_CONFLICTS", {
      ...baseContext,
      mergeable: "CONFLICTING",
    });

    expect(state).toBe("MERGE_CONFLICTS");
  });

  it("identifies changes requested", () => {
    const state = determineDetailedState("CHANGES_REQUESTED", {
      ...baseContext,
      reviewDecision: "CHANGES_REQUESTED",
    });

    expect(state).toBe("REVIEW_CHANGES_REQUESTED");
  });

  it("identifies unresolved threads", () => {
    const state = determineDetailedState("UNRESOLVED_THREADS", {
      ...baseContext,
      unresolvedThreads: 5,
    });

    expect(state).toBe("REVIEW_COMMENTS_UNRESOLVED");
  });

  it("identifies failed checks", () => {
    const state = determineDetailedState("WAITING_ON_CI", {
      ...baseContext,
      statusCheckState: "FAILURE",
    });

    expect(state).toBe("CHECKS_FAILED");
  });

  it("identifies approved with pending checks", () => {
    const state = determineDetailedState("WAITING_ON_CI", {
      ...baseContext,
      reviewDecision: "APPROVED",
      statusCheckState: "PENDING",
    });

    expect(state).toBe("REVIEW_APPROVED_CHECKS_PENDING");
  });

  it("identifies approved with passed checks", () => {
    const state = determineDetailedState("READY_TO_MERGE", {
      ...baseContext,
      reviewDecision: "APPROVED",
      statusCheckState: "SUCCESS",
    });

    expect(state).toBe("REVIEW_APPROVED_CHECKS_PASSED");
  });

  it("identifies pending checks", () => {
    const state = determineDetailedState("WAITING_ON_CI", {
      ...baseContext,
      statusCheckState: "PENDING",
    });

    expect(state).toBe("WAITING_FOR_CHECKS_INITIAL");
  });

  it("identifies passed checks without reviewers", () => {
    const state = determineDetailedState("NEEDS_REVIEW", {
      ...baseContext,
      statusCheckState: "SUCCESS",
      hasReviewers: false,
    });

    expect(state).toBe("CHECKS_PASSED_NO_REVIEW");
  });

  it("identifies awaiting review", () => {
    const state = determineDetailedState("NEEDS_REVIEW", {
      ...baseContext,
      statusCheckState: "SUCCESS",
      reviewDecision: "REVIEW_REQUIRED",
      hasReviewers: true,
    });

    expect(state).toBe("CHECKS_PASSED_AWAITING_REVIEW");
  });

  it("identifies ready to merge", () => {
    const state = determineDetailedState("READY_TO_MERGE", {
      ...baseContext,
      statusCheckState: "SUCCESS",
      reviewDecision: "null",
    });

    expect(state).toBe("READY_TO_MERGE");
  });
});

describe("PR_STATE_MACHINE", () => {
  it("defines all states", () => {
    const expectedStates: PrState[] = [
      "DRAFT_INITIAL",
      "DRAFT_IN_PROGRESS",
      "WAITING_FOR_CHECKS_INITIAL",
      "WAITING_FOR_CHECKS_RERUN",
      "CHECKS_FAILED",
      "CHECKS_PASSED_NO_REVIEW",
      "CHECKS_PASSED_AWAITING_REVIEW",
      "UNDER_REVIEW",
      "REVIEW_CHANGES_REQUESTED",
      "REVIEW_COMMENTS_UNRESOLVED",
      "REVIEW_APPROVED_CHECKS_PENDING",
      "REVIEW_APPROVED_CHECKS_FAILED",
      "REVIEW_APPROVED_CHECKS_PASSED",
      "UPDATE_BRANCH_REQUIRED",
      "MERGE_CONFLICTS",
      "READY_TO_MERGE",
      "MERGED",
      "CLOSED",
      "STALE",
    ];

    for (const state of expectedStates) {
      expect(PR_STATE_MACHINE[state]).toBeDefined();
      expect(PR_STATE_MACHINE[state].state).toBe(state);
    }
  });

  it("each state has valid structure", () => {
    for (const state of Object.keys(PR_STATE_MACHINE) as PrState[]) {
      const config = PR_STATE_MACHINE[state];

      expect(config.description).toBeDefined();
      expect(typeof config.description).toBe("string");

      expect(config.triggers).toBeDefined();
      expect(Array.isArray(config.triggers.fromStates)).toBe(true);
      expect(Array.isArray(config.triggers.conditions)).toBe(true);

      expect(Array.isArray(config.automatedActions)).toBe(true);
      expect(Array.isArray(config.maintainerFlags)).toBe(true);
      expect(Array.isArray(config.transitions)).toBe(true);
    }
  });

  it("CHECKS_FAILED has auto-fix actions", () => {
    const config = PR_STATE_MACHINE.CHECKS_FAILED;

    const autoFixAction = config.automatedActions.find((a) => a.action === "FIX_CI_FAILURE");
    expect(autoFixAction).toBeDefined();
    expect(autoFixAction?.requiresLLMDecision).toBe(true);
    expect(autoFixAction?.fallbackAction).toBe("POST_COMMENT");
  });

  it("MERGE_CONFLICTS has conflict resolution actions", () => {
    const config = PR_STATE_MACHINE.MERGE_CONFLICTS;

    const resolveAction = config.automatedActions.find((a) => a.action === "RESOLVE_CONFLICTS");
    expect(resolveAction).toBeDefined();
    expect(resolveAction?.requiresLLMDecision).toBe(true);
  });

  it("REVIEW_CHANGES_REQUESTED has address feedback actions", () => {
    const config = PR_STATE_MACHINE.REVIEW_CHANGES_REQUESTED;

    const addressAction = config.automatedActions.find(
      (a) => a.action === "ADDRESS_REVIEW_COMMENTS",
    );
    expect(addressAction).toBeDefined();
    expect(addressAction?.requiresLLMDecision).toBe(true);
  });

  it("READY_TO_MERGE has merge action", () => {
    const config = PR_STATE_MACHINE.READY_TO_MERGE;

    const mergeAction = config.automatedActions.find((a) => a.action === "MERGE");
    expect(mergeAction).toBeDefined();
    expect(mergeAction?.preconditions).toContain("Auto-merge enabled");
  });

  it("STALE has close action", () => {
    const config = PR_STATE_MACHINE.STALE;

    const closeAction = config.automatedActions.find((a) => a.action === "CLOSE");
    expect(closeAction).toBeDefined();
    expect(closeAction?.confidence).toBe("SUGGEST");
  });

  it("terminal states have no transitions", () => {
    expect(PR_STATE_MACHINE.MERGED.transitions).toHaveLength(0);
    expect(PR_STATE_MACHINE.CLOSED.transitions).toHaveLength(0);
  });

  it("all transitions reference valid states", () => {
    const validStates = Object.keys(PR_STATE_MACHINE) as PrState[];

    for (const state of validStates) {
      const config = PR_STATE_MACHINE[state];

      for (const transition of config.transitions) {
        expect(validStates).toContain(transition.toState);
      }

      for (const fromState of config.triggers.fromStates) {
        expect(validStates).toContain(fromState);
      }
    }
  });
});
