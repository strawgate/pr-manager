import type { PrCard } from "@/features/dashboard/types";

export function diffSizeLabel(pr: PrCard): string {
  const total = pr.additions + pr.deletions;
  if (total <= 10) return "XS";
  if (total <= 100) return "S";
  if (total <= 500) return "M";
  if (total <= 1000) return "L";
  return "XL";
}

export function diffSizeColor(pr: PrCard): string {
  const total = pr.additions + pr.deletions;
  if (total <= 10) return "#8b949e";
  if (total <= 100) return "#3fb950";
  if (total <= 500) return "#58a6ff";
  if (total <= 1000) return "#d29922";
  return "#f85149";
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export function checksLabel(state: PrCard["statusCheckState"]): string {
  if (!state) return "No checks";
  if (state === "SUCCESS") return "Passing";
  if (state === "FAILURE" || state === "ERROR") return "Failing";
  if (state === "ACTION_REQUIRED") return "Action required";
  return "Pending";
}

export function checksColor(state: PrCard["statusCheckState"]): string {
  if (!state) return "#8b949e";
  if (state === "SUCCESS") return "#3fb950";
  if (state === "FAILURE" || state === "ERROR" || state === "ACTION_REQUIRED") return "#f85149";
  return "#d29922";
}

export function reviewLabel(decision: PrCard["reviewDecision"]): string {
  if (decision === "APPROVED") return "Approved";
  if (decision === "CHANGES_REQUESTED") return "Changes requested";
  if (decision === "REVIEW_REQUIRED") return "Review required";
  return "No review";
}

export function reviewColor(decision: PrCard["reviewDecision"]): string {
  if (decision === "APPROVED") return "#3fb950";
  if (decision === "CHANGES_REQUESTED") return "#f85149";
  if (decision === "REVIEW_REQUIRED") return "#d29922";
  return "#8b949e";
}

export function editorUrl(editor: "cursor" | "vscode", repoNwo: string): string {
  const scheme = editor === "cursor" ? "cursor" : "vscode";
  return `${scheme}://vscode.git/clone?url=${encodeURIComponent(`https://github.com/${repoNwo}.git`)}`;
}

export function checkoutCommand(headRefName: string): string {
  return `git fetch origin ${headRefName} && git checkout ${headRefName}`;
}
