import type {
  Workflow,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStep,
  WorkflowStepKind,
  WorkflowStepResult,
  WorkflowTrigger,
  WorkflowTriggerKind,
} from "../../shared/types.ts";
import { freshSlug, openAgentStore, safeSlug } from "./store.ts";

type WorkflowRow = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly projectSlug: string | null;
  readonly channelSlug: string | null;
  readonly steps: string;
  readonly triggers: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type RunRow = {
  readonly id: number;
  readonly workflowSlug: string;
  readonly status: WorkflowRunStatus;
  readonly triggerKind: WorkflowTriggerKind;
  readonly input: string;
  readonly output: string;
  readonly error: string;
  readonly stepResults: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type WorkflowInput = {
  readonly name: string;
  readonly description?: string;
  readonly projectSlug?: string | null;
  readonly channelSlug?: string | null;
  readonly steps?: readonly WorkflowStep[];
  readonly triggers?: readonly WorkflowTrigger[];
};

export type WorkflowPatch = Partial<WorkflowInput>;

const triggerKinds: readonly WorkflowTriggerKind[] = [
  "manual",
  "schedule",
  "webhook",
  "integration",
];
const stepKinds: readonly WorkflowStepKind[] = [
  "agent",
  "search",
  "createpage",
  "proposefile",
  "runcommand",
  "approval",
  "webhook",
];
const runStatuses: readonly WorkflowRunStatus[] = [
  "queued",
  "running",
  "waiting",
  "ok",
  "error",
  "cancelled",
];

const now = (): string => new Date().toISOString();

const cleanSlug = (slug: string | null | undefined): string | null =>
  slug ? safeSlug(slug) : null;

const jsonArray = <T>(raw: string, guard: (value: unknown) => value is T): T[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
};

const objectConfig = (value: unknown): Readonly<Record<string, unknown>> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};

const isStep = (value: unknown): value is WorkflowStep => {
  if (!value || typeof value !== "object") return false;
  const item = value as WorkflowStep;
  return (
    typeof item.id === "string" &&
    typeof item.kind === "string" &&
    typeof item.name === "string" &&
    typeof item.x === "number" &&
    typeof item.y === "number"
  );
};

const isTrigger = (value: unknown): value is WorkflowTrigger => {
  if (!value || typeof value !== "object") return false;
  const item = value as WorkflowTrigger;
  return (
    typeof item.id === "string" &&
    triggerKinds.includes(item.kind) &&
    typeof item.name === "string" &&
    typeof item.enabled === "boolean"
  );
};

const isStepResult = (value: unknown): value is WorkflowStepResult => {
  if (!value || typeof value !== "object") return false;
  const item = value as WorkflowStepResult;
  return (
    typeof item.stepId === "string" &&
    runStatuses.includes(item.status) &&
    typeof item.output === "string" &&
    typeof item.error === "string" &&
    typeof item.durationMs === "number"
  );
};

const defaultSteps: readonly WorkflowStep[] = [
  {
    id: "step1",
    kind: "agent",
    name: "Ask assigned agent",
    config: { prompt: "Review the request and perform the next useful action." },
    x: 80,
    y: 100,
  },
];

const defaultTriggers: readonly WorkflowTrigger[] = [
  { id: "manual", kind: "manual", name: "Manual run", config: {}, enabled: true },
];

const cleanSteps = (steps: readonly WorkflowStep[] | undefined): WorkflowStep[] => {
  const source = steps && steps.length > 0 ? steps : defaultSteps;
  return source.map((step, index) => ({
    id: step.id.trim() || `step${index + 1}`,
    kind: stepKinds.includes(step.kind) ? step.kind : "agent",
    name: step.name.trim() || `Step ${index + 1}`,
    config: objectConfig(step.config),
    x: Number.isFinite(step.x) ? step.x : 80 + index * 220,
    y: Number.isFinite(step.y) ? step.y : 100,
  }));
};

const cleanTriggers = (triggers: readonly WorkflowTrigger[] | undefined): WorkflowTrigger[] => {
  const source = triggers && triggers.length > 0 ? triggers : defaultTriggers;
  return source.map((trigger, index) => ({
    id: trigger.id.trim() || `trigger${index + 1}`,
    kind: triggerKinds.includes(trigger.kind) ? trigger.kind : "manual",
    name: trigger.name.trim() || `Trigger ${index + 1}`,
    config: objectConfig(trigger.config),
    enabled: Boolean(trigger.enabled),
  }));
};

