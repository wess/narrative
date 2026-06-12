import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Hash,
  PenLine,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChannelDef, ChannelMode } from "../../shared/types.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

type SourceMode = "preset" | "existing" | "guided" | "freeform";

type Draft = {
  name: string;
  description: string;
  icon: string;
  agents: string[];
  mode: ChannelMode;
  context: string;
  purpose: string;
  outcome: string;
  rules: string;
  freeform: string;
};

type Preset = {
  id: string;
  label: string;
  icon: string;
  description: string;
  purpose: string;
  outcome: string;
  rules: string;
};

const PRESETS: Preset[] = [
  {
    id: "project",
    label: "Project room",
    icon: "\u{1F6E0}\u{FE0F}",
    description: "Coordinate agents around a product, feature, or implementation plan.",
    purpose: "Build or improve a project with a shared brief and assigned agents.",
    outcome: "A clear plan, useful tradeoffs, and concrete next actions.",
    rules:
      "Stay grounded in the vault. Separate decisions from open questions. Keep action items explicit.",
  },
  {
    id: "studio",
    label: "Writing studio",
    icon: "\u{1F3D7}\u{FE0F}",
    description: "Use multiple agents to draft, critique, and refine writing.",
    purpose: "Turn raw ideas into polished written work.",
    outcome: "Drafts, revisions, editorial critique, and final copy.",
    rules: "Preserve the user's voice. Call out weak claims. Keep revisions concise.",
  },
  {
    id: "lab",
    label: "Research lab",
    icon: "\u{1F52C}",
    description: "Investigate questions with research, synthesis, and review roles.",
    purpose: "Research a topic using vault notes and explicit uncertainty.",
    outcome: "A sourced synthesis with gaps, contradictions, and recommended follow-up.",
    rules: "Search before answering. Cite page titles. Distinguish evidence from inference.",
  },
  {
    id: "ops",
    label: "Task desk",
    icon: "\u{1F4CB}",
    description: "Track a focused task list with agents assigned to execution and review.",
    purpose: "Move a concrete set of tasks forward.",
    outcome: "Completed actions, blockers, and the next useful task.",
    rules: "Prefer short updates. Ask only when blocked. Do not drift from the task.",
  },
];

const emptyDraft = (): Draft => ({
  name: "Project Room",
  description: PRESETS[0]?.description ?? "",
  icon: PRESETS[0]?.icon ?? "\u{1F4AC}",
  agents: [],
  mode: "roundtable",
  context: "",
  purpose: PRESETS[0]?.purpose ?? "",
  outcome: PRESETS[0]?.outcome ?? "",
  rules: PRESETS[0]?.rules ?? "",
  freeform: "",
});

const quoteYaml = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const listLines = (values: readonly string[]): string[] =>
  values.length > 0 ? values.map((value) => `  - ${value}`) : [];

const sourceFromDraft = (draft: Draft): string => {
  const context = draft.context
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  const frontmatter = [
    "---",
    `name: ${quoteYaml(draft.name.trim() || "Channel")}`,
    `description: ${quoteYaml(draft.description.trim())}`,
    `icon: ${quoteYaml(draft.icon.trim() || "\u{1F4AC}")}`,
    `mode: ${draft.mode}`,
    "agents:",
    ...listLines(draft.agents),
    "context:",
    ...listLines(context),
    "---",
  ];
  const body =
    draft.freeform.trim() ||
    [
      `Purpose: ${draft.purpose.trim() || draft.description.trim() || "Collaborate on a task."}`,
      `Desired outcome: ${draft.outcome.trim() || "Useful answers and next actions."}`,
      "",
      "Channel rules:",
      ...(draft.rules.trim()
        ? draft.rules
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => `- ${line.replace(/^[-*]\s+/, "")}`)
        : ["- Keep replies focused.", "- Surface blockers clearly."]),
    ].join("\n");
  return `${frontmatter.join("\n")}\n${body.trim()}\n`;
};

const draftFromPreset = (preset: Preset): Draft => ({
  ...emptyDraft(),
  name: preset.label,
  description: preset.description,
  icon: preset.icon,
  purpose: preset.purpose,
  outcome: preset.outcome,
  rules: preset.rules,
});

