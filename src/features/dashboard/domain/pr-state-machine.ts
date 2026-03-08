import {
  Bucket,
  CheckState,
  MergeableState,
  PrCard,
  ReviewDecision,
} from "@/features/dashboard/types";

type CiStatus = "NO_RUNS" | "PASSING" | "FAILING" | "PENDING";

export function normalizeReviewDecision(value: string | null): ReviewDecision {
  if (
    value === "APPROVED" ||
    value === "CHANGES_REQUESTED" ||
    value === "REVIEW_REQUIRED"
  ) {
    return value;
  }
  return "null";
}

export function normalizeMergeable(value: string | null): MergeableState {
  if (value === "MERGEABLE" || value === "CONFLICTING" || value === "UNKNOWN") {
    return value;
  }
  return "UNKNOWN";
}

export function computeCiStatus(state: CheckState): CiStatus {
  if (!state) {
    return "NO_RUNS";
  }
  if (state === "FAILURE" || state === "ERROR" || state === "ACTION_REQUIRED") {
    return "FAILING";
  }
  if (state === "SUCCESS") {
    return "PASSING";
  }
  return "PENDING";
}

export function classifyPr(input: Omit<PrCard, "bucket">): Bucket {
  if (input.isDraft) {
    return "DRAFT";
  }
  if (input.mergeable === "CONFLICTING") {
    return "HAS_CONFLICTS";
  }
  if (input.reviewDecision === "CHANGES_REQUESTED") {
    return "CHANGES_REQUESTED";
  }

  const ci = computeCiStatus(input.statusCheckState);

  if (ci === "FAILING") {
    return "WAITING_ON_CI";
  }
  if (ci === "PENDING") {
    return "WAITING_ON_CI";
  }
  if (
    ci === "PASSING" &&
    (input.reviewDecision === "APPROVED" || input.reviewDecision === "null")
  ) {
    if (input.reviewThreads.unresolved > 0) {
      return "UNRESOLVED_THREADS";
    }
    return "READY_TO_MERGE";
  }
  if (input.reviewDecision === "REVIEW_REQUIRED") {
    return "NEEDS_REVIEW";
  }
  if (ci === "NO_RUNS") {
    if (input.reviewDecision === "APPROVED" || input.reviewDecision === "null") {
      if (input.reviewThreads.unresolved > 0) {
        return "UNRESOLVED_THREADS";
      }
      return "READY_TO_MERGE";
    }
    return "NEEDS_REVIEW";
  }
  return "OTHER";
}

export const BUCKET_META: Record<
  Bucket,
  { label: string; color: string; priority: number }
> = {
  READY_TO_MERGE: { label: "Ready to merge", color: "#3fb950", priority: 0 },
  WAITING_ON_CI: { label: "Waiting on CI", color: "#d29922", priority: 1 },
  NEEDS_REVIEW: { label: "Needs review", color: "#58a6ff", priority: 2 },
  CHANGES_REQUESTED: {
    label: "Changes requested",
    color: "#f85149",
    priority: 3,
  },
  UNRESOLVED_THREADS: {
    label: "Unresolved threads",
    color: "#d29922",
    priority: 4,
  },
  HAS_CONFLICTS: { label: "Has conflicts", color: "#f85149", priority: 5 },
  DRAFT: { label: "Draft", color: "#8b949e", priority: 6 },
  OTHER: { label: "Other", color: "#8b949e", priority: 7 },
};

export const BUCKET_ORDER: Bucket[] = [
  "READY_TO_MERGE",
  "WAITING_ON_CI",
  "NEEDS_REVIEW",
  "CHANGES_REQUESTED",
  "UNRESOLVED_THREADS",
  "HAS_CONFLICTS",
  "DRAFT",
  "OTHER",
];
