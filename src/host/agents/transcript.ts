import type { ChannelMessage, ToolCall } from "../../shared/types.ts";
import { openAgentStore, safeSlug } from "./store.ts";

type ChannelMessageRow = {
  readonly id: number;
  readonly channelSlug: string;
  readonly agentSlug: string | null;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly toolCalls: string;
  readonly createdAt: string;
};

export type RecordChannelMessageInput = {
  readonly channelSlug: string;
  readonly agentSlug?: string | null;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
};

const decodeToolCalls = (raw: string): ToolCall[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ToolCall[]) : [];
  } catch {
    return [];
  }
};

const fromRow = (row: ChannelMessageRow): ChannelMessage => ({
  id: row.id,
  channelSlug: row.channelSlug,
  agentSlug: row.agentSlug,
  role: row.role,
  content: row.content,
  toolCalls: decodeToolCalls(row.toolCalls),
  createdAt: row.createdAt,
});

export const recordChannelMessage = async (
  vaultRoot: string,
  input: RecordChannelMessageInput,
): Promise<void> => {
  const channelSlug = safeSlug(input.channelSlug);
  if (!channelSlug || !input.content.trim()) return;
  const db = await openAgentStore(vaultRoot);
  db.exec(
    `INSERT INTO channelMessages
      (channelSlug, agentSlug, role, content, toolCalls, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)`,
    channelSlug,
    input.agentSlug ?? null,
    input.role,
    input.content,
    JSON.stringify(input.toolCalls ?? []),
    new Date().toISOString(),
  );
};

export const listChannelMessages = async (
  vaultRoot: string,
  channelSlug: string,
  limit = 80,
): Promise<ChannelMessage[]> => {
  const clean = safeSlug(channelSlug);
  if (!clean) return [];
  const db = await openAgentStore(vaultRoot);
  return db
    .query<ChannelMessageRow>(
      `SELECT * FROM channelMessages
        WHERE channelSlug = ?
        ORDER BY id DESC
        LIMIT ?`,
      clean,
      Math.max(1, Math.min(limit, 300)),
    )
    .map(fromRow)
    .reverse();
};
