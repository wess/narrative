import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  PenLine,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PROVIDER_IDS, PROVIDERS } from "../../shared/providers.ts";
import type { AgentDef, AiProvider } from "../../shared/types.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

type SourceMode = "preset" | "existing" | "guided" | "freeform";

type Draft = {
  name: string;
  description: string;
  icon: string;
  provider: AiProvider | "";
  model: string;
  tools: string[];
  purpose: string;
  style: string;
  rules: string;
  freeform: string;
};

type Preset = {
  id: string;
  label: string;
  icon: string;
  description: string;
  tools: string[];
  prompt: string;
};

const PRESETS: Preset[] = [
  {
    id: "researcher",
    label: "Ada",
    icon: "\u{1F50E}",
    description: "Research lead who finds relevant notes, compares sources, and cites answers.",
    tools: ["vault.search", "vault.semanticsearch", "vault.read", "vault.backlinks"],
    prompt:
      "You are Ada, a research lead for the user's notes. Search before answering, read the strongest matching pages, compare conflicting notes, and cite page titles in concise prose.",
  },
  {
    id: "scribe",
    label: "Mira",
    icon: "\u{270D}\u{FE0F}",
    description: "Editorial partner who turns rough notes into clear drafts without losing intent.",
    tools: ["vault.read", "vault.update", "vault.create"],
    prompt:
      "You are Mira, an editorial partner for the user's notes. Preserve the user's intent, tighten structure, remove filler, and only edit pages when asked.",
  },
  {
    id: "librarian",
    label: "Rowan",
    icon: "\u{1F4DA}",
    description:
      "Notes librarian who organizes pages, links ideas, and surfaces missing connections.",
    tools: ["vault.search", "vault.read", "vault.backlinks", "vault.outgoing", "vault.update"],
    prompt:
      "You are Rowan, a notes librarian. Prefer organization, links, tags, and clear page relationships over long prose.",
  },
  {
    id: "operator",
    label: "Quinn",
    icon: "\u{2699}\u{FE0F}",
    description: "Operations specialist who executes focused page work with minimal chatter.",
    tools: ["vault.search", "vault.read", "vault.create", "vault.update"],
    prompt:
      "You are Quinn, an operations specialist for the user's notes. Clarify only when blocked, make direct changes when asked, and keep status updates short.",
  },
];

const emptyDraft = (): Draft => ({
  name: "Ada",
  description: PRESETS[0]?.description ?? "",
  icon: PRESETS[0]?.icon ?? "\u{1F916}",
  provider: "",
  model: "",
  tools: PRESETS[0]?.tools ?? [],
  purpose: "Answer questions using my strongest notes.",
  style: "Direct, cited, and concise.",
  rules:
    "Search before answering. Cite page titles. Say when the notes do not contain enough evidence.",
  freeform: "",
});

const quoteYaml = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const unique = (values: readonly string[]): string[] => [...new Set(values.filter(Boolean))];

const sourceFromDraft = (draft: Draft): string => {
  const tools = unique(draft.tools);
  const frontmatter = [
    "---",
    `name: ${quoteYaml(draft.name.trim() || "Agent")}`,
    `description: ${quoteYaml(draft.description.trim())}`,
    `icon: ${quoteYaml(draft.icon.trim() || "\u{1F916}")}`,
    draft.provider ? `provider: ${draft.provider}` : "",
    draft.model.trim() ? `model: ${quoteYaml(draft.model.trim())}` : "",
    "tools:",
    ...tools.map((tool) => `  - ${tool}`),
    "---",
  ].filter((line) => line !== "");

  const body =
    draft.freeform.trim() ||
    [
      `You are ${draft.name.trim() || "an agent"}, an assistant working inside the user's Bethink notes.`,
      "",
      `Purpose: ${draft.purpose.trim() || draft.description.trim() || "Help with the user's notes."}`,
      `Response style: ${draft.style.trim() || "Clear, concise, and grounded."}`,
      "",
      "Operating rules:",
      ...(draft.rules.trim()
        ? draft.rules
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => `- ${line.replace(/^[-*]\s+/, "")}`)
        : ["- Use tools when they improve accuracy.", "- Be explicit about uncertainty."]),
    ].join("\n");

  return `${frontmatter.join("\n")}\n${body.trim()}\n`;
};

const draftFromPreset = (preset: Preset): Draft => ({
  ...emptyDraft(),
  name: preset.label,
  description: preset.description,
  icon: preset.icon,
  tools: preset.tools,
  purpose: preset.description,
  freeform: preset.prompt,
});

