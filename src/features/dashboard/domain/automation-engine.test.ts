import { describe, expect, it } from "vitest";
import {
  assessComplexity,
  decideAutomation,
  generateDecisionPrompt,
} from "@/features/dashboard/domain/automation-engine";
import type { AutomationDecisionFactors } from "@/features/dashboard/domain/pr-state-transitions";

describe("assessComplexity", () => {
  it("classifies trivial changes", () => {
    expect(
      assessComplexity({
        additions: 5,
        deletions: 3,
        files: 1,
      }),
    ).toBe("TRIVIAL");
  });

  it("classifies simple changes", () => {
    expect(
      assessComplexity({
        additions: 30,
        deletions: 15,
        files: 3,
      }),
    ).toBe("SIMPLE");
  });

  it("classifies moderate changes", () => {
    expect(
      assessComplexity({
        additions: 100,
        deletions: 50,
        files: 10,
      }),
    ).toBe("MODERATE");
  });

  it("classifies complex changes", () => {
    expect(
      assessComplexity({
        additions: 300,
        deletions: 200,
        files: 20,
      }),
    ).toBe("CRITICAL");
  });

  it("classifies critical changes", () => {
    expect(
      assessComplexity({
        additions: 600,
        deletions: 400,
        files: 40,
      }),
    ).toBe("CRITICAL");
  });

  it("always classifies critical files as CRITICAL", () => {
    expect(
      assessComplexity({
        additions: 5,
        deletions: 3,
        files: 1,
        criticalFiles: true,
      }),
    ).toBe("CRITICAL");
  });
});

