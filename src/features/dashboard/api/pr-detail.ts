import { createGithubClient } from "@/lib/github-client";

const PR_DETAIL_QUERY = `
query PrDetail($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      body
      bodyHTML
      createdAt
      updatedAt
      state
      baseRefName
      headRefName
      author { login avatarUrl }
      labels(first: 20) {
        nodes { name color }
      }
      comments(first: 100) {
        totalCount
        nodes {
          author { login avatarUrl }
          body
          createdAt
          url
        }
      }
      reviews(first: 50) {
        totalCount
        nodes {
          author { login avatarUrl }
          state
          body
          submittedAt
          url
          comments(first: 20) {
            totalCount
            nodes {
              path
              body
              createdAt
              diffHunk
            }
          }
        }
      }
      reviewThreads(first: 100) {
        totalCount
        nodes {
          isResolved
          comments(first: 10) {
            nodes {
              author { login }
              body
              createdAt
              path
              url
            }
          }
        }
      }
      timelineItems(first: 100, itemTypes: [
        PULL_REQUEST_COMMIT
        MERGED_EVENT
        CLOSED_EVENT
        REOPENED_EVENT
        REVIEW_REQUESTED_EVENT
        READY_FOR_REVIEW_EVENT
        CONVERT_TO_DRAFT_EVENT
        LABELED_EVENT
        UNLABELED_EVENT
        RENAMED_TITLE_EVENT
        HEAD_REF_FORCE_PUSHED_EVENT
        BASE_REF_FORCE_PUSHED_EVENT
      ]) {
        totalCount
        nodes {
          __typename
          ... on PullRequestCommit {
            commit {
              oid
              messageHeadline
              committedDate
              author { user { login } }
            }
          }
          ... on MergedEvent {
            createdAt
            actor { login }
            mergeRefName
          }
          ... on ClosedEvent {
            createdAt
            actor { login }
          }
          ... on ReopenedEvent {
            createdAt
            actor { login }
          }
          ... on ReviewRequestedEvent {
            createdAt
            actor { login }
            requestedReviewer {
              ... on User { login }
              ... on Team { name }
            }
          }
          ... on ReadyForReviewEvent {
            createdAt
            actor { login }
          }
          ... on ConvertToDraftEvent {
            createdAt
            actor { login }
          }
          ... on LabeledEvent {
            createdAt
            actor { login }
            label { name color }
          }
          ... on UnlabeledEvent {
            createdAt
            actor { login }
            label { name color }
          }
          ... on RenamedTitleEvent {
            createdAt
            actor { login }
            previousTitle
            currentTitle
          }
          ... on HeadRefForcePushedEvent {
            createdAt
            actor { login }
          }
          ... on BaseRefForcePushedEvent {
            createdAt
            actor { login }
          }
        }
      }
    }
  }
}
`;

export type PrComment = {
  author: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
  url: string;
};

export type PrReview = {
  author: string;
  avatarUrl: string;
  state: string;
  body: string;
  submittedAt: string;
  url: string;
  commentCount: number;
};

export type PrReviewThread = {
  isResolved: boolean;
  comments: Array<{
    author: string;
    body: string;
    createdAt: string;
    path: string;
    url: string;
  }>;
};

export type TimelineEvent = {
  type: string;
  createdAt: string;
  actor: string;
  detail: string;
};

export type PrDetail = {
  body: string;
  bodyHTML: string;
  createdAt: string;
  updatedAt: string;
  state: string;
  baseRefName: string;
  headRefName: string;
  author: string;
  authorAvatarUrl: string;
  labels: Array<{ name: string; color: string }>;
  comments: PrComment[];
  commentCount: number;
  reviews: PrReview[];
  reviewCount: number;
  reviewThreads: PrReviewThread[];
  reviewThreadCount: number;
  timeline: TimelineEvent[];
  timelineCount: number;
};

type RawGraphqlResult = {
  repository: {
    pullRequest: {
      body: string;
      bodyHTML: string;
      createdAt: string;
      updatedAt: string;
      state: string;
      baseRefName: string;
      headRefName: string;
      author: { login: string; avatarUrl: string } | null;
      labels: { nodes: Array<{ name: string; color: string }> } | null;
      comments: {
        totalCount: number;
        nodes: Array<{
          author: { login: string; avatarUrl: string } | null;
          body: string;
          createdAt: string;
          url: string;
        }>;
      };
      reviews: {
        totalCount: number;
        nodes: Array<{
          author: { login: string; avatarUrl: string } | null;
          state: string;
          body: string;
          submittedAt: string;
          url: string;
          comments: { totalCount: number };
        }>;
      };
      reviewThreads: {
        totalCount: number;
        nodes: Array<{
          isResolved: boolean;
          comments: {
            nodes: Array<{
              author: { login: string } | null;
              body: string;
              createdAt: string;
              path: string;
              url: string;
            }>;
          };
        }>;
      };
      timelineItems: {
        totalCount: number;
        nodes: Array<Record<string, unknown>>;
      };
    };
  };
};

