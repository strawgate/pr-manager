export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "null";

export type MergeableState = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

export type CheckState =
  | "SUCCESS"
  | "FAILURE"
  | "ERROR"
  | "ACTION_REQUIRED"
  | "PENDING"
  | "IN_PROGRESS"
  | "EXPECTED"
  | null;

export type Bucket =
  | "READY_TO_MERGE"
  | "WAITING_ON_CI"
  | "NEEDS_REVIEW"
  | "CHANGES_REQUESTED"
  | "UNRESOLVED_THREADS"
  | "HAS_CONFLICTS"
  | "DRAFT"
  | "OTHER";

export type PrSource = "authored" | "assigned";

export type LabelInfo = {
  name: string;
  color: string;
};

export type PrCard = {
  number: number;
  title: string;
  url: string;
  repositoryNameWithOwner: string;
  headRefName: string;
  author: string;
  isDraft: boolean;
  mergeable: MergeableState;
  reviewDecision: ReviewDecision;
  createdAt: string;
  updatedAt: string;
  statusCheckState: CheckState;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: LabelInfo[];
  reviewThreads: { total: number; unresolved: number };
  sources: PrSource[];
  bucket: Bucket;
};
