import { describe, expect, it } from "vitest";
import type { DashboardGraphqlData } from "@/features/dashboard/api/github-query";
import { mapDashboardData } from "@/features/dashboard/api/map-dashboard-data";

function makePrNode(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: "Update dependencies",
    url: "https://github.com/org/repo/pull/42",
    repository: { nameWithOwner: "org/repo" },
    headRefName: "deps-update",
    isDraft: false,
    createdAt: "2026-03-01T10:00:00Z",
    updatedAt: "2026-03-07T22:00:00Z",
    mergeable: "MERGEABLE",
    reviewDecision: "APPROVED",
    additions: 20,
    deletions: 5,
    changedFiles: 3,
    author: { login: "dependabot[bot]" },
    labels: { nodes: [{ name: "dependencies", color: "0366d6" }] },
    reviewRequests: { nodes: [] },
    reviewThreads: { totalCount: 2, nodes: [{ isResolved: true }, { isResolved: false }] },
    commits: {
      nodes: [
        {
          commit: {
            author: { user: { login: "dependabot[bot]" } },
            status: { state: "SUCCESS" },
          },
        },
      ],
    },
    ...overrides,
  };
}

function makeData(
  overrides: Partial<{
    authored: unknown[];
    assigned: unknown[];
  }> = {},
): DashboardGraphqlData {
  return {
    authored: { nodes: overrides.authored ?? [] },
    assigned: { nodes: overrides.assigned ?? [] },
    viewer: { login: "bill" },
    rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-03-08T00:00:00Z" },
  };
}

describe("mapDashboardData", () => {
  it("deduplicates PRs across buckets and tracks sources", () => {
    const pr = makePrNode();
    const result = mapDashboardData(makeData({ authored: [pr], assigned: [pr] }));
    expect(result.prs).toHaveLength(1);
    expect(result.prs[0]?.sources).toContain("authored");
    expect(result.prs[0]?.sources).toContain("assigned");
  });

  it("maps labels and review threads", () => {
    const result = mapDashboardData(makeData({ authored: [makePrNode()] }));
    const pr = result.prs[0];
    expect(pr).toBeDefined();
    expect(pr.labels).toHaveLength(1);
    expect(pr.labels[0]?.name).toBe("dependencies");
    expect(pr.reviewThreads.total).toBe(2);
    expect(pr.reviewThreads.unresolved).toBe(1);
  });

  it("maps diff stats", () => {
    const result = mapDashboardData(makeData({ authored: [makePrNode()] }));
    expect(result.prs[0]?.additions).toBe(20);
    expect(result.prs[0]?.deletions).toBe(5);
    expect(result.prs[0]?.changedFiles).toBe(3);
  });

  it("classifies waiting-on-CI correctly", () => {
    const pr = makePrNode({
      reviewDecision: "APPROVED",
      commits: {
        nodes: [
          {
            commit: {
              author: { user: { login: "dependabot[bot]" } },
              status: { state: "PENDING" },
            },
          },
        ],
      },
    });
    const result = mapDashboardData(makeData({ authored: [pr] }));
    expect(result.prs[0]?.bucket).toBe("WAITING_ON_CI");
  });
});
