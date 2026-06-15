import { CheckCircle2, Clock, RefreshCw, X, XCircle } from "lucide-react";
import type { AgentRun } from "../../shared/types.ts";
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

const statusIcon = (run: AgentRun) =>
  run.status === "ok" ? (
    <CheckCircle2 size={14} />
  ) : run.status === "cancelled" || run.status === "maxiterations" ? (
    <Clock size={14} />
  ) : (
    <XCircle size={14} />
  );

const stopLabel = (run: AgentRun): string =>
  run.stopReason === "maxiterations"
    ? "Loop limit"
    : run.stopReason === "cancelled"
      ? "Cancelled"
      : run.stopReason === "error"
        ? "Error"
        : "Complete";

export const RunTimeline = () => {
  const { runTimelineOpen, agentRuns, agents, channels } = useApp();
  if (!runTimelineOpen) return null;

  const agentName = (slug: string | null): string =>
    slug ? (agents.find((agent) => agent.slug === slug)?.name ?? slug) : "Assistant";
  const channelName = (slug: string | null): string | null =>
    slug ? (channels.find((channel) => channel.slug === slug)?.name ?? slug) : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal controls are explicit buttons
    <div className="runtimeline-overlay" onClick={() => actions.closeRunTimeline()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="runtimeline"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="runtimeline-head">
          <div>
            <span>Agent history</span>
            <h2>Run timeline</h2>
            <p>Recent assistant and agent turns, including tools, errors, and timing.</p>
          </div>
          <div className="runtimeline-actions">
            <button type="button" title="Refresh" onClick={() => void actions.refreshRunTimeline()}>
              <RefreshCw size={14} />
            </button>
            <button type="button" title="Close" onClick={() => actions.closeRunTimeline()}>
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="runtimeline-body">
          {agentRuns.length === 0 ? (
            <p className="runtimeline-empty">No agent runs have been recorded yet.</p>
          ) : (
            agentRuns.map((run) => {
              const channel = channelName(run.channelSlug);
              return (
                <article key={run.id} className="runtimeline-item" data-status={run.status}>
                  <div className="runtimeline-status">{statusIcon(run)}</div>
                  <div className="runtimeline-content">
                    <header>
                      <strong>{agentName(run.agentSlug)}</strong>
                      {channel ? <span>{channel}</span> : null}
                      <small>
                        {formatWhen(run.createdAt)} · {stopLabel(run)} · {run.iterations} loop
                        {run.iterations === 1 ? "" : "s"} · {run.durationMs}ms
                      </small>
                    </header>
                    {run.userPrompt ? <p>{run.userPrompt}</p> : null}
                    {run.error ? <pre>{run.error}</pre> : null}
                    {!run.error && run.content ? <pre>{run.content.slice(0, 900)}</pre> : null}
                    {run.toolCalls.length > 0 ? (
                      <div className="runtimeline-tools">
                        {run.toolCalls.map((call) => (
                          <span key={call.id} data-status={call.status}>
                            {call.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
