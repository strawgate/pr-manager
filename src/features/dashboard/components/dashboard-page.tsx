import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { buildQuickComment, closePr, postPrComment } from "@/features/dashboard/api/pr-actions";
import { PrDetailFlyout } from "@/features/dashboard/components/pr-detail-flyout";
import { PrTable } from "@/features/dashboard/components/pr-table";
import { usePrDashboard } from "@/features/dashboard/hooks/use-pr-dashboard";
import type { PrCard } from "@/features/dashboard/types";
import { useSettingsStore } from "@/features/settings/store/use-settings-store";
import { navigate } from "@/hooks/use-hash-route";

const REFETCH_MS = 120_000;

export function DashboardPage() {
  const { githubToken, resultLimit } = useSettingsStore();
  const queryClient = useQueryClient();
  const query = usePrDashboard(githubToken, resultLimit, REFETCH_MS);
  const [detailPr, setDetailPr] = useState<PrCard | null>(null);

  const commentMutation = useMutation({
    mutationFn: async ({
      pr,
      mode,
      customInstruction,
    }: {
      pr: PrCard;
      mode: "ai" | "copilot";
      customInstruction: string;
    }) =>
      postPrComment(githubToken, {
        repositoryNameWithOwner: pr.repositoryNameWithOwner,
        number: pr.number,
        body: buildQuickComment(mode, pr.title, customInstruction),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pr-dashboard"] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async ({ pr }: { pr: PrCard }) =>
      closePr(githubToken, pr.repositoryNameWithOwner, pr.number),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pr-dashboard"] });
    },
  });

  if (!githubToken) {
    return (
      <section className="panel empty-state">
        <h2>No GitHub token configured</h2>
        <p className="muted">
          Add a GitHub fine-grained PAT in Settings to load your open pull requests.
        </p>
        <button type="button" className="button-primary" onClick={() => navigate("/settings")}>
          Go to Settings
        </button>
      </section>
    );
  }

  if (query.isLoading) {
    return (
      <section className="panel empty-state">
        <p className="muted">Loading your pull requests...</p>
      </section>
    );
  }

  if (query.error) {
    return (
      <section className="panel empty-state">
        <p className="error">{(query.error as Error).message}</p>
        <button type="button" className="button-secondary" onClick={() => query.refetch()}>
          Retry
        </button>
      </section>
    );
  }

  if (!query.data) {
    return null;
  }

  return (
    <>
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          <span className="muted">{query.data.viewer}</span>
          {commentMutation.isSuccess ? (
            <span className="badge" style={{ borderColor: "#3fb950", color: "#3fb950" }}>
              Comment posted
            </span>
          ) : null}
          {commentMutation.error ? (
            <span className="badge" style={{ borderColor: "#f85149", color: "#f85149" }}>
              {(commentMutation.error as Error).message.slice(0, 80)}
            </span>
          ) : null}
        </div>
        <div className="dashboard-header-right">
          <span className="muted">{query.data.rateLimit.remaining} API calls left</span>
          <button
            type="button"
            className="button-secondary"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            {query.isFetching ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      <PrTable
        prs={query.data.prs}
        sendingCommentFor={
          commentMutation.variables
            ? `${commentMutation.variables.pr.repositoryNameWithOwner}#${commentMutation.variables.pr.number}`
            : null
        }
        onQuickComment={(pr, mode, customInstruction) =>
          commentMutation.mutateAsync({ pr, mode, customInstruction })
        }
        onClosePr={(pr) => closeMutation.mutateAsync({ pr })}
        closingPrKey={
          closeMutation.variables
            ? `${closeMutation.variables.pr.repositoryNameWithOwner}#${closeMutation.variables.pr.number}`
            : null
        }
        onViewDetail={(pr) => setDetailPr(pr)}
      />
      {detailPr ? (
        <PrDetailFlyout
          repositoryNameWithOwner={detailPr.repositoryNameWithOwner}
          number={detailPr.number}
          token={githubToken}
          onClose={() => setDetailPr(null)}
        />
      ) : null}
    </>
  );
}
