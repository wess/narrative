import {
  Bot,
  Boxes,
  Brain,
  CheckCircle2,
  FolderOpen,
  GitBranch,
  Hash,
  History,
  X,
} from "lucide-react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

const concepts = [
  {
    icon: Bot,
    title: "Agent",
    body: "A named role with a model, instructions, and tool access.",
    detail: "Use one for focused work.",
  },
  {
    icon: Hash,
    title: "Channel",
    body: "A room that groups agents around one brief.",
    detail: "Use one for team work.",
  },
  {
    icon: FolderOpen,
    title: "Project",
    body: "A local folder agents can inspect and, when allowed, change.",
    detail: "Use one for real code work.",
  },
  {
    icon: Brain,
    title: "Memory",
    body: "Durable facts saved globally or inside a channel.",
    detail: "Pin what must persist.",
  },
  {
    icon: History,
    title: "Run",
    body: "One agent attempt, including tool calls and stop reason.",
    detail: "Review it when behavior is surprising.",
  },
  {
    icon: Boxes,
    title: "Harness",
    body: "Saved scenarios and results for testing agent behavior.",
    detail: "Use it before trusting a workflow.",
  },
];

const steps = [
  "Create an agent",
  "Assign tools",
  "Link a project",
  "Chat in a channel",
  "Review runs",
  "Promote repeat work to harness scenarios",
];

export const AgentGuide = () => {
  const { agentGuideOpen } = useApp();
  if (!agentGuideOpen) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons
    <div className="agentguide-overlay" onClick={() => actions.closeAgentGuide()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="agentguide"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="agentguide-head">
          <div>
            <span>Agent workspace</span>
            <h2>How the pieces fit</h2>
          </div>
          <button type="button" title="Close" onClick={() => actions.closeAgentGuide()}>
            <X size={15} />
          </button>
        </header>

        <div className="agentguide-flow">
          {steps.map((step, index) => (
            <div key={step} className="agentguide-step">
              <span>{index + 1}</span>
              <strong>{step}</strong>
              {index < steps.length - 1 ? <GitBranch size={13} /> : <CheckCircle2 size={13} />}
            </div>
          ))}
        </div>

        <div className="agentguide-grid">
          {concepts.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title}>
                <Icon size={16} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <small>{item.detail}</small>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};
