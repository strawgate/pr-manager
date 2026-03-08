import { createGithubClient } from "@/lib/github-client";

type CommentInput = {
  repositoryNameWithOwner: string;
  number: number;
  body: string;
};

export async function postPrComment(
  token: string,
  input: CommentInput,
): Promise<void> {
  const [owner, repo] = input.repositoryNameWithOwner.split("/");
  if (!owner || !repo) {
    throw new Error("Missing repository owner/name for PR comment");
  }
  if (!input.body.trim()) {
    throw new Error("Comment cannot be empty");
  }

  const octokit = createGithubClient(token);
  await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
    owner,
    repo,
    issue_number: input.number,
    body: input.body.trim(),
  });
}

export async function closePr(
  token: string,
  repositoryNameWithOwner: string,
  number: number,
): Promise<void> {
  const [owner, repo] = repositoryNameWithOwner.split("/");
  if (!owner || !repo) {
    throw new Error("Missing repository owner/name");
  }
  const octokit = createGithubClient(token);
  await octokit.request("PATCH /repos/{owner}/{repo}/pulls/{pull_number}", {
    owner,
    repo,
    pull_number: number,
    state: "closed",
  });
}

export function buildQuickComment(
  mode: "ai" | "copilot",
  title: string,
  customInstruction: string,
): string {
  const trimmed = customInstruction.trim();
  if (mode === "ai") {
    if (trimmed) {
      return `/ai ${trimmed}`;
    }
    return `/ai Please address review feedback and ensure CI passes for "${title}".`;
  }
  if (trimmed) {
    return `@copilot ${trimmed}`;
  }
  return `@copilot Please address requested review changes and rerun checks for "${title}".`;
}
