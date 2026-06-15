import { Bot, Download, MessageSquare, Pencil, Sparkles, X } from "lucide-react";
import { useEffect } from "react";
import { PROVIDERS } from "../../shared/providers.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

const roleDefinition = (prompt: string): string => {
  const cleaned = prompt
    .replace(/^You are\s+/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || "No role definition has been written yet.";
};

export const AgentProfile = () => {
  const { agents, agentProfileSlug, chat, agentRuns } = useApp();
  const agent = agentProfileSlug ? (agents.find((a) => a.slug === agentProfileSlug) ?? null) : null;

  useEffect(() => {
    if (agentProfileSlug) void actions.refreshRunTimeline();
  }, [agentProfileSlug]);

  if (!agent) return null;

  const active = chat.agentSlug === agent.slug;
  const provider = agent.provider ? PROVIDERS[agent.provider].label : "App default";
  const model = agent.model ?? "App default";
  const runs = agentRuns.filter((run) => run.agentSlug === agent.slug);
  const okRuns = runs.filter((run) => run.status === "ok").length;
  const successRate = runs.length > 0 ? `${Math.round((okRuns / runs.length) * 100)}%` : "No runs";
  const hasAllTools = agent.tools.includes("*");
  const toolLabel = hasAllTools
    ? "All tools"
    : agent.tools.length === 0
      ? "No tools"
      : agent.tools.length;

  const useAgent = () => {
    actions.setAgent(agent.slug);
    actions.openAi();
    actions.closeAgentProfile();
  };

  const editAgent = () => {
    actions.closeAgentProfile();
    void actions.openAgentEditor("agent", agent.slug);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal controls are explicit buttons
    <div className="agentprofile-overlay" onClick={() => actions.closeAgentProfile()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="agentprofile"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="agentprofile-head">
          <div className="agentprofile-avatar">{agent.icon || "\u{1F916}"}</div>
          <div className="agentprofile-title">
            <span>Agent profile</span>
            <h2>{agent.name}</h2>
            {agent.description ? <p>{agent.description}</p> : null}
          </div>
          <button
            type="button"
            className="agentprofile-close"
            title="Close"
            onClick={() => actions.closeAgentProfile()}
          >
            <X size={15} />
          </button>
        </header>

        <div className="agentprofile-body">
          <section className="agentprofile-section">
            <h3>
              <Sparkles size={14} /> Role definition
            </h3>
            <p>{roleDefinition(agent.systemPrompt)}</p>
          </section>

          <div className="agentprofile-meta">
            <div>
              <span>Provider</span>
              <strong>{provider}</strong>
            </div>
            <div>
              <span>Model</span>
              <strong>{model}</strong>
            </div>
            <div>
              <span>Tools</span>
              <strong>{toolLabel}</strong>
            </div>
            <div>
              <span>Runs</span>
              <strong>{runs.length}</strong>
            </div>
            <div>
              <span>Success</span>
              <strong>{successRate}</strong>
            </div>
          </div>

          <section className="agentprofile-section">
            <h3>
              <Bot size={14} /> Tool access
            </h3>
            {hasAllTools ? (
              <p>This agent can use every registered tool.</p>
            ) : agent.tools.length > 0 ? (
              <div className="agentprofile-tools">
                {agent.tools.map((tool) => (
                  <span key={tool}>{tool}</span>
                ))}
              </div>
            ) : (
              <p>
                This agent has no tool access. It can answer from chat context but cannot inspect or
                change vault/project data.
              </p>
            )}
          </section>
        </div>

        <footer className="agentprofile-foot">
          <button
            type="button"
            className="agentprofile-btn"
            onClick={() => void actions.exportAgent(agent.slug)}
          >
            <Download size={13} /> Export
          </button>
          <button type="button" className="agentprofile-btn" onClick={editAgent}>
            <Pencil size={13} /> Edit source
          </button>
          <button
            type="button"
            className="agentprofile-btn agentprofile-primary"
            disabled={active}
            onClick={useAgent}
          >
            <MessageSquare size={13} /> {active ? "Active agent" : "Use in chat"}
          </button>
        </footer>
      </div>
    </div>
  );
};