const draftFromChannel = (channel: ChannelDef): Draft => ({
  ...emptyDraft(),
  name: `${channel.name} Copy`,
  description: channel.description,
  icon: channel.icon,
  agents: [...channel.agents],
  mode: channel.mode,
  context: channel.context.join("\n"),
  purpose: channel.description,
  freeform: channel.brief,
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

export const ChannelWizard = () => {
  const { channelWizardOpen, channels, agents } = useApp();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<SourceMode>("preset");
  const [presetId, setPresetId] = useState(PRESETS[0]?.id ?? "");
  const [existingSlug, setExistingSlug] = useState("");
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [creating, setCreating] = useState(false);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const existing = channels.find((c) => c.slug === existingSlug) ?? channels[0];
  const source = useMemo(() => sourceFromDraft(draft), [draft]);
  const selectedAgents = new Set(draft.agents);

  useEffect(() => {
    if (!channelWizardOpen) return;
    setStep(0);
    setMode("preset");
    setPresetId(PRESETS[0]?.id ?? "");
    setExistingSlug(channels[0]?.slug ?? "");
    setDraft(emptyDraft());
    setCreating(false);
  }, [channelWizardOpen, channels]);

  useEffect(() => {
    if (!channelWizardOpen) return;
    if (mode === "preset" && preset) setDraft(draftFromPreset(preset));
    if (mode === "existing" && existing) setDraft(draftFromChannel(existing));
    if (mode === "guided") {
      setDraft({
        ...emptyDraft(),
        name: "Build Room",
        description: "A guided channel for planning and project work.",
        icon: "\u{1F6E0}\u{FE0F}",
      });
    }
    if (mode === "freeform") {
      setDraft({
        ...emptyDraft(),
        name: "Custom Channel",
        description: "A custom multi-agent room.",
        icon: "\u{1F4AC}",
        freeform:
          "Describe what this channel is for, what the agents should collaborate on, and what a useful answer looks like.",
      });
    }
  }, [mode, preset, existing, channelWizardOpen]);

  useEffect(() => {
    if (!channelWizardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") actions.closeChannelWizard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channelWizardOpen]);

  if (!channelWizardOpen) return null;

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));
  const toggleAgent = (slug: string) => {
    patch({
      agents: selectedAgents.has(slug)
        ? draft.agents.filter((agent) => agent !== slug)
        : [...draft.agents, slug],
    });
  };
  const create = async () => {
    const name = draft.name.trim();
    if (!name || creating) return;
    setCreating(true);
    await actions.createChannelFromSource({ name, source });
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape also closes
    <div className="agentwizard-overlay" onClick={() => actions.closeChannelWizard()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls handle keyboard */}
      <div
        className="agentwizard"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="agentwizard-head">
          <div>
            <h2>Create channel</h2>
            <p>Channels are project rooms with a brief, context, and one or more member agents.</p>
          </div>
          <button
            type="button"
            className="agentwizard-close"
            title="Close"
            onClick={() => actions.closeChannelWizard()}
          >
            <X size={15} />
          </button>
        </header>

        <div className="agentwizard-steps">
          {["Source", "Shape", "Members", "Review"].map((label, i) => (
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
                  Existing channel
                  <select
                    value={existingSlug}
                    onChange={(e) => setExistingSlug(e.target.value)}
                    disabled={channels.length === 0}
                  >
                    {channels.length === 0 ? <option>No channels yet</option> : null}
                    {channels.map((channel) => (
                      <option key={channel.slug} value={channel.slug}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {mode === "guided" ? (
                <p className="agentwizard-note agentwizard-span">
                  The next steps ask what the room is for, which agents belong in it, and how they
                  should respond.
                </p>
              ) : null}
              {mode === "freeform" ? (
                <p className="agentwizard-note agentwizard-span">
                  Write the channel brief yourself. The wizard still adds member and routing
                  metadata.
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
                  Channel brief
                  <textarea
                    value={draft.freeform}
                    onChange={(e) => patch({ freeform: e.target.value })}
                  />
                </label>
              ) : (
                <>
                  <label className="agentwizard-field">
                    What is this channel for?
                    <textarea
                      value={draft.purpose}
                      onChange={(e) => patch({ purpose: e.target.value })}
                    />
                  </label>
                  <label className="agentwizard-field">
                    Desired outcome
                    <input
                      value={draft.outcome}
                      onChange={(e) => patch({ outcome: e.target.value })}
                    />
                  </label>
                  <label className="agentwizard-field">
                    Channel rules
                    <textarea
                      value={draft.rules}
                      onChange={(e) => patch({ rules: e.target.value })}
                    />
                  </label>
                </>
              )}
              <label className="agentwizard-field">
                Context pages or folders
                <input
                  value={draft.context}
                  placeholder="Roadmap, Architecture, Launch Plan"
                  onChange={(e) => patch({ context: e.target.value })}
                />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="agentwizard-form">
              <label className="agentwizard-field">
                Routing
                <select
                  value={draft.mode}
                  onChange={(e) => patch({ mode: e.target.value as ChannelMode })}
                >
                  <option value="roundtable">Roundtable — every member replies</option>
                  <option value="focus">Focus — first member replies</option>
                  <option value="manual">Manual — keep membership, route later</option>
                </select>
              </label>
              <div className="agentwizard-tools">
                {agents.map((agent) => (
                  <label key={agent.slug} className="agentwizard-tool">
                    <input
                      type="checkbox"
                      checked={selectedAgents.has(agent.slug)}
                      onChange={() => toggleAgent(agent.slug)}
                    />
                    <span>
                      <strong>
                        {agent.icon} {agent.name}
                      </strong>
                      <small>{agent.description || "No role description yet."}</small>
                    </span>
                  </label>
                ))}
              </div>
              {agents.length === 0 ? (
                <p className="agentwizard-note">Create an agent first, then add it to a channel.</p>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="agentwizard-review">
              <div className="agentwizard-card">
                <span className="agentwizard-agenticon">{draft.icon || "\u{1F4AC}"}</span>
                <span>
                  <strong>{draft.name || "Channel"}</strong>
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
              disabled={mode === "existing" && channels.length === 0}
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
              <Hash size={13} /> {creating ? "Creating..." : "Create channel"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
