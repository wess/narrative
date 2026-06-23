import {
  Bell,
  CheckCircle2,
  Clock,
  FileDiff,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import type { AgentRun, ProjectWriteProposal } from "../../shared/types.ts";
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

const runStatusIcon = (run: AgentRun) =>
  run.status === "ok" ? (
    <CheckCircle2 size={14} />
  ) : run.status === "cancelled" || run.status === "maxiterations" ? (
    <Clock size={14} />
  ) : (
    <XCircle size={14} />
  );

type Activity =
  | { readonly kind: "proposal"; readonly at: string; readonly proposal: ProjectWriteProposal }
  | { readonly kind: "run"; readonly at: string; readonly run: AgentRun };

export const AgentInbox = () => {
  const { inbox, agentRuns, projectProposals, agents, channels, projects } = useApp();
  if (!inbox.open) return null;

  const agentName = (slug: string | null): string =>
    slug ? (agents.find((agent) => agent.slug === slug)?.name ?? slug) : "Assistant";
  const channelName = (slug: string | null): string | null =>
    slug ? (channels.find((channel) => channel.slug === slug)?.name ?? slug) : null;
  const projectName = (slug: string): string =>
    projects.find((project) => project.slug === slug)?.name ?? slug;

  const items: Activity[] = [
    ...projectProposals.map((proposal) => ({
      kind: "proposal" as const,
      at: proposal.createdAt,
      proposal,
    })),
    ...agentRuns.slice(0, 40).map((run) => ({ kind: "run" as const, at: run.createdAt, run })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons
    <div className="agentinbox-overlay" onClick={() => actions.closeInbox()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="agentinbox"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="agentinbox-head">
          <div>
            <span>Attention</span>
            <h2>Agent inbox</h2>
            <p>Finished runs, failed attempts, and proposed file changes that need review.</p>
          </div>
          <div className="agentinbox-actions">
            <button type="button" title="Refresh" onClick={() => void actions.refreshInbox()}>
              <RefreshCw size={14} />
            </button>
            <button type="button" title="Close" onClick={() => actions.closeInbox()}>
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="agentinbox-summary">
          <div>
            <strong>{projectProposals.length}</strong>
            <span>changes waiting</span>
          </div>
          <div>
            <strong>{agentRuns.filter((run) => run.status !== "ok").length}</strong>
            <span>runs need attention</span>
          </div>
          <div>
            <strong>{agentRuns.filter((run) => run.status === "ok").length}</strong>
            <span>completed runs</span>
          </div>
        </div>

        <div className="agentinbox-body">
          {items.length === 0 ? (
            <div className="agentinbox-empty">
              <Bell size={24} />
              <p>No agent activity yet.</p>
            </div>
          ) : (
            items.map((item) =>
              item.kind === "proposal" ? (
                <article
                  key={`proposal-${item.proposal.id}`}
                  className="agentinbox-item"
                  data-kind="proposal"
                >
                  <div className="agentinbox-icon">
                    <FileDiff size={15} />
                  </div>
                  <div className="agentinbox-content">
                    <header>
                      <strong>{item.proposal.path}</strong>
                      <span>{projectName(item.proposal.projectSlug)}</span>
                      <small>{formatWhen(item.proposal.createdAt)}</small>
                    </header>
                    <p>{item.proposal.reason || "Agent proposed a file change."}</p>
                    <footer>
                      <button
                        type="button"
                        onClick={() => {
                          actions.closeInbox();
                          void actions.openReviewQueue();
                        }}
                      >
                        <ShieldCheck size={13} />
                        Review change
                      </button>
                    </footer>
                  </div>
                </article>
              ) : (
                <article
                  key={`run-${item.run.id}`}
                  className="agentinbox-item"
                  data-kind="run"
                  data-status={item.run.status}
                >
                  <div className="agentinbox-icon">{runStatusIcon(item.run)}</div>
                  <div className="agentinbox-content">
                    <header>
                      <strong>{agentName(item.run.agentSlug)}</strong>
                      {channelName(item.run.channelSlug) ? (
                        <span>{channelName(item.run.channelSlug)}</span>
                      ) : null}
                      <small>{formatWhen(item.run.createdAt)}</small>
                    </header>
                    {item.run.userPrompt ? <p>{item.run.userPrompt}</p> : null}
                    {item.run.error ? <pre>{item.run.error}</pre> : null}
                    <footer>
                      <button
                        type="button"
                        onClick={() => {
                          actions.closeInbox();
                          void actions.openRunTimeline();
                        }}
                      >
                        <Clock size={13} />
                        Open run history
                      </button>
                    </footer>
                  </div>
                </article>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
};