const draftFromAgent = (agent: AgentDef): Draft => ({
  ...emptyDraft(),
  name: `${agent.name} Copy`,
  description: agent.description,
  icon: agent.icon,
  provider: agent.provider ?? "",
  model: agent.model ?? "",
  tools: [...agent.tools],
  purpose: agent.description,
  freeform: agent.systemPrompt,
});

const StepButton = ({
  active,
  done,
  label,
  index,
}: {
  active: boolean;
  done: boolean;
  label: string;
  index: number;
}) => (
  <span className="agentwizard-step" data-active={active} data-done={done}>
    <span>{done ? <Check size={11} /> : index + 1}</span>
    {label}
  </span>
);

export const AgentWizard = () => {
  const { agentWizardOpen, agents, toolDefs, aiConfig } = useApp();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<SourceMode>("preset");
  const [presetId, setPresetId] = useState(PRESETS[0]?.id ?? "");
  const [existingSlug, setExistingSlug] = useState("");
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [creating, setCreating] = useState(false);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const existing = agents.find((a) => a.slug === existingSlug) ?? agents[0];
  const source = useMemo(() => sourceFromDraft(draft), [draft]);
  const selectedTools = new Set(draft.tools);

  useEffect(() => {
    if (!agentWizardOpen) return;
    setStep(0);
    setMode("preset");
    setPresetId(PRESETS[0]?.id ?? "");
    setExistingSlug(agents[0]?.slug ?? "");
    setDraft(emptyDraft());
    setCreating(false);
  }, [agentWizardOpen, agents]);

  useEffect(() => {
    if (!agentWizardOpen) return;
    if (mode === "preset" && preset) setDraft(draftFromPreset(preset));
    if (mode === "existing" && existing) setDraft(draftFromAgent(existing));
    if (mode === "guided") {
      setDraft({
        ...emptyDraft(),
        name: "Notes Specialist",
        description: "A custom agent guided by my answers.",
        icon: "\u{1F9ED}",
        tools: ["vault.search", "vault.read", "vault.semanticsearch"],
        freeform: "",
      });
    }
    if (mode === "freeform") {
      setDraft({
        ...emptyDraft(),
        name: "Custom Agent",
        description: "A custom agent described in freeform.",
        icon: "\u{1F916}",
        tools: ["vault.search", "vault.read"],
        freeform:
          "Describe the agent's role, what it should do, when it should use tools, and how it should respond.",
      });
    }
  }, [mode, preset, existing, agentWizardOpen]);

  useEffect(() => {
    if (!agentWizardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") actions.closeAgentWizard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agentWizardOpen]);

  if (!agentWizardOpen) return null;

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));
  const toggleTool = (tool: string) => {
    patch({
      tools: selectedTools.has(tool)
        ? draft.tools.filter((name) => name !== tool)
        : [...draft.tools, tool],
    });
  };

  const create = async () => {
    const name = draft.name.trim();
    if (!name || creating) return;
    setCreating(true);
    await actions.createAgentFromSource({ name, source });
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape also closes
    <div className="agentwizard-overlay" onClick={() => actions.closeAgentWizard()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls handle keyboard */}
      <div
        className="agentwizard"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="agentwizard-head">
          <div>
            <h2>Create agent</h2>
            <p>Agents are Markdown files with model, provider, tools, and a prompt.</p>
          </div>
          <button
            type="button"
            className="agentwizard-close"
            title="Close"
            onClick={() => actions.closeAgentWizard()}
          >
            <X size={15} />
          </button>
        </header>

        <div className="agentwizard-steps">
          {["Source", "Shape", "Provider", "Review"].map((label, i) => (
            <StepButton key={label} label={label} index={i} active={step === i} done={step > i} />
          ))}
        </div>

        <div className="agentwizard-body">
          {step === 0 ? (
            <div className="agentwizard-grid">
              {[
                { id: "preset", label: "Preset / template", icon: <Sparkles size={16} /> },
                { id: "existing", label: "Copy existing", icon: <Copy size={16} /> },
                { id: "guided", label: "Guided setup", icon: <Wand2 size={16} /> },
                { id: "freeform", label: "Freeform", icon: <PenLine size={16} /> },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="agentwizard-source"
                  data-active={mode === item.id}
                  onClick={() => setMode(item.id as SourceMode)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}

              {mode === "preset" ? (
                <div className="agentwizard-panel agentwizard-span">
                  {PRESETS.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className="agentwizard-preset"
                      data-active={presetId === p.id}
                      onClick={() => setPresetId(p.id)}
                    >
                      <span className="agentwizard-agenticon">{p.icon}</span>
                      <span>
                        <strong>{p.label}</strong>
                        <small>{p.description}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {mode === "existing" ? (
                <label className="agentwizard-field agentwizard-span">
                  Existing agent
                  <select
                    value={existingSlug}
                    onChange={(e) => setExistingSlug(e.target.value)}
                    disabled={agents.length === 0}
                  >
                    {agents.length === 0 ? <option>No agents yet</option> : null}
                    {agents.map((agent) => (
                      <option key={agent.slug} value={agent.slug}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {mode === "guided" ? (
                <p className="agentwizard-note agentwizard-span">
                  The next step asks for role, behavior, and limits, then turns that into a system
                  prompt.
                </p>
              ) : null}

              {mode === "freeform" ? (
                <p className="agentwizard-note agentwizard-span">
                  Write the full system prompt yourself. The wizard still adds provider, model, and
                  tool metadata.
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="agentwizard-form">
              <div className="agentwizard-row">
                <label className="agentwizard-field agentwizard-iconfield">
                  Icon
                  <input
                    value={draft.icon}
                    maxLength={4}
                    onChange={(e) => patch({ icon: e.target.value })}
                  />
                </label>
                <label className="agentwizard-field">
                  Name
                  <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
                </label>
              </div>
              <label className="agentwizard-field">
                Description
                <input
                  value={draft.description}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </label>
              {mode === "freeform" ? (
                <label className="agentwizard-field">
                  System prompt
                  <textarea
                    value={draft.freeform}
                    onChange={(e) => patch({ freeform: e.target.value })}
                  />
                </label>
              ) : (
                <>
                  <label className="agentwizard-field">
                    What should this agent do?
                    <textarea
                      value={draft.purpose}
                      onChange={(e) => patch({ purpose: e.target.value })}
                    />
                  </label>
                  <label className="agentwizard-field">
                    Response style
                    <input value={draft.style} onChange={(e) => patch({ style: e.target.value })} />
                  </label>
                  <label className="agentwizard-field">
                    Rules and limits
                    <textarea
                      value={draft.rules}
                      onChange={(e) => patch({ rules: e.target.value })}
                    />
                  </label>
                </>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="agentwizard-form">
              <div className="agentwizard-row">
                <label className="agentwizard-field">
                  Provider
                  <select
                    value={draft.provider}
                    onChange={(e) => patch({ provider: e.target.value as AiProvider | "" })}
                  >
                    <option value="">
                      App default{aiConfig ? ` (${PROVIDERS[aiConfig.provider].label})` : ""}
                    </option>
                    {PROVIDER_IDS.map((id) => (
                      <option key={id} value={id}>
                        {PROVIDERS[id].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="agentwizard-field">
                  Model override
                  <input
                    placeholder={
                      draft.provider ? PROVIDERS[draft.provider].defaultModel : "Use app default"
                    }
                    value={draft.model}
                    onChange={(e) => patch({ model: e.target.value })}
                  />
                </label>
              </div>
              <div className="agentwizard-tools">
                {toolDefs.map((tool) => (
                  <label key={tool.name} className="agentwizard-tool">
                    <input
                      type="checkbox"
                      checked={selectedTools.has(tool.name)}
                      onChange={() => toggleTool(tool.name)}
                    />
                    <span>
                      <strong>{tool.name}</strong>
                      <small>{tool.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="agentwizard-review">
              <div className="agentwizard-card">
                <span className="agentwizard-agenticon">{draft.icon || "\u{1F916}"}</span>
                <span>
                  <strong>{draft.name || "Agent"}</strong>
                  <small>{draft.description || "No description"}</small>
                </span>
              </div>
              <pre>{source}</pre>
            </div>
          ) : null}
        </div>

        <footer className="agentwizard-foot">
          <button
            type="button"
            className="agentwizard-btn"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft size={13} /> Back
          </button>
          <span className="agentwizard-spacer" />
          {step < 3 ? (
            <button
              type="button"
              className="agentwizard-btn agentwizard-primary"
              disabled={mode === "existing" && agents.length === 0}
              onClick={() => setStep((s) => Math.min(3, s + 1))}
            >
              Next <ChevronRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              className="agentwizard-btn agentwizard-primary"
              disabled={!draft.name.trim() || creating}
              onClick={() => void create()}
            >
              <Bot size={13} /> {creating ? "Creating..." : "Create agent"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
