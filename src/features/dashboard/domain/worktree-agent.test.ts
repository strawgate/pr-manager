import { describe, expect, it } from "vitest";
import type { AutomationDecision } from "@/features/dashboard/domain/automation-engine";
import {
  buildClaudeCodeInstruction,
  buildCopilotInstruction,
  createAgentInvocation,
  generateCLICommand,
  MockAgentBridge,
} from "@/features/dashboard/domain/worktree-agent";

describe("buildClaudeCodeInstruction", () => {
  const baseContext = {
    prNumber: 123,
    title: "Fix authentication bug",
    description: "This PR fixes the auth issue",
  };

  it("builds instruction for fixing CI failures", () => {
    const instruction = buildClaudeCodeInstruction("FIX_CI_FAILURE", {
      ...baseContext,
      failureDetails: "Lint errors: unused imports, missing semicolons",
    });

    expect(instruction).toContain("Fix CI failures");
    expect(instruction).toContain("PR #123");
    expect(instruction).toContain("Lint errors");
    expect(instruction).toContain("fix: address CI failures");
  });

  it("builds instruction for resolving conflicts", () => {
    const instruction = buildClaudeCodeInstruction("RESOLVE_CONFLICTS", {
      ...baseContext,
      conflictFiles: ["package-lock.json", "src/auth.ts"],
    });

    expect(instruction).toContain("Resolve merge conflicts");
    expect(instruction).toContain("package-lock.json");
    expect(instruction).toContain("src/auth.ts");
    expect(instruction).toContain("fix: resolve merge conflicts");
  });

  it("builds instruction for addressing review comments", () => {
    const instruction = buildClaudeCodeInstruction("ADDRESS_REVIEW_COMMENTS", {
      ...baseContext,
      reviewComments: "Please rename variable 'foo' to 'userId'",
    });

    expect(instruction).toContain("Address review feedback");
    expect(instruction).toContain("rename variable");
    expect(instruction).toContain("fix: address review feedback");
  });

  it("builds instruction for updating branch", () => {
    const instruction = buildClaudeCodeInstruction("UPDATE_BRANCH", {
      ...baseContext,
    });

    expect(instruction).toContain("Update PR #123");
    expect(instruction).toContain("base branch");
    expect(instruction).toContain("Merge base branch into PR branch");
  });

  it("builds generic instruction for unknown actions", () => {
    const instruction = buildClaudeCodeInstruction("POST_COMMENT", {
      ...baseContext,
    });

    expect(instruction).toContain("POST_COMMENT");
    expect(instruction).toContain("PR #123");
  });
});

describe("buildCopilotInstruction", () => {
  const baseContext = {
    prNumber: 456,
    title: "Add new feature",
  };

  it("builds instruction for fixing CI failures", () => {
    const instruction = buildCopilotInstruction("FIX_CI_FAILURE", {
      ...baseContext,
      failureDetails: "Test failures in auth.test.ts",
    });

    expect(instruction).toContain("Fix CI failures");
    expect(instruction).toContain("PR #456");
    expect(instruction).toContain("Test failures");
  });

  it("builds instruction for resolving conflicts", () => {
    const instruction = buildCopilotInstruction("RESOLVE_CONFLICTS", {
      ...baseContext,
    });

    expect(instruction).toContain("Resolve merge conflicts");
    expect(instruction).toContain("PR #456");
  });
});

describe("generateCLICommand", () => {
  const baseInvocation = {
    agent: "claude_code" as const,
    action: "FIX_CI_FAILURE" as const,
    context: {
      repositoryNameWithOwner: "owner/repo",
      prNumber: 123,
      branch: "feature-branch",
      baseBranch: "main",
      description: "Fix CI",
    },
    instruction: "Fix lint errors",
  };

  it("generates Claude Code CLI command", () => {
    const command = generateCLICommand(baseInvocation);

    expect(command).toContain("claude -p");
    expect(command).toContain("Fix lint errors");
    expect(command).toContain("--output-format json");
    expect(command).toContain("--allowedTools");
    expect(command).toContain("git checkout feature-branch");
  });

  it("includes constraints in Claude Code command", () => {
    const command = generateCLICommand({
      ...baseInvocation,
      constraints: {
        allowedTools: ["Read", "Write", "Edit"],
        timeout: 300,
      },
    });

    expect(command).toContain('--allowedTools "Read,Write,Edit"');
    expect(command).toContain("--timeout 300");
  });

  it("generates GitHub Copilot CLI command", () => {
    const command = generateCLICommand({
      ...baseInvocation,
      agent: "github_copilot",
    });

    expect(command).toContain("gh copilot suggest");
    expect(command).toContain("Fix lint errors");
    expect(command).toContain("git checkout feature-branch");
  });

  it("generates custom agent command", () => {
    const command = generateCLICommand({
      ...baseInvocation,
      agent: "custom",
    });

    expect(command).toContain("Custom agent command");
    expect(command).toContain("owner/repo");
    expect(command).toContain("feature-branch");
    expect(command).toContain("#123");
  });

  it("escapes quotes in instruction", () => {
    const command = generateCLICommand({
      ...baseInvocation,
      instruction: 'Fix "authentication" bug',
    });

    expect(command).toContain('\\"authentication\\"');
  });
});