const workflowFromRow = (row: WorkflowRow): Workflow => ({
  slug: row.slug,
  name: row.name,
  description: row.description,
  projectSlug: row.projectSlug,
  channelSlug: row.channelSlug,
  steps: cleanSteps(jsonArray(row.steps, isStep)),
  triggers: cleanTriggers(jsonArray(row.triggers, isTrigger)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const runFromRow = (row: RunRow): WorkflowRun => ({
  id: row.id,
  workflowSlug: row.workflowSlug,
  status: runStatuses.includes(row.status) ? row.status : "error",
  triggerKind: triggerKinds.includes(row.triggerKind) ? row.triggerKind : "manual",
  input: row.input,
  output: row.output,
  error: row.error,
  stepResults: jsonArray(row.stepResults, isStepResult),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const listWorkflows = async (vaultRoot: string): Promise<Workflow[]> => {
  const db = await openAgentStore(vaultRoot);
  return db
    .query<WorkflowRow>("SELECT * FROM workflows ORDER BY updatedAt DESC, name COLLATE NOCASE")
    .map(workflowFromRow);
};

export const getWorkflow = async (vaultRoot: string, slug: string): Promise<Workflow | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  const db = await openAgentStore(vaultRoot);
  const row = db.query<WorkflowRow>("SELECT * FROM workflows WHERE slug = ? LIMIT 1", clean)[0];
  return row ? workflowFromRow(row) : null;
};

export const createWorkflow = async (
  vaultRoot: string,
  input: WorkflowInput,
): Promise<Workflow | null> => {
  const name = input.name.trim();
  if (!name) return null;
  const slug = await freshSlug(vaultRoot, "workflows", name, "workflow");
  const stamp = now();
  const db = await openAgentStore(vaultRoot);
  db.exec(
    `INSERT INTO workflows
      (slug, name, description, projectSlug, channelSlug, steps, triggers, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    slug,
    name,
    input.description?.trim() ?? "",
    cleanSlug(input.projectSlug),
    cleanSlug(input.channelSlug),
    JSON.stringify(cleanSteps(input.steps)),
    JSON.stringify(cleanTriggers(input.triggers)),
    stamp,
    stamp,
  );
  return getWorkflow(vaultRoot, slug);
};

export const updateWorkflow = async (
  vaultRoot: string,
  slug: string,
  patch: WorkflowPatch,
): Promise<Workflow | null> => {
  const current = await getWorkflow(vaultRoot, slug);
  if (!current) return null;
  const db = await openAgentStore(vaultRoot);
  db.exec(
    `UPDATE workflows SET
      name = ?, description = ?, projectSlug = ?, channelSlug = ?, steps = ?, triggers = ?, updatedAt = ?
      WHERE slug = ?`,
    patch.name?.trim() || current.name,
    patch.description ?? current.description,
    patch.projectSlug === undefined ? current.projectSlug : cleanSlug(patch.projectSlug),
    patch.channelSlug === undefined ? current.channelSlug : cleanSlug(patch.channelSlug),
    JSON.stringify(patch.steps === undefined ? current.steps : cleanSteps(patch.steps)),
    JSON.stringify(patch.triggers === undefined ? current.triggers : cleanTriggers(patch.triggers)),
    now(),
    current.slug,
  );
  return getWorkflow(vaultRoot, current.slug);
};

export const deleteWorkflow = async (vaultRoot: string, slug: string): Promise<Workflow[]> => {
  const clean = safeSlug(slug);
  if (!clean) return listWorkflows(vaultRoot);
  const db = await openAgentStore(vaultRoot);
  db.exec("DELETE FROM workflows WHERE slug = ?", clean);
  return listWorkflows(vaultRoot);
};

const resultForStep = (step: WorkflowStep): WorkflowStepResult => {
  const started = Date.now();
  if (step.kind === "approval") {
    return {
      stepId: step.id,
      status: "waiting",
      output: "Waiting for human approval.",
      error: "",
      durationMs: Date.now() - started,
    };
  }
  const outputByKind: Record<string, string> = {
    agent: `Agent task queued: ${String(step.config.prompt ?? step.name)}`,
    search: `Search step ready: ${String(step.config.query ?? step.name)}`,
    createpage: `Page creation step ready: ${String(step.config.title ?? step.name)}`,
    proposefile: `File proposal step ready: ${String(step.config.path ?? step.name)}`,
    runcommand: `Command step ready: ${String(step.config.command ?? step.name)}`,
    webhook: `Webhook step ready: ${String(step.config.url ?? step.name)}`,
  };
  return {
    stepId: step.id,
    status: "ok",
    output: outputByKind[step.kind] ?? `Step ready: ${step.name}`,
    error: "",
    durationMs: Date.now() - started,
  };
};

export const runWorkflow = async (
  vaultRoot: string,
  slug: string,
  triggerKind: WorkflowTriggerKind = "manual",
  input = "",
): Promise<WorkflowRun | null> => {
  const workflow = await getWorkflow(vaultRoot, slug);
  if (!workflow) return null;
  const cleanTrigger = triggerKinds.includes(triggerKind) ? triggerKind : "manual";
  const stamp = now();
  const stepResults = workflow.steps.map(resultForStep);
  const waiting = stepResults.some((result) => result.status === "waiting");
  const error = stepResults.find((result) => result.status === "error")?.error ?? "";
  const status: WorkflowRunStatus = error ? "error" : waiting ? "waiting" : "ok";
  const output = stepResults.map((result) => result.output).join("\n");
  const db = await openAgentStore(vaultRoot);
  db.exec(
    `INSERT INTO workflowRuns
      (workflowSlug, status, triggerKind, input, output, error, stepResults, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    workflow.slug,
    status,
    cleanTrigger,
    input.trim(),
    output,
    error,
    JSON.stringify(stepResults),
    stamp,
    stamp,
  );
  const row = db.query<RunRow>("SELECT * FROM workflowRuns ORDER BY id DESC LIMIT 1")[0];
  return row ? runFromRow(row) : null;
};

export const listWorkflowRuns = async (
  vaultRoot: string,
  workflowSlug?: string,
  limit = 100,
): Promise<WorkflowRun[]> => {
  const db = await openAgentStore(vaultRoot);
  const capped = Math.max(1, Math.min(300, Math.floor(limit)));
  const clean = workflowSlug ? safeSlug(workflowSlug) : null;
  return (
    clean
      ? db.query<RunRow>(
          "SELECT * FROM workflowRuns WHERE workflowSlug = ? ORDER BY id DESC LIMIT ?",
          clean,
          capped,
        )
      : db.query<RunRow>("SELECT * FROM workflowRuns ORDER BY id DESC LIMIT ?", capped)
  ).map(runFromRow);
};
