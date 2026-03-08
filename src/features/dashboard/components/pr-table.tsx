import { useMemo, useState } from "react";
import { PrRow } from "@/features/dashboard/components/pr-row";
import { BUCKET_META, BUCKET_ORDER } from "@/features/dashboard/domain/pr-state-machine";
import type { PrCard } from "@/features/dashboard/types";

type GroupBy = "bucket" | "repo";

type Props = {
  prs: PrCard[];
  onQuickComment: (pr: PrCard, mode: "ai" | "copilot", customInstruction: string) => Promise<void>;
  sendingCommentFor: string | null;
  onClosePr: (pr: PrCard) => Promise<void>;
  closingPrKey: string | null;
  onViewDetail: (pr: PrCard) => void;
};

type Group = {
  key: string;
  label: string;
  color: string;
  items: PrCard[];
};

function groupByBucket(prs: PrCard[]): Group[] {
  const groups: Group[] = [];
  for (const bucket of BUCKET_ORDER) {
    const items = prs.filter((pr) => pr.bucket === bucket);
    if (items.length === 0) continue;
    const meta = BUCKET_META[bucket];
    groups.push({
      key: bucket,
      label: `${meta.label} (${items.length})`,
      color: meta.color,
      items,
    });
  }
  return groups;
}

function groupByRepo(prs: PrCard[]): Group[] {
  const repoMap = new Map<string, PrCard[]>();
  for (const pr of prs) {
    const key = pr.repositoryNameWithOwner || "unknown";
    const arr = repoMap.get(key) ?? [];
    arr.push(pr);
    repoMap.set(key, arr);
  }
  return [...repoMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([repo, items]) => ({
      key: repo,
      label: `${repo} (${items.length})`,
      color: "#58a6ff",
      items,
    }));
}

export function PrTable({
  prs,
  onQuickComment,
  sendingCommentFor,
  onClosePr,
  closingPrKey,
  onViewDetail,
}: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>("bucket");

  const groups = useMemo(
    () => (groupBy === "bucket" ? groupByBucket(prs) : groupByRepo(prs)),
    [prs, groupBy],
  );

  if (!prs.length) {
    return (
      <section className="panel">
        <p className="muted">No open PRs matched the query.</p>
      </section>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <span className="muted">
          {prs.length} PR{prs.length !== 1 ? "s" : ""}
        </span>
        <div className="toolbar-right">
          <button
            type="button"
            className={`tab-btn ${groupBy === "bucket" ? "active" : ""}`}
            onClick={() => setGroupBy("bucket")}
          >
            By status
          </button>
          <button
            type="button"
            className={`tab-btn ${groupBy === "repo" ? "active" : ""}`}
            onClick={() => setGroupBy("repo")}
          >
            By repo
          </button>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.key} className="bucket-group">
          <h3 className="bucket-header" style={{ borderLeftColor: group.color }}>
            {group.label}
          </h3>
          {group.items.map((pr) => (
            <PrRow
              key={`${pr.repositoryNameWithOwner}#${pr.number}`}
              pr={pr}
              showRepo={groupBy !== "repo"}
              onQuickComment={onQuickComment}
              isSending={sendingCommentFor === `${pr.repositoryNameWithOwner}#${pr.number}`}
              onClosePr={onClosePr}
              isClosing={closingPrKey === `${pr.repositoryNameWithOwner}#${pr.number}`}
              onViewDetail={onViewDetail}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
