import { closeAgentStore, openAgentStore } from "./store.ts";

export type MemoryScope = "global" | "channel";

export type MemoryInput = {
  readonly scope: MemoryScope;
  readonly channelSlug?: string | null;
  readonly agentSlug?: string | null;
  readonly kind?: string;
  readonly content: string;
  readonly source?: string;
  readonly weight?: number;
};

export type MemoryTurn = {
  readonly channelSlug?: string | null;
  readonly agentSlug?: string | null;
  readonly user: string;
  readonly assistant: string;
};

export type MemoryQuery = {
  readonly channelSlug?: string | null;
  readonly agentSlug?: string | null;
  readonly globalLimit?: number;
  readonly channelLimit?: number;
};

type MemoryRow = {
  readonly id: number;
  readonly scope: MemoryScope;
  readonly channelSlug: string | null;
  readonly agentSlug: string | null;
  readonly kind: string;
  readonly content: string;
  readonly source: string;
  readonly weight: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

const MAX_CONTENT = 6000;

const now = (): string => new Date().toISOString();

const trimContent = (content: string): string =>
  content
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CONTENT);

export const openMemory = openAgentStore;

export const closeMemory = closeAgentStore;

export const addMemory = async (vaultRoot: string, input: MemoryInput): Promise<void> => {
  const content = trimContent(input.content);
  if (!content) return;
  const db = await openMemory(vaultRoot);
  const stamp = now();
  db.exec(
    `INSERT INTO memories
      (scope, channelSlug, agentSlug, kind, content, source, weight, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.scope,
    input.scope === "channel" ? (input.channelSlug ?? null) : null,
    input.agentSlug ?? null,
    input.kind ?? "turn",
    content,
    input.source ?? "chat",
    input.weight ?? 1,
    stamp,
    stamp,
  );
};

export const rememberTurn = async (vaultRoot: string, turn: MemoryTurn): Promise<void> => {
  const content = trimContent(
    [`User: ${turn.user.trim()}`, `Assistant: ${turn.assistant.trim()}`].join("\n"),
  );
  if (!content) return;
  await addMemory(vaultRoot, {
    scope: "global",
    agentSlug: turn.agentSlug,
    kind: "turn",
    content: turn.channelSlug ? `Channel ${turn.channelSlug}\n${content}` : content,
  });
  if (turn.channelSlug) {
    await addMemory(vaultRoot, {
      scope: "channel",
      channelSlug: turn.channelSlug,
      agentSlug: turn.agentSlug,
      kind: "turn",
      content,
    });
  }
};

export const listGlobalMemories = async (
  vaultRoot: string,
  limit = 8,
): Promise<readonly MemoryRow[]> => {
  const db = await openMemory(vaultRoot);
  return db.query<MemoryRow>(
    `SELECT * FROM memories
      WHERE scope = 'global'
      ORDER BY weight DESC, updatedAt DESC, id DESC
      LIMIT ?`,
    limit,
  );
};

export const listChannelMemories = async (
  vaultRoot: string,
  channelSlug: string,
  limit = 8,
): Promise<readonly MemoryRow[]> => {
  const db = await openMemory(vaultRoot);
  return db.query<MemoryRow>(
    `SELECT * FROM memories
      WHERE scope = 'channel' AND channelSlug = ?
      ORDER BY weight DESC, updatedAt DESC, id DESC
      LIMIT ?`,
    channelSlug,
    limit,
  );
};

const bulletList = (rows: readonly MemoryRow[]): string =>
  rows.map((row) => `- ${row.content.replace(/\n/g, "\n  ")}`).join("\n");

export const memoryContext = async (
  vaultRoot: string,
  query: MemoryQuery = {},
): Promise<string> => {
  const global = await listGlobalMemories(vaultRoot, query.globalLimit ?? 6);
  const channel =
    query.channelSlug && query.channelLimit !== 0
      ? await listChannelMemories(vaultRoot, query.channelSlug, query.channelLimit ?? 8)
      : [];
  const parts = [
    global.length > 0 ? `Global memory:\n${bulletList(global)}` : "",
    channel.length > 0
      ? `Channel memory (${query.channelSlug ?? "channel"}):\n${bulletList(channel)}`
      : "",
  ].filter(Boolean);
  return parts.length > 0
    ? `Durable memory from prior work. Treat it as context, not as guaranteed fact.\n\n${parts.join(
        "\n\n",
      )}`
    : "";
};