function mapTimelineEvent(node: Record<string, unknown>): TimelineEvent {
  const type = (node.__typename as string) ?? "Unknown";
  const actorObj = node.actor as { login?: string } | null;

  let createdAt = (node.createdAt as string) ?? "";
  let actor = actorObj?.login ?? "";

  let detail = "";
  switch (type) {
    case "PullRequestCommit": {
      const commit = node.commit as {
        oid?: string;
        messageHeadline?: string;
        committedDate?: string;
        author?: { user?: { login?: string } | null };
      } | null;
      createdAt = commit?.committedDate ?? "";
      actor = commit?.author?.user?.login ?? "";
      detail = commit?.messageHeadline ?? "";
      break;
    }
    case "MergedEvent":
      detail = `Merged into ${(node.mergeRefName as string) ?? ""}`;
      break;
    case "ClosedEvent":
      detail = "Closed";
      break;
    case "ReopenedEvent":
      detail = "Reopened";
      break;
    case "ReviewRequestedEvent": {
      const reviewer = node.requestedReviewer as {
        login?: string;
        name?: string;
      } | null;
      detail = `Requested review from ${reviewer?.login ?? reviewer?.name ?? "unknown"}`;
      break;
    }
    case "ReadyForReviewEvent":
      detail = "Marked ready for review";
      break;
    case "ConvertToDraftEvent":
      detail = "Converted to draft";
      break;
    case "LabeledEvent": {
      const label = node.label as { name: string } | null;
      detail = `Added label "${label?.name ?? ""}"`;
      break;
    }
    case "UnlabeledEvent": {
      const label = node.label as { name: string } | null;
      detail = `Removed label "${label?.name ?? ""}"`;
      break;
    }
    case "RenamedTitleEvent":
      detail = `Renamed from "${node.previousTitle}" to "${node.currentTitle}"`;
      break;
    case "HeadRefForcePushedEvent":
      detail = "Force-pushed head branch";
      break;
    case "BaseRefForcePushedEvent":
      detail = "Force-pushed base branch";
      break;
  }

  return { type, createdAt, actor, detail };
}

export async function fetchPrDetail(
  token: string,
  repositoryNameWithOwner: string,
  number: number,
): Promise<PrDetail> {
  const [owner, repo] = repositoryNameWithOwner.split("/");
  if (!owner || !repo) {
    throw new Error("Missing repository owner/name");
  }

  const octokit = createGithubClient(token);
  const result = await octokit.graphql<RawGraphqlResult>(PR_DETAIL_QUERY, {
    owner,
    repo,
    number,
  });

  const pr = result.repository.pullRequest;

  return {
    body: pr.body,
    bodyHTML: pr.bodyHTML,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    state: pr.state,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    author: pr.author?.login ?? "unknown",
    authorAvatarUrl: pr.author?.avatarUrl ?? "",
    labels: pr.labels?.nodes ?? [],
    comments: pr.comments.nodes.map((c) => ({
      author: c.author?.login ?? "unknown",
      avatarUrl: c.author?.avatarUrl ?? "",
      body: c.body,
      createdAt: c.createdAt,
      url: c.url,
    })),
    commentCount: pr.comments.totalCount,
    reviews: pr.reviews.nodes.map((r) => ({
      author: r.author?.login ?? "unknown",
      avatarUrl: r.author?.avatarUrl ?? "",
      state: r.state,
      body: r.body,
      submittedAt: r.submittedAt,
      url: r.url,
      commentCount: r.comments.totalCount,
    })),
    reviewCount: pr.reviews.totalCount,
    reviewThreads: pr.reviewThreads.nodes.map((t) => ({
      isResolved: t.isResolved,
      comments: t.comments.nodes.map((c) => ({
        author: c.author?.login ?? "unknown",
        body: c.body,
        createdAt: c.createdAt,
        path: c.path,
        url: c.url,
      })),
    })),
    reviewThreadCount: pr.reviewThreads.totalCount,
    timeline: pr.timelineItems.nodes.map(mapTimelineEvent),
    timelineCount: pr.timelineItems.totalCount,
  };
}