describe("decideAutomation", () => {
  const baseFactors: AutomationDecisionFactors = {
    stateTransition: { from: "CHECKS_FAILED", to: "WAITING_FOR_CHECKS_RERUN" },
    complexityLevel: "SIMPLE",
    changeSize: { additions: 30, deletions: 15, files: 3 },
  };

  describe("FIX_CI_FAILURE", () => {
    it("auto-fixes simple lint errors", () => {
      const decision = decideAutomation("FIX_CI_FAILURE", "CHECKS_FAILED", {
        ...baseFactors,
        complexityLevel: "TRIVIAL",
        failurePattern: {
          type: "CI_FAILURE",
          details: "Lint errors detected",
          errorMessages: ["eslint: unused import 'React'", "prettier: formatting issues"],
        },
      });

      expect(decision.confidence).toBe("AUTO");
      expect(decision.shouldDelegate).toBe(true);
      expect(decision.delegationTarget).toBe("worktree_agent");
      expect(decision.estimatedRisk).toBe("LOW");
    });

    it("suggests fix for simple changes with auto-fixable errors", () => {
      const decision = decideAutomation("FIX_CI_FAILURE", "CHECKS_FAILED", {
        ...baseFactors,
        complexityLevel: "SIMPLE",
        failurePattern: {
          type: "CI_FAILURE",
          details: "Format check failed",
          errorMessages: ["prettier check failed"],
        },
      });

      expect(decision.confidence).toBe("AUTO");
      expect(decision.shouldDelegate).toBe(true);
      expect(decision.requiresApproval).toBe(false);
    });

    it("flags complex CI failures for manual review", () => {
      const decision = decideAutomation("FIX_CI_FAILURE", "CHECKS_FAILED", {
        ...baseFactors,
        complexityLevel: "COMPLEX",
        failurePattern: {
          type: "CI_FAILURE",
          details: "Test failures",
          errorMessages: ["TypeError: Cannot read property 'x' of undefined"],
        },
      });

      expect(decision.action).toBe("POST_COMMENT");
      expect(decision.confidence).toBe("AUTO");
      expect(decision.delegationTarget).toBe("author");
    });

    it("never auto-fixes critical complexity", () => {
      const decision = decideAutomation("FIX_CI_FAILURE", "CHECKS_FAILED", {
        ...baseFactors,
        complexityLevel: "CRITICAL",
        failurePattern: {
          type: "CI_FAILURE",
          details: "Lint errors",
          errorMessages: ["eslint errors"],
        },
      });

      expect(decision.action).toBe("POST_COMMENT");
      expect(decision.shouldDelegate).toBe(false);
    });
  });

  describe("RESOLVE_CONFLICTS", () => {
    it("suggests resolving lock file conflicts", () => {
      const decision = decideAutomation("RESOLVE_CONFLICTS", "MERGE_CONFLICTS", {
        ...baseFactors,
        complexityLevel: "SIMPLE",
        failurePattern: {
          type: "MERGE_CONFLICT",
          details: "package-lock.json",
        },
      });

      expect(decision.confidence).toBe("SUGGEST");
      expect(decision.shouldDelegate).toBe(true);
      expect(decision.delegationTarget).toBe("worktree_agent");
    });

    it("suggests single file conflict in simple PRs", () => {
      const decision = decideAutomation("RESOLVE_CONFLICTS", "MERGE_CONFLICTS", {
        ...baseFactors,
        complexityLevel: "SIMPLE",
        failurePattern: {
          type: "MERGE_CONFLICT",
          details: "src/config.ts",
        },
      });

      expect(decision.confidence).toBe("SUGGEST");
      expect(decision.requiresApproval).toBe(true);
    });

    it("flags complex conflicts for manual resolution", () => {
      const decision = decideAutomation("RESOLVE_CONFLICTS", "MERGE_CONFLICTS", {
        ...baseFactors,
        complexityLevel: "COMPLEX",
        failurePattern: {
          type: "MERGE_CONFLICT",
          details: "src/a.ts,src/b.ts,src/c.ts,src/d.ts",
        },
      });

      expect(decision.action).toBe("POST_COMMENT");
      expect(decision.delegationTarget).toBe("author");
    });
  });

  describe("ADDRESS_REVIEW_COMMENTS", () => {
    it("auto-addresses trivial feedback like typos", () => {
      const decision = decideAutomation("ADDRESS_REVIEW_COMMENTS", "REVIEW_CHANGES_REQUESTED", {
        ...baseFactors,
        complexityLevel: "TRIVIAL",
        failurePattern: {
          type: "REVIEW_FEEDBACK",
          details: "Please fix typo in comment",
        },
      });

      expect(decision.confidence).toBe("AUTO");
      expect(decision.shouldDelegate).toBe(true);
      expect(decision.estimatedRisk).toBe("LOW");
    });

    it("suggests addressing simple feedback", () => {
      const decision = decideAutomation("ADDRESS_REVIEW_COMMENTS", "REVIEW_CHANGES_REQUESTED", {
        ...baseFactors,
        complexityLevel: "SIMPLE",
        failurePattern: {
          type: "REVIEW_FEEDBACK",
          details: "Rename variable foo to bar",
        },
      });

      expect(decision.confidence).toBe("SUGGEST");
      expect(decision.requiresApproval).toBe(true);
    });

    it("delegates complex feedback to author", () => {
      const decision = decideAutomation("ADDRESS_REVIEW_COMMENTS", "REVIEW_CHANGES_REQUESTED", {
        ...baseFactors,
        complexityLevel: "COMPLEX",
        failurePattern: {
          type: "REVIEW_FEEDBACK",
          details: "Please refactor this to use dependency injection",
        },
      });

      expect(decision.action).toBe("POST_COMMENT");
      expect(decision.delegationTarget).toBe("author");
    });
  });

  describe("UPDATE_BRANCH", () => {
    it("auto-updates for non-critical PRs", () => {
      const decision = decideAutomation("UPDATE_BRANCH", "UPDATE_BRANCH_REQUIRED", {
        ...baseFactors,
        complexityLevel: "SIMPLE",
      });

      expect(decision.confidence).toBe("AUTO");
      expect(decision.shouldDelegate).toBe(true);
      expect(decision.estimatedRisk).toBe("LOW");
    });

    it("suggests update for critical complexity", () => {
      const decision = decideAutomation("UPDATE_BRANCH", "UPDATE_BRANCH_REQUIRED", {
        ...baseFactors,
        complexityLevel: "CRITICAL",
      });

      expect(decision.confidence).toBe("SUGGEST");
      expect(decision.requiresApproval).toBe(true);
    });
  });

  describe("MERGE", () => {
    it("auto-merges trivial ready PRs", () => {
      const decision = decideAutomation("MERGE", "READY_TO_MERGE", {
        ...baseFactors,
        complexityLevel: "TRIVIAL",
      });

      expect(decision.confidence).toBe("AUTO");
      expect(decision.estimatedRisk).toBe("LOW");
    });

    it("suggests merge for non-trivial PRs", () => {
      const decision = decideAutomation("MERGE", "READY_TO_MERGE", {
        ...baseFactors,
        complexityLevel: "SIMPLE",
      });

      expect(decision.confidence).toBe("SUGGEST");
      expect(decision.delegationTarget).toBe("maintainer");
    });
  });

  describe("low-risk actions", () => {
    it("auto-approves comments and notifications", () => {
      const actions = [
        "POST_COMMENT",
        "NOTIFY_AUTHOR",
        "NOTIFY_REVIEWERS",
        "ASSIGN_LABEL",
      ] as const;

      for (const action of actions) {
        const decision = decideAutomation(action, "CHECKS_FAILED", baseFactors);
        expect(decision.confidence).toBe("AUTO");
        expect(decision.estimatedRisk).toBe("LOW");
      }
    });
  });

  describe("REQUEST_REVIEW", () => {
    it("suggests reviewer assignment", () => {
      const decision = decideAutomation("REQUEST_REVIEW", "CHECKS_PASSED_NO_REVIEW", baseFactors);

      expect(decision.confidence).toBe("SUGGEST");
      expect(decision.estimatedRisk).toBe("LOW");
      expect(decision.requiresApproval).toBe(true);
    });
  });

  describe("CLOSE", () => {
    it("suggests closing stale PRs", () => {
      const decision = decideAutomation("CLOSE", "STALE", baseFactors);

      expect(decision.confidence).toBe("SUGGEST");
      expect(decision.delegationTarget).toBe("maintainer");
    });

    it("flags closing active PRs", () => {
      const decision = decideAutomation("CLOSE", "CHECKS_FAILED", baseFactors);

      expect(decision.confidence).toBe("FLAG");
      expect(decision.delegationTarget).toBe("maintainer");
    });
  });
});

