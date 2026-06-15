import { GitBranch, Play, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkflowStep, WorkflowTrigger, WorkflowTriggerKind } from "../../shared/types.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

type Mode = "template" | "guided" | "freeform";
type Template = "agentreview" | "releasecheck" | "webhooktriage";

const step = (
  id: string,
  name: string,
  kind: WorkflowStep["kind"],
  config: WorkflowStep["config"],
  index: number,
): WorkflowStep => ({ id, name, kind, config, x: 80 + index * 220, y: 110 });

const trigger = (
  id: string,
  name: string,
  kind: WorkflowTriggerKind,
  enabled: boolean,
  config: WorkflowTrigger["config"] = {},
): WorkflowTrigger => ({ id, name, kind, enabled, config });

const templateSteps = (template: Template): readonly WorkflowStep[] => {
  if (template === "releasecheck") {
    return [
      step(
        "inspect",
        "Inspect project state",
        "agent",
        { prompt: "Review the project for release blockers." },
        0,
      ),
      step("test", "Run approved checks", "runcommand", { command: "bun test" }, 1),
      step("approve", "Human approval", "approval", {}, 2),
    ];
  }
  if (template === "webhooktriage") {
    return [
      step("receive", "Receive webhook", "webhook", { event: "incoming payload" }, 0),
      step(
        "triage",
        "Triage request",
        "agent",
        { prompt: "Summarize the payload and recommend next action." },
        1,
      ),
      step("page", "Create note", "createpage", { title: "Webhook triage" }, 2),
    ];
  }
  return [
    step(
      "brief",
      "Review card or brief",
      "agent",
      { prompt: "Understand the work and define the next action." },
      0,
    ),
    step("propose", "Propose project change", "proposefile", { path: "choose target file" }, 1),
    step("review", "Human review", "approval", {}, 2),
  ];
};

const templateName = (template: Template): string => {
  if (template === "releasecheck") return "Release check";
  if (template === "webhooktriage") return "Webhook triage";
  return "Agent review loop";
};

const parseFreeform = (text: string): readonly WorkflowStep[] => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (lines.length === 0) return templateSteps("agentreview");
  return lines.map((line, index) =>
    step(
      `step${index + 1}`,
      line,
      line.toLowerCase().includes("approve") ? "approval" : "agent",
      { prompt: line },
      index,
    ),
  );
};

