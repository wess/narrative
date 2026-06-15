import type { AgentRun, AgentRunStatus, AgentStopReason, ToolCall } from "../../shared/types.ts";
import { openAgentStore } from "./store.ts";

type AgentRunRow = {
  readonly id: number;
  readonly requestId: string;
  readonly agentSlug: string | null;
  readonly channelSlug: string | null;
  readonly userPrompt: string;
  readonly status: AgentRunStatus;
  readonly content: string;
  readonly error: string;
  readonly toolCalls: string;
  readonly stopReason: AgentStopReason;
  readonly iterations: number;
  readonly durationMs: number;
  readonly createdAt: string;
};

export type RecordAgentRunInput = {
  readonly requestId: string;
  readonly agentSlug?: string | null;
  readonly channelSlug?: string | null;
  readonly userPrompt: string;
  readonly status: AgentRunStatus;
  readonly content?: string;
  readonly error?: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly stopReason?: AgentStopReason;
  readonly iterations?: number;
  readonly durationMs: number;
};

const decodeToolCalls = (raw: string): ToolCall[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ToolCall[]) : [];
  } catch {
    return [];
  }
};

const fromRow = (row: AgentRunRow): AgentRun => ({
  id: row.id,
  requestId: row.requestId,
  agentSlug: row.agentSlug,
  channelSlug: row.channelSlug,
  userPrompt: row.userPrompt,
  status: row.status,
  content: row.content,
  error: row.error,
  toolCalls: decodeToolCalls(row.toolCalls),
  stopReason: row.stopReason,
  iterations: row.iterations,
  durationMs: row.durationMs,
  createdAt: row.createdAt,
});

const defaultStopReason = (status: AgentRunStatus): AgentStopReason =>
  status === "cancelled"
    ? "cancelled"
    : status === "maxiterations"
      ? "maxiterations"
      : status === "error"
        ? "error"
        : "complete";

export const recordAgentRun = async (
  vaultRoot: string,
  input: RecordAgentRunInput,
): Promise<void> => {
  const db = await openAgentStore(vaultRoot);
  db.exec(
    `INSERT INTO agentRuns
      (requestId, agentSlug, channelSlug, userPrompt, status, content, error, toolCalls, stopReason, iterations, durationMs, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.requestId,
    input.agentSlug ?? null,
    input.channelSlug ?? null,
    input.userPrompt.slice(0, 6000),
    input.status,
    (input.content ?? "").slice(0, 12000),
    input.error ?? "",
    JSON.stringify(input.toolCalls ?? []),
    input.stopReason ?? defaultStopReason(input.status),
    input.iterations ?? 0,
    input.durationMs,
    new Date().toISOString(),
  );
};

export const listAgentRuns = async (vaultRoot: string, limit = 50): Promise<AgentRun[]> => {
  const db = await openAgentStore(vaultRoot);
  return db
    .query<AgentRunRow>(
      "SELECT * FROM agentRuns ORDER BY id DESC LIMIT ?",
      Math.max(1, Math.min(200, Math.floor(limit))),
    )
    .map(fromRow);
};