describe("generateDecisionPrompt", () => {
  it("generates valid LLM prompt for CI failure", () => {
    const prompt = generateDecisionPrompt("FIX_CI_FAILURE", "CHECKS_FAILED", {
      stateTransition: { from: "CHECKS_FAILED", to: "WAITING_FOR_CHECKS_RERUN" },
      complexityLevel: "SIMPLE",
      changeSize: { additions: 30, deletions: 15, files: 3 },
      failurePattern: {
        type: "CI_FAILURE",
        details: "Lint errors",
        errorMessages: ["eslint: unused import"],
      },
    });

    expect(prompt).toContain("FIX_CI_FAILURE");
    expect(prompt).toContain("CHECKS_FAILED");
    expect(prompt).toContain("SIMPLE");
    expect(prompt).toContain("eslint: unused import");
    expect(prompt).toContain("JSON format");
  });

  it("generates prompt without failure pattern", () => {
    const prompt = generateDecisionPrompt("UPDATE_BRANCH", "UPDATE_BRANCH_REQUIRED", {
      stateTransition: { from: "REVIEW_APPROVED_CHECKS_PASSED", to: "UPDATE_BRANCH_REQUIRED" },
      complexityLevel: "MODERATE",
      changeSize: { additions: 100, deletions: 50, files: 10 },
    });

    expect(prompt).toContain("UPDATE_BRANCH");
    expect(prompt).toContain("MODERATE");
    expect(prompt).not.toContain("Failure Pattern");
  });
});
