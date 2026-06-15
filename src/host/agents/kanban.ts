import type { KanbanBoard, KanbanCard, KanbanPriority, KanbanStatus } from "../../shared/types.ts";
import { openAgentStore, safeSlug } from "./store.ts";

type CardRow = {
  readonly id: number;
  readonly projectSlug: string | null;
  readonly channelSlug: string | null;
  readonly title: string;
  readonly description: string;
  readonly status: KanbanStatus;
  readonly priority: KanbanPriority;
  readonly agentSlug: string | null;
  readonly pageId: number | null;
  readonly sortKey: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type KanbanQuery = {
  readonly projectSlug?: string | null;
  readonly channelSlug?: string | null;
};

export type KanbanInput = KanbanQuery & {
  readonly title: string;
  readonly description?: string;
  readonly status?: KanbanStatus;
  readonly priority?: KanbanPriority;
  readonly agentSlug?: string | null;
  readonly pageId?: number | null;
};

export type KanbanPatch = {
  readonly title?: string;
  readonly description?: string;
  readonly status?: KanbanStatus;
  readonly priority?: KanbanPriority;
  readonly agentSlug?: string | null;
  readonly pageId?: number | null;
};

const columns: readonly KanbanStatus[] = ["backlog", "ready", "doing", "review", "done"];
const priorities: readonly KanbanPriority[] = ["low", "normal", "high"];

const now = (): string => new Date().toISOString();

const cleanStatus = (status: KanbanStatus | undefined): KanbanStatus =>
  status && columns.includes(status) ? status : "backlog";

const cleanPriority = (priority: KanbanPriority | undefined): KanbanPriority =>
  priority && priorities.includes(priority) ? priority : "normal";

const cleanSlug = (slug: string | null | undefined): string | null =>
  slug ? safeSlug(slug) : null;

const cardFromRow = (row: CardRow): KanbanCard => ({
  id: row.id,
  projectSlug: row.projectSlug,
  channelSlug: row.channelSlug,
  title: row.title,
  description: row.description,
  status: cleanStatus(row.status),
  priority: cleanPriority(row.priority),
  agentSlug: row.agentSlug,
  pageId: row.pageId,
  sortKey: row.sortKey,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const scopedWhere = (
  projectSlug: string | null,
  channelSlug: string | null,
): { readonly sql: string; readonly args: readonly unknown[] } => {
  if (projectSlug) return { sql: "projectSlug = ?", args: [projectSlug] };
  if (channelSlug) return { sql: "channelSlug = ?", args: [channelSlug] };
  return { sql: "projectSlug IS NULL AND channelSlug IS NULL", args: [] };
};

export const listKanbanBoard = async (
  vaultRoot: string,
  query: KanbanQuery = {},
): Promise<KanbanBoard> => {
  const projectSlug = cleanSlug(query.projectSlug);
  const channelSlug = projectSlug ? null : cleanSlug(query.channelSlug);
  const db = await openAgentStore(vaultRoot);
  const where = scopedWhere(projectSlug, channelSlug);
  const cards = db
    .query<CardRow>(
      `SELECT * FROM kanbanCards WHERE ${where.sql} ORDER BY sortKey ASC, id ASC`,
      ...where.args,
    )
    .map(cardFromRow);
  return { projectSlug, channelSlug, columns, cards };
};

export const createKanbanCard = async (
  vaultRoot: string,
  input: KanbanInput,
): Promise<KanbanCard | null> => {
  const title = input.title.trim();
  if (!title) return null;
  const projectSlug = cleanSlug(input.projectSlug);
  const channelSlug = projectSlug ? null : cleanSlug(input.channelSlug);
  const status = cleanStatus(input.status);
  const board = await listKanbanBoard(vaultRoot, { projectSlug, channelSlug });
  const sortKey =
    Math.max(
      0,
      ...board.cards.filter((card) => card.status === status).map((card) => card.sortKey),
    ) + 100;
  const stamp = now();
  const db = await openAgentStore(vaultRoot);
  db.exec(
    `INSERT INTO kanbanCards
      (projectSlug, channelSlug, title, description, status, priority, agentSlug, pageId, sortKey, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectSlug,
    channelSlug,
    title,
    input.description?.trim() ?? "",
    status,
    cleanPriority(input.priority),
    cleanSlug(input.agentSlug),
    input.pageId ?? null,
    sortKey,
    stamp,
    stamp,
  );
  const row = db.query<CardRow>("SELECT * FROM kanbanCards ORDER BY id DESC LIMIT 1")[0];
  return row ? cardFromRow(row) : null;
};

export const getKanbanCard = async (vaultRoot: string, id: number): Promise<KanbanCard | null> => {
  const db = await openAgentStore(vaultRoot);
  const row = db.query<CardRow>("SELECT * FROM kanbanCards WHERE id = ? LIMIT 1", id)[0];
  return row ? cardFromRow(row) : null;
};

export const updateKanbanCard = async (
  vaultRoot: string,
  id: number,
  patch: KanbanPatch,
): Promise<KanbanCard | null> => {
  const current = await getKanbanCard(vaultRoot, id);
  if (!current) return null;
  const db = await openAgentStore(vaultRoot);
  db.exec(
    `UPDATE kanbanCards SET
      title = ?, description = ?, status = ?, priority = ?, agentSlug = ?, pageId = ?, updatedAt = ?
      WHERE id = ?`,
    patch.title?.trim() || current.title,
    patch.description ?? current.description,
    cleanStatus(patch.status ?? current.status),
    cleanPriority(patch.priority ?? current.priority),
    patch.agentSlug === undefined ? current.agentSlug : cleanSlug(patch.agentSlug),
    patch.pageId === undefined ? current.pageId : patch.pageId,
    now(),
    id,
  );
  return getKanbanCard(vaultRoot, id);
};

export const moveKanbanCard = async (
  vaultRoot: string,
  id: number,
  status: KanbanStatus,
  sortKey?: number,
): Promise<KanbanCard | null> => {
  const current = await getKanbanCard(vaultRoot, id);
  if (!current) return null;
  const nextStatus = cleanStatus(status);
  const db = await openAgentStore(vaultRoot);
  const nextSort =
    sortKey ??
    Math.max(
      0,
      ...(
        await listKanbanBoard(vaultRoot, {
          projectSlug: current.projectSlug,
          channelSlug: current.channelSlug,
        })
      ).cards
        .filter((card) => card.status === nextStatus && card.id !== id)
        .map((card) => card.sortKey),
    ) + 100;
  db.exec(
    "UPDATE kanbanCards SET status = ?, sortKey = ?, updatedAt = ? WHERE id = ?",
    nextStatus,
    nextSort,
    now(),
    id,
  );
  return getKanbanCard(vaultRoot, id);
};

export const deleteKanbanCard = async (vaultRoot: string, id: number): Promise<KanbanBoard> => {
  const current = await getKanbanCard(vaultRoot, id);
  const db = await openAgentStore(vaultRoot);
  db.exec("DELETE FROM kanbanCards WHERE id = ?", id);
  return listKanbanBoard(vaultRoot, {
    projectSlug: current?.projectSlug ?? null,
    channelSlug: current?.channelSlug ?? null,
  });
};

export const buildKanbanPrompt = async (
  vaultRoot: string,
  id: number,
): Promise<{ prompt: string; agentSlug: string | null; channelSlug: string | null } | null> => {
  const card = await getKanbanCard(vaultRoot, id);
  if (!card) return null;
  const prompt = [
    `Work this Kanban card: ${card.title}`,
    "",
    `Status: ${card.status}`,
    `Priority: ${card.priority}`,
    card.description.trim() ? `Details:\n${card.description.trim()}` : "Details: none provided.",
    "",
    "Return a concise plan, then perform the next useful action with the tools you have.",
  ].join("\n");
  return { prompt, agentSlug: card.agentSlug, channelSlug: card.channelSlug };
};