export const Workflows = () => {
  const { workflowsOpen, workflows, workflowRuns, projects, channels } = useApp();
  const [mode, setMode] = useState<Mode>("template");
  const [template, setTemplate] = useState<Template>("agentreview");
  const [name, setName] = useState("Agent review loop");
  const [description, setDescription] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [channelSlug, setChannelSlug] = useState("");
  const [schedule, setSchedule] = useState("");
  const [webhook, setWebhook] = useState(false);
  const [integration, setIntegration] = useState("");
  const [freeform, setFreeform] = useState("");

  const runsByWorkflow = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const run of workflowRuns)
      grouped.set(run.workflowSlug, (grouped.get(run.workflowSlug) ?? 0) + 1);
    return grouped;
  }, [workflowRuns]);

  if (!workflowsOpen) return null;

  const buildTriggers = (): readonly WorkflowTrigger[] => [
    trigger("manual", "Manual run", "manual", true),
    ...(schedule.trim()
      ? [trigger("schedule", "Scheduled run", "schedule", true, { cron: schedule.trim() })]
      : []),
    ...(webhook
      ? [trigger("webhook", "Webhook run", "webhook", true, { path: `/webhooks/${name.trim()}` })]
      : []),
    ...(integration.trim()
      ? [
          trigger("integration", integration.trim(), "integration", true, {
            name: integration.trim(),
          }),
        ]
      : []),
  ];

  const submit = async (): Promise<void> => {
    const workflowName = name.trim() || templateName(template);
    const steps =
      mode === "freeform"
        ? parseFreeform(freeform)
        : mode === "guided"
          ? [
              step(
                "plan",
                "Plan work",
                "agent",
                { prompt: "Create a short plan for this workflow." },
                0,
              ),
              step(
                "act",
                "Perform next action",
                "agent",
                { prompt: "Perform the next useful action." },
                1,
              ),
              step("approve", "Human approval", "approval", {}, 2),
            ]
          : templateSteps(template);
    await actions.createWorkflow({
      name: workflowName,
      description,
      projectSlug: projectSlug || null,
      channelSlug: channelSlug || null,
      steps: [...steps],
      triggers: [...buildTriggers()],
    });
    setName(templateName(template));
    setDescription("");
    setFreeform("");
  };

  return (
    <div className="workflow-overlay">
      <section className="workflow">
        <header className="workflow-head">
          <div>
            <span>Automation</span>
            <h2>Workflows</h2>
            <p>Define repeatable procedures, trigger them, and view them on the canvas.</p>
          </div>
          <button type="button" title="Close" onClick={() => actions.closeWorkflows()}>
            <X size={16} />
          </button>
        </header>
        <div className="workflow-body">
          <section className="workflow-create">
            <div className="workflow-tabs">
              {(["template", "guided", "freeform"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  data-active={mode === item}
                  onClick={() => setMode(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            {mode === "template" ? (
              <div className="workflow-templates">
                {(["agentreview", "releasecheck", "webhooktriage"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    data-active={template === item}
                    onClick={() => {
                      setTemplate(item);
                      setName(templateName(item));
                    }}
                  >
                    <GitBranch size={14} />
                    <span>{templateName(item)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="workflow-form">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Workflow name"
              />
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description"
              />
              <select value={projectSlug} onChange={(event) => setProjectSlug(event.target.value)}>
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.slug} value={project.slug}>
                    {project.name}
                  </option>
                ))}
              </select>
              <select value={channelSlug} onChange={(event) => setChannelSlug(event.target.value)}>
                <option value="">No channel</option>
                {channels.map((channel) => (
                  <option key={channel.slug} value={channel.slug}>
                    {channel.name}
                  </option>
                ))}
              </select>
              {mode === "freeform" ? (
                <textarea
                  value={freeform}
                  onChange={(event) => setFreeform(event.target.value)}
                  placeholder="One workflow step per line"
                />
              ) : null}
              <input
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
                placeholder="Schedule, e.g. 0 9 * * 1"
              />
              <input
                value={integration}
                onChange={(event) => setIntegration(event.target.value)}
                placeholder="Integration name"
              />
              <label className="workflow-check">
                <input
                  type="checkbox"
                  checked={webhook}
                  onChange={(event) => setWebhook(event.target.checked)}
                />
                <span>Enable webhook trigger</span>
              </label>
              <button type="button" className="workflow-primary" onClick={() => void submit()}>
                <Plus size={14} />
                <span>Create workflow</span>
              </button>
            </div>
          </section>
          <section className="workflow-list">
            {workflows.length > 0 ? (
              workflows.map((workflow) => (
                <article key={workflow.slug} className="workflow-item">
                  <header>
                    <div>
                      <strong>{workflow.name}</strong>
                      <small>{workflow.description || "No description"}</small>
                    </div>
                    <span>{workflow.steps.length} steps</span>
                  </header>
                  <div className="workflow-tags">
                    {workflow.triggers.map((item) => (
                      <span key={item.id} data-enabled={item.enabled}>
                        {item.kind}
                      </span>
                    ))}
                    <span>{runsByWorkflow.get(workflow.slug) ?? 0} runs</span>
                  </div>
                  <footer>
                    <button
                      type="button"
                      onClick={() => void actions.runWorkflow(workflow.slug, "manual")}
                    >
                      <Play size={13} />
                      <span>Run</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void actions.deleteWorkflow(workflow.slug)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </footer>
                </article>
              ))
            ) : (
              <p className="workflow-empty">No workflows yet.</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
};
