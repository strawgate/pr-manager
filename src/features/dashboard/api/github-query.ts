import { createGithubClient } from "@/lib/github-client";

const SEARCH_QUERY = `
query PRDashboard($first: Int = 30) {
  authored: search(
    query: "is:pr is:open author:@me archived:false sort:updated-desc"
    type: ISSUE
    first: $first
  ) { ...SearchResult }
  assigned: search(
    query: "is:pr is:open assignee:@me archived:false sort:updated-desc"
    type: ISSUE
    first: $first
  ) { ...SearchResult }
  viewer { login }
  rateLimit { cost remaining resetAt }
}

fragment SearchResult on SearchResultItemConnection {
  nodes {
    ... on PullRequest {
      number
      title
      url
      repository { nameWithOwner }
      headRefName
      isDraft
      createdAt
      updatedAt
      mergeable
      reviewDecision
      additions
      deletions
      changedFiles
      author { login }
      labels(first: 10) {
        nodes { name color }
      }
      reviewRequests(first: 20) {
        nodes {
          requestedReviewer {
            ... on User { login }
            ... on Team { name }
          }
        }
      }
      reviewThreads(first: 100) {
        totalCount
        nodes { isResolved }
      }
      commits(last: 1) {
        nodes {
          commit {
            author { user { login } }
            status { state }
          }
        }
      }
    }
  }
}
`;

export type DashboardGraphqlData = {
  authored: { nodes: unknown[] };
  assigned: { nodes: unknown[] };
  viewer: { login: string };
  rateLimit: { cost: number; remaining: number; resetAt: string };
};

export async function fetchDashboardGraphqlData(
  token: string,
  first: number,
): Promise<DashboardGraphqlData> {
  const octokit = createGithubClient(token);
  let payload: DashboardGraphqlData;
  try {
    payload = await octokit.graphql<DashboardGraphqlData>(SEARCH_QUERY, {
      first,
    });
  } catch (error: unknown) {
    const maybeMessage = error instanceof Error ? error.message : String(error);
    if (maybeMessage.includes("Resource not accessible by personal access token")) {
      throw new Error(
        "Token permissions issue. Use a fine-grained PAT with: Pull requests (read), Contents (read), Commit statuses (read), Issues (write). Make sure you selected the correct resource owner and repos.",
      );
    }
    throw error;
  }

  if (!payload) {
    throw new Error("GitHub GraphQL returned no data");
  }
  if (!payload.authored || !payload.assigned) {
    throw new Error("GitHub GraphQL response is missing expected search results");
  }
  return payload;
}
