import { useQuery } from "@tanstack/react-query";
import { fetchPrDetail, type PrDetail } from "@/features/dashboard/api/pr-detail";
import { timeAgo } from "@/features/dashboard/lib/helpers";

type Props = {
  repositoryNameWithOwner: string;
  number: number;
  token: string;
  onClose: () => void;
};

function ReviewStateBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    APPROVED: "#3fb950",
    CHANGES_REQUESTED: "#f85149",
    COMMENTED: "#8b949e",
    DISMISSED: "#8b949e",
    PENDING: "#d29922",
  };
  return (
    <span
      className="badge"
      style={{
        borderColor: colors[state] ?? "#8b949e",
        color: colors[state] ?? "#8b949e",
      }}
    >
      {state.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

function DetailContent({ detail }: { detail: PrDetail }) {
  const unresolvedThreads = detail.reviewThreads.filter((t) => !t.isResolved);

  return (
    <div className="flyout-content">
      <section className="flyout-section">
        <h4>Timeline ({detail.timelineCount})</h4>
        {detail.timeline.length === 0 ? (
          <p className="muted">No timeline events.</p>
        ) : (
          <div className="flyout-timeline">
            {detail.timeline.map((event) => (
              <div
                key={`${event.createdAt}-${event.type}-${event.actor}`}
                className="flyout-timeline-item"
              >
                <span className="muted">{timeAgo(event.createdAt)}</span>
                <span>
                  {event.actor ? <strong>{event.actor}</strong> : null}{" "}
                  {event.detail || event.type.replace(/Event$/, "")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flyout-section">
        <h4>Description</h4>
        {detail.body ? (
          <pre className="flyout-body">{detail.body}</pre>
        ) : (
          <p className="muted">No description.</p>
        )}
      </section>

      <section className="flyout-section">
        <h4>Reviews ({detail.reviewCount})</h4>
        {detail.reviews.length === 0 ? (
          <p className="muted">No reviews yet.</p>
        ) : (
          detail.reviews.map((r) => (
            <div key={`${r.submittedAt}-${r.author}`} className="flyout-item">
              <div className="flyout-item-header">
                <strong>{r.author}</strong>
                <ReviewStateBadge state={r.state} />
                <span className="muted">{timeAgo(r.submittedAt)}</span>
                {r.commentCount > 0 ? (
                  <span className="muted">
                    {r.commentCount} inline comment{r.commentCount !== 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>
              {r.body ? <pre className="flyout-item-body">{r.body}</pre> : null}
            </div>
          ))
        )}
      </section>

      {unresolvedThreads.length > 0 ? (
        <section className="flyout-section">
          <h4>Unresolved threads ({unresolvedThreads.length})</h4>
          {unresolvedThreads.map((thread) => (
            <div
              key={thread.comments[0]?.url ?? thread.comments[0]?.path}
              className="flyout-thread"
            >
              {thread.comments.map((c) => (
                <div key={`${c.url}-${c.createdAt}`} className="flyout-item">
                  <div className="flyout-item-header">
                    <strong>{c.author}</strong>
                    <span className="muted">{c.path}</span>
                    <span className="muted">{timeAgo(c.createdAt)}</span>
                  </div>
                  <pre className="flyout-item-body">{c.body}</pre>
                </div>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      <section className="flyout-section">
        <h4>Comments ({detail.commentCount})</h4>
        {detail.comments.length === 0 ? (
          <p className="muted">No comments.</p>
        ) : (
          detail.comments.map((c) => (
            <div key={c.url} className="flyout-item">
              <div className="flyout-item-header">
                <strong>{c.author}</strong>
                <span className="muted">{timeAgo(c.createdAt)}</span>
              </div>
              <pre className="flyout-item-body">{c.body}</pre>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

export function PrDetailFlyout({ repositoryNameWithOwner, number, token, onClose }: Props) {
  const query = useQuery({
    queryKey: ["pr-detail", repositoryNameWithOwner, number],
    queryFn: () => fetchPrDetail(token, repositoryNameWithOwner, number),
  });

  return (
    <div className="flyout-backdrop" role="none" onMouseDown={onClose}>
      <div
        className="flyout-panel"
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="flyout-header">
          <h3>
            {repositoryNameWithOwner} #{number}
          </h3>
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {query.isLoading ? (
          <p className="muted" style={{ padding: "1rem" }}>
            Loading PR details...
          </p>
        ) : query.error ? (
          <p className="error" style={{ padding: "1rem" }}>
            {(query.error as Error).message}
          </p>
        ) : query.data ? (
          <DetailContent detail={query.data} />
        ) : null}
      </div>
    </div>
  );
}
