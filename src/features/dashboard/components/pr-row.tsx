import { useState } from "react";
import {
  checkoutCommand,
  checksColor,
  checksLabel,
  diffSizeColor,
  diffSizeLabel,
  editorUrl,
  reviewColor,
  reviewLabel,
  timeAgo,
} from "@/features/dashboard/lib/helpers";
import type { PrCard } from "@/features/dashboard/types";

type Props = {
  pr: PrCard;
  showRepo: boolean;
  onQuickComment: (pr: PrCard, mode: "ai" | "copilot", customInstruction: string) => Promise<void>;
  isSending: boolean;
  onClosePr: (pr: PrCard) => Promise<void>;
  isClosing: boolean;
  onViewDetail: (pr: PrCard) => void;
};

export function PrRow({
  pr,
  showRepo,
  onQuickComment,
  isSending,
  onClosePr,
  isClosing,
  onViewDetail,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="pr-card">
      {/* biome-ignore lint/a11y/useSemanticElements: contains nested interactive elements (button, anchor) which are invalid inside <button> */}
      <div
        className="pr-card-main"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <div className="pr-card-left">
          {showRepo ? <span className="badge badge-repo">{pr.repositoryNameWithOwner}</span> : null}
          <button
            type="button"
            className="pr-number-btn"
            title="View PR details"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetail(pr);
            }}
          >
            #{pr.number}
          </button>
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className="pr-title"
            onClick={(e) => e.stopPropagation()}
          >
            {pr.title}
          </a>
          {pr.isDraft ? <span className="badge badge-draft">Draft</span> : null}
        </div>
        <div className="pr-card-meta">
          <span
            className="badge"
            style={{ borderColor: diffSizeColor(pr), color: diffSizeColor(pr) }}
            title={`+${pr.additions} -${pr.deletions} (${pr.changedFiles} files)`}
          >
            {diffSizeLabel(pr)}
          </span>
          <span
            className="badge"
            style={{
              borderColor: checksColor(pr.statusCheckState),
              color: checksColor(pr.statusCheckState),
            }}
          >
            {checksLabel(pr.statusCheckState)}
          </span>
          <span
            className="badge"
            style={{
              borderColor: reviewColor(pr.reviewDecision),
              color: reviewColor(pr.reviewDecision),
            }}
          >
            {reviewLabel(pr.reviewDecision)}
          </span>
          {pr.reviewThreads.unresolved > 0 ? (
            <span
              className="badge badge-threads"
              title={`${pr.reviewThreads.unresolved} of ${pr.reviewThreads.total} threads unresolved`}
            >
              {pr.reviewThreads.unresolved} unresolved
            </span>
          ) : null}
          {pr.labels.map((l) => (
            <span
              key={l.name}
              className="badge"
              style={{ borderColor: `#${l.color}`, color: `#${l.color}` }}
            >
              {l.name}
            </span>
          ))}
          <span className="pr-meta-text">{pr.author}</span>
          <span className="pr-meta-text muted" title={new Date(pr.updatedAt).toLocaleString()}>
            {timeAgo(pr.updatedAt)}
          </span>
        </div>
      </div>

      {expanded ? (
        <div className="pr-card-expanded">
          <div className="pr-detail-row">
            <span className="pr-meta-text muted">
              {pr.repositoryNameWithOwner} / {pr.headRefName}
            </span>
            <span className="pr-meta-text muted">
              +{pr.additions} -{pr.deletions} across {pr.changedFiles} file
              {pr.changedFiles !== 1 ? "s" : ""}
            </span>
            <span className="pr-meta-text muted">Created {timeAgo(pr.createdAt)} ago</span>
            {pr.sources.length > 0 ? (
              <span className="pr-meta-text muted">Source: {pr.sources.join(", ")}</span>
            ) : null}
          </div>

          <div className="pr-action-row">
            <button type="button" className="button-secondary" onClick={() => onViewDetail(pr)}>
              View details
            </button>
            <a href={pr.url} target="_blank" rel="noreferrer" className="button-secondary">
              Open on GitHub
            </a>
            <a href={editorUrl("cursor", pr.repositoryNameWithOwner)} className="button-secondary">
              Open in Cursor
            </a>
            <a href={editorUrl("vscode", pr.repositoryNameWithOwner)} className="button-secondary">
              Open in VS Code
            </a>
            <button
              type="button"
              className="button-secondary"
              onClick={() => copyText(checkoutCommand(pr.headRefName), "checkout")}
            >
              {copied === "checkout" ? "Copied!" : "Copy checkout cmd"}
            </button>
            <button
              type="button"
              className="button-danger"
              disabled={isClosing}
              onClick={() => onClosePr(pr)}
            >
              {isClosing ? "Closing..." : "Close PR"}
            </button>
          </div>

          <div className="pr-comment-row">
            <input
              type="text"
              placeholder="Custom instruction (optional)..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              className="button-secondary"
              disabled={isSending}
              onClick={() => onQuickComment(pr, "ai", draft)}
            >
              /ai comment
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={isSending}
              onClick={() => onQuickComment(pr, "copilot", draft)}
            >
              @copilot comment
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
