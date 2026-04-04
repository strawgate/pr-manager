import type { DashboardGraphqlData } from "@/features/dashboard/api/github-query";
import {
  classifyPr,
  normalizeMergeable,
  normalizeReviewDecision,
} from "@/features/dashboard/domain/pr-state-machine";
import type { LabelInfo, PrCard, PrSource } from "@/features/dashboard/types";

type RawPr = {
  number: number;
  title: string;
  url: string;
  repository?: { nameWithOwner: string } | null;
  headRefName?: string | null;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  mergeable: string | null;
  reviewDecision: string | null;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  author: { login: string } | null;
  labels?: { nodes: Array<{ name: string; color: string }> } | null;
  reviewRequests?: {
    nodes: Array<{
      requestedReviewer?: { login?: string; name?: string } | null;
    }>;
  };
  reviewThreads?: {
    totalCount?: number;
    nodes?: Array<{ isResolved?: boolean }>;
  } | null;
  commits?: {
    nodes: Array<{
      commit?: {
        author?: { user?: { login?: string | null } | null } | null;
        status?: { state?: string | null } | null;
      } | null;
    }>;
  };
};

export type DashboardResult = {
  prs: PrCard[];
  viewer: string;
  rateLimit: { cost: number; remaining: number; resetAt: string };
};

function asRawPr(node: unknown): RawPr | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const maybe = node as Partial<RawPr>;
  if (typeof maybe.number !== "number" || typeof maybe.title !== "string") {
    return null;
  }
  return maybe as RawPr;
}

function normalizeCheckState(value: string | null | undefined) {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (
    upper === "SUCCESS" ||
    upper === "FAILURE" ||
    upper === "ERROR" ||
    upper === "ACTION_REQUIRED" ||
    upper === "PENDING" ||
    upper === "IN_PROGRESS" ||
    upper === "EXPECTED"
  ) {
    return upper as NonNullable<PrCard["statusCheckState"]>;
  }
  return null;
}

function mapSinglePr(pr: RawPr): Omit<PrCard, "bucket" | "sources"> {
  const latestCommit = pr.commits?.nodes?.[0]?.commit;
  const status = normalizeCheckState(latestCommit?.status?.state ?? null);
  const labels: LabelInfo[] =
    pr.labels?.nodes?.map((l) => ({ name: l.name, color: l.color })) ?? [];

  const totalThreads = pr.reviewThreads?.totalCount ?? 0;
  const resolvedThreads = pr.reviewThreads?.nodes?.filter((t) => t.isResolved).length ?? 0;

  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    repositoryNameWithOwner: pr.repository?.nameWithOwner ?? "",
    headRefName: pr.headRefName ?? "",
    author: pr.author?.login ?? "unknown",
    isDraft: pr.isDraft,
    mergeable: normalizeMergeable(pr.mergeable),
    reviewDecision: normalizeReviewDecision(pr.reviewDecision),
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    statusCheckState: status,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changedFiles: pr.changedFiles ?? 0,
    labels,
    reviewThreads: {
      total: totalThreads,
      unresolved: totalThreads - resolvedThreads,
    },
  };
}

export function mapDashboardData(data: DashboardGraphqlData): DashboardResult {
  const bucketNodes: Array<{ source: PrSource; nodes: unknown[] }> = [
    { source: "authored", nodes: data.authored.nodes },
    { source: "assigned", nodes: data.assigned.nodes },
  ];

  const byRepoAndNumber = new Map<
    string,
    { base: Omit<PrCard, "bucket" | "sources">; sources: Set<PrSource> }
  >();

  for (const { source, nodes } of bucketNodes) {
    for (const node of nodes) {
      const raw = asRawPr(node);
      if (!raw) continue;

      const repo = raw.repository?.nameWithOwner ?? "";
      const key = `${repo}:${raw.number}`;
      const existing = byRepoAndNumber.get(key);
      if (existing) {
        existing.sources.add(source);
      } else {
        byRepoAndNumber.set(key, {
          base: mapSinglePr(raw),
          sources: new Set([source]),
        });
      }
    }
  }

  const prs: PrCard[] = [];
  for (const { base, sources } of byRepoAndNumber.values()) {
    const withSources = { ...base, sources: [...sources] };
    prs.push({
      ...withSources,
      bucket: classifyPr(withSources),
    });
  }

  prs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return {
    prs,
    viewer: data.viewer.login,
    rateLimit: data.rateLimit,
  };
}
