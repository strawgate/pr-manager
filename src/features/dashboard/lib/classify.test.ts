import { describe, expect, it } from "vitest";
import {
  classifyPr,
  normalizeMergeable,
  normalizeReviewDecision,
} from "@/features/dashboard/domain/pr-state-machine";
import type { PrCard } from "@/features/dashboard/types";

function makeBase(overrides: Partial<Omit<PrCard, "bucket">> = {}): Omit<PrCard, "bucket"> {
  return {
    number: 1,
    title: "Test PR",
    url: "https://github.com/org/repo/pull/1",
    repositoryNameWithOwner: "org/repo",
    headRefName: "feature-branch",
    author: "someone",
    isDraft: false,
    mergeable: "MERGEABLE",
    reviewDecision: "null",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusCheckState: "SUCCESS",
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    labels: [],
    reviewThreads: { total: 0, unresolved: 0 },
    sources: ["authored"],
    ...overrides,
  };
}

describe("normalize helpers", () => {
  it("normalizes unexpected review values to null", () => {
    expect(normalizeReviewDecision("SOMETHING_ELSE")).toBe("null");
    expect(normalizeReviewDecision(null)).toBe("null");
  });

  it("normalizes unexpected mergeable values to UNKNOWN", () => {
    expect(normalizeMergeable("NOT_REAL")).toBe("UNKNOWN");
    expect(normalizeMergeable(null)).toBe("UNKNOWN");
  });
});

describe("classifyPr", () => {
  it("classifies ready-to-merge PRs (passing CI, approved or no review required)", () => {
    expect(classifyPr(makeBase())).toBe("READY_TO_MERGE");
    expect(classifyPr(makeBase({ reviewDecision: "APPROVED" }))).toBe("READY_TO_MERGE");
  });

  it("classifies failing CI as waiting on CI", () => {
    expect(classifyPr(makeBase({ statusCheckState: "FAILURE" }))).toBe("WAITING_ON_CI");
    expect(classifyPr(makeBase({ statusCheckState: "ERROR" }))).toBe("WAITING_ON_CI");
    expect(classifyPr(makeBase({ statusCheckState: "ACTION_REQUIRED" }))).toBe("WAITING_ON_CI");
  });

  it("classifies pending CI as waiting on CI", () => {
    expect(classifyPr(makeBase({ statusCheckState: "PENDING" }))).toBe("WAITING_ON_CI");
    expect(classifyPr(makeBase({ statusCheckState: "IN_PROGRESS" }))).toBe("WAITING_ON_CI");
  });

  it("classifies drafts", () => {
    expect(classifyPr(makeBase({ isDraft: true }))).toBe("DRAFT");
  });

  it("classifies conflicting PRs", () => {
    expect(classifyPr(makeBase({ mergeable: "CONFLICTING" }))).toBe("HAS_CONFLICTS");
  });

  it("classifies changes requested", () => {
    expect(classifyPr(makeBase({ reviewDecision: "CHANGES_REQUESTED" }))).toBe("CHANGES_REQUESTED");
  });

  it("classifies needs review", () => {
    expect(classifyPr(makeBase({ reviewDecision: "REVIEW_REQUIRED" }))).toBe("NEEDS_REVIEW");
  });

  it("classifies unresolved threads even when CI passes and approved", () => {
    expect(
      classifyPr(
        makeBase({
          reviewDecision: "APPROVED",
          statusCheckState: "SUCCESS",
          reviewThreads: { total: 3, unresolved: 1 },
        }),
      ),
    ).toBe("UNRESOLVED_THREADS");
  });

  it("classifies as ready to merge when all threads are resolved", () => {
    expect(
      classifyPr(
        makeBase({
          reviewDecision: "APPROVED",
          statusCheckState: "SUCCESS",
          reviewThreads: { total: 3, unresolved: 0 },
        }),
      ),
    ).toBe("READY_TO_MERGE");
  });
});
