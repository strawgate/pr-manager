import { Octokit } from "octokit";

export function createGithubClient(token: string) {
  if (!token.trim()) {
    throw new Error("GitHub token is required");
  }
  return new Octokit({
    auth: token.trim(),
  });
}
