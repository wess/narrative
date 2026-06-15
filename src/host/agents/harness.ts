import type {
  AgentStopReason,
  HarnessRun,
  HarnessRunStatus,
  HarnessScenario,
} from "../../shared/types.ts";
import { freshSlug, openAgentStore, safeSlug } from "./store.ts";

type ScenarioRow = {
  readonly slug: string;
  readonly name: string;
  readonly agentSlug: string | null;
  readonly channelSlug: string | null;
  readonly prompt: string;
  readonly expected: string;
  readonly tools: string;
  readonly maxIterations: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type RunRow = {
  readonly id: number;
  readonly scenarioSlug: string;
  readonly agentRunId: number | null;
  readonly status: HarnessRunStatus;
  readonly score: number;
  readonly notes: string;
  readonly stopReason: AgentStopReason;
  readonly iterations: number;
  readonly createdAt: string;
};

export type HarnessScenarioInput = {
  readonly name: string;
  readonly agentSlug?: string | null;
  readonly channelSlug?: string | null;
  readonly prompt: string;
  readonly expected?: string;
  readonly tools?: readonly string[];
  readonly maxIterations?: number;
};

export type HarnessRunInput = {
  readonly scenarioSlug: string;
  readonly agentRunId?: number | null;
  readonly status: HarnessRunStatus;
  readonly score?: number;
  readonly notes?: string;
  readonly stopReason?: AgentStopReason;
  readonly iterations?: number;
};

const now = (): string => new Date().toISOString();

const cleanList = (values: readonly string[] = []): string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const parseList = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? cleanList(parsed.filter((item) => typeof item === "string"))
      : [];
  } catch {
    return [];
  }
};

const scenarioFromRow = (row: ScenarioRow): HarnessScenario => ({
  slug: row.slug,
  name: row.name,
  agentSlug: row.agentSlug,
  channelSlug: row.channelSlug,
  prompt: row.prompt,
  expected: row.expected,
  tools: parseList(row.tools),
  maxIterations: row.maxIterations,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const runFromRow = (row: RunRow): HarnessRun => ({
  id: row.id,
  scenarioSlug: row.scenarioSlug,
  agentRunId: row.agentRunId,
  status: row.status,
  score: row.score,
  notes: row.notes,
  stopReason: row.stopReason,
  iterations: row.iterations,
  createdAt: row.createdAt,
});

export const createHarnessScenario = async (
  vaultRoot: string,
  input: HarnessScenarioInput,
): Promise<HarnessScenario | { error: string }> => {
  const name = input.name.trim();
  const prompt = input.prompt.trim();
  if (!name || !prompt) return { error: "name and prompt are required" };
  const db = await openAgentStore(vaultRoot);
  const slug = await freshSlug(vaultRoot, "harnessScenarios", name, "scenario");
  const stamp = now();
  db.exec(
    `INSERT INTO harnessScenarios
      (slug, name, agentSlug, channelSlug, prompt, expected, tools, maxIterations, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    slug,
    name,
    input.agentSlug ?? null,
    input.channelSlug ?? null,
    prompt,
    input.expected?.trim() ?? "",
    JSON.stringify(cleanList(input.tools ?? [])),
    Math.max(1, Math.min(32, Math.floor(input.maxIterations ?? 8))),
    stamp,
    stamp,
  );
  const row = db.query<ScenarioRow>("SELECT * FROM harnessScenarios WHERE slug = ?", slug)[0];
  return row ? scenarioFromRow(row) : { error: "scenario insert failed" };
};

export const listHarnessScenarios = async (
  vaultRoot: string,
  limit = 100,
): Promise<HarnessScenario[]> => {
  const db = await openAgentStore(vaultRoot);
  return db
    .query<ScenarioRow>(
      "SELECT * FROM harnessScenarios ORDER BY updatedAt DESC, slug LIMIT ?",
      Math.max(1, Math.min(300, Math.floor(limit))),
    )
    .map(scenarioFromRow);
};

export const recordHarnessRun = async (
  vaultRoot: string,
  input: HarnessRunInput,
): Promise<HarnessRun | { error: string }> => {
  const clean = safeSlug(input.scenarioSlug);
  if (!clean) return { error: "scenario is required" };
  const db = await openAgentStore(vaultRoot);
  const scenario = db.query<ScenarioRow>("SELECT * FROM harnessScenarios WHERE slug = ?", clean)[0];
  if (!scenario) return { error: "scenario not found" };
  db.exec(
    `INSERT INTO harnessRuns
      (scenarioSlug, agentRunId, status, score, notes, stopReason, iterations, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    clean,
    input.agentRunId ?? null,
    input.status,
    Math.max(0, Math.min(1, input.score ?? (input.status === "pass" ? 1 : 0))),
    input.notes?.trim() ?? "",
    input.stopReason ?? (input.status === "error" ? "error" : "complete"),
    Math.max(0, Math.floor(input.iterations ?? 0)),
    now(),
  );
  const row = db.query<RunRow>("SELECT * FROM harnessRuns ORDER BY id DESC LIMIT 1")[0];
  return row ? runFromRow(row) : { error: "harness run insert failed" };
};

export const listHarnessRuns = async (
  vaultRoot: string,
  scenarioSlug?: string,
  limit = 100,
): Promise<HarnessRun[]> => {
  const db = await openAgentStore(vaultRoot);
  const capped = Math.max(1, Math.min(300, Math.floor(limit)));
  const clean = scenarioSlug ? safeSlug(scenarioSlug) : null;
  return (
    clean
      ? db.query<RunRow>(
          "SELECT * FROM harnessRuns WHERE scenarioSlug = ? ORDER BY id DESC LIMIT ?",
          clean,
          capped,
        )
      : db.query<RunRow>("SELECT * FROM harnessRuns ORDER BY id DESC LIMIT ?", capped)
  ).map(runFromRow);
};
