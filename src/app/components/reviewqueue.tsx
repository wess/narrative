import { Check, RefreshCw, X } from "lucide-react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const ReviewQueue = () => {
  const { reviewQueueOpen, projectProposals, projects } = useApp();
  if (!reviewQueueOpen) return null;

  const projectName = (slug: string): string =>
    projects.find((project) => project.slug === slug)?.name ?? slug;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal controls are explicit buttons
    <div className="reviewqueue-overlay" onClick={() => actions.closeReviewQueue()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="reviewqueue"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="reviewqueue-head">
          <div>
            <span>Project changes</span>
            <h2>Review queue</h2>
            <p>Approve or reject file changes proposed by agents before they touch disk.</p>
          </div>
          <div className="reviewqueue-actions">
            <button type="button" title="Refresh" onClick={() => void actions.refreshReviewQueue()}>
              <RefreshCw size={14} />
            </button>
            <button type="button" title="Close" onClick={() => actions.closeReviewQueue()}>
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="reviewqueue-body">
          {projectProposals.length === 0 ? (
            <p className="reviewqueue-empty">No proposed file changes are waiting for review.</p>
          ) : (
            projectProposals.map((proposal) => (
              <article key={proposal.id} className="reviewqueue-item">
                <header>
                  <strong>{proposal.path}</strong>
                  <span>{projectName(proposal.projectSlug)}</span>
                  <small>{formatWhen(proposal.createdAt)}</small>
                </header>
                {proposal.reason ? <p>{proposal.reason}</p> : null}
                <pre>{(proposal.diff ?? proposal.content).slice(0, 2200)}</pre>
                <footer>
                  <button
                    type="button"
                    className="reviewqueue-approve"
                    onClick={() => void actions.approveProjectProposal(proposal.id)}
                  >
                    <Check size={13} />
                    Approve
                  </button>
                  <button
                    type="button"
                    className="reviewqueue-reject"
                    onClick={() => void actions.rejectProjectProposal(proposal.id)}
                  >
                    <X size={13} />
                    Reject
                  </button>
                </footer>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