describe("createAgentInvocation", () => {
  const basePrContext = {
    repositoryNameWithOwner: "owner/repo",
    prNumber: 123,
    title: "Fix bug",
    branch: "fix-bug",
    baseBranch: "main",
    description: "This fixes the bug",
  };

  it("creates invocation for delegated actions", () => {
    const decision: AutomationDecision = {
      action: "FIX_CI_FAILURE",
      confidence: "SUGGEST",
      reasoning: "Auto-fixable lint errors",
      shouldDelegate: true,
      delegationTarget: "worktree_agent",
      estimatedRisk: "LOW",
      requiresApproval: true,
    };

    const invocation = createAgentInvocation(
      decision,
      {
        ...basePrContext,
        failureDetails: "Lint errors",
      },
      "claude_code",
    );

    expect(invocation).toBeDefined();
    expect(invocation?.agent).toBe("claude_code");
    expect(invocation?.action).toBe("FIX_CI_FAILURE");
    expect(invocation?.instruction).toContain("Fix CI failures");
    expect(invocation?.constraints).toBeDefined();
  });

  it("returns null for non-delegated actions", () => {
    const decision: AutomationDecision = {
      action: "POST_COMMENT",
      confidence: "AUTO",
      reasoning: "Just posting a comment",
      shouldDelegate: false,
      estimatedRisk: "LOW",
      requiresApproval: false,
    };

    const invocation = createAgentInvocation(decision, basePrContext);

    expect(invocation).toBeNull();
  });

  it("returns null for non-worktree delegation", () => {
    const decision: AutomationDecision = {
      action: "MERGE",
      confidence: "SUGGEST",
      reasoning: "Ready to merge",
      shouldDelegate: true,
      delegationTarget: "maintainer",
      estimatedRisk: "MEDIUM",
      requiresApproval: true,
    };

    const invocation = createAgentInvocation(decision, basePrContext);

    expect(invocation).toBeNull();
  });

  it("sets stricter constraints for higher risk", () => {
    const lowRiskDecision: AutomationDecision = {
      action: "FIX_CI_FAILURE",
      confidence: "AUTO",
      reasoning: "Simple fix",
      shouldDelegate: true,
      delegationTarget: "worktree_agent",
      estimatedRisk: "LOW",
      requiresApproval: false,
    };

    const highRiskDecision: AutomationDecision = {
      action: "RESOLVE_CONFLICTS",
      confidence: "SUGGEST",
      reasoning: "Complex conflicts",
      shouldDelegate: true,
      delegationTarget: "worktree_agent",
      estimatedRisk: "MEDIUM",
      requiresApproval: true,
    };

    const lowRiskInvocation = createAgentInvocation(lowRiskDecision, basePrContext);
    const highRiskInvocation = createAgentInvocation(highRiskDecision, basePrContext);

    expect(lowRiskInvocation?.constraints?.maxFiles).toBeGreaterThan(
      highRiskInvocation?.constraints?.maxFiles || 0,
    );
    expect(lowRiskInvocation?.constraints?.maxChanges).toBeGreaterThan(
      highRiskInvocation?.constraints?.maxChanges || 0,
    );
  });

  it("includes failure details in context", () => {
    const decision: AutomationDecision = {
      action: "FIX_CI_FAILURE",
      confidence: "SUGGEST",
      reasoning: "Auto-fixable",
      shouldDelegate: true,
      delegationTarget: "worktree_agent",
      estimatedRisk: "LOW",
      requiresApproval: true,
    };

    const invocation = createAgentInvocation(decision, {
      ...basePrContext,
      failureDetails: "ESLint errors: unused variables",
    });

    expect(invocation?.instruction).toContain("ESLint errors");
  });
});

describe("MockAgentBridge", () => {
  it("connects and disconnects", async () => {
    const bridge = new MockAgentBridge();

    expect(bridge.isConnected()).toBe(false);

    await bridge.connect();
    expect(bridge.isConnected()).toBe(true);

    await bridge.disconnect();
    expect(bridge.isConnected()).toBe(false);
  });

  it("executes invocations", async () => {
    const bridge = new MockAgentBridge();
    await bridge.connect();

    const invocation = {
      agent: "claude_code" as const,
      action: "FIX_CI_FAILURE" as const,
      context: {
        repositoryNameWithOwner: "owner/repo",
        prNumber: 123,
        branch: "feature",
        baseBranch: "main",
        description: "Fix",
      },
      instruction: "Fix lint errors",
    };

    const result = await bridge.invoke(invocation);

    expect(result.success).toBe(true);
    expect(result.agent).toBe("claude_code");
    expect(result.action).toBe("FIX_CI_FAILURE");
    expect(result.changes).toBeDefined();
    expect(result.changes?.filesModified).toHaveLength(2);
    expect(result.output).toBeDefined();
  });

  it("simulates execution time", async () => {
    const bridge = new MockAgentBridge();
    await bridge.connect();

    const invocation = {
      agent: "claude_code" as const,
      action: "UPDATE_BRANCH" as const,
      context: {
        repositoryNameWithOwner: "owner/repo",
        prNumber: 123,
        branch: "feature",
        baseBranch: "main",
        description: "Update",
      },
      instruction: "Update branch",
    };

    const start = Date.now();
    const result = await bridge.invoke(invocation);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(1000); // At least 1 second
    expect(result.executionTime).toBe(1000);
  });
});
