// The node repository. Reads are plain queries against the in-memory index;
// mutations go to the *filesystem first* (the vault is a folder of Markdown
// files — that's the source of truth) and then sync the index. Reads take a
// bare `DB`; mutations take the whole `OpenVault` because they touch files,
// the sidecar, and config.

import { basename, dirname } from "node:path";
import { type DB, from } from "@basket/db";
import type { NodeKind, Page, PageMeta, TreeNode } from "../shared/types.ts";
import { linkKey } from "./parse.ts";
import { embeddingsTable, type NodeRow, nodesTable } from "./schema.ts";
import { makeFolder, movePath, removePath, uniqueRelPath, writeMarkdown } from "./vault/fileio.ts";
import { reindexNode, unindexNode } from "./vault/reindex.ts";
import { dropMeta, moveMeta, saveSidecar, setMeta } from "./vault/sidecar.ts";
import type { OpenVault } from "./vault/types.ts";

// --- helpers --------------------------------------------------------------

// Title -> a filesystem-safe path segment.
const sanitizeName = (title: string): string => {
  const cleaned = title
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "Untitled";
};

const inFolder = (path: string, folder: string): boolean =>
  folder !== "" && (path === folder || path.startsWith(`${folder}/`));

export const rowToPage = (r: NodeRow): Page => ({
  id: r.id,
  path: r.path,
  kind: r.kind as NodeKind,
  title: r.title,
  body: r.body,
  icon: r.icon,
  parentId: r.parentId,
  pinned: Boolean(r.pinned),
  archived: Boolean(r.archived),
  isDaily: Boolean(r.isDaily),
  isTemplate: Boolean(r.isTemplate),
  sortKey: r.sortKey,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const rowToMeta = (r: NodeRow): PageMeta => ({
  id: r.id,
  path: r.path,
  kind: r.kind as NodeKind,
  title: r.title,
  icon: r.icon,
  parentId: r.parentId,
  pinned: Boolean(r.pinned),
  archived: Boolean(r.archived),
  isDaily: Boolean(r.isDaily),
  isTemplate: Boolean(r.isTemplate),
  sortKey: r.sortKey,
  updatedAt: r.updatedAt,
});

const getRow = (db: DB, id: number): NodeRow | undefined =>
  db.one(from(nodesTable).where((q) => q("id").equals(id)));

const rowByPath = (db: DB, path: string): NodeRow | undefined =>
  db.one(from(nodesTable).where((q) => q("path").equals(path)));

// The vault-relative folder path that should *contain* a child of `parentId`.
// A file can't hold children, so a file `parentId` resolves to that file's
// own containing folder. `null` -> the vault root ("").
const containerPathFor = (db: DB, parentId: number | null | undefined): string => {
  if (parentId === null || parentId === undefined) return "";
  const row = getRow(db, parentId);
  if (!row) return "";
  if (row.kind === "folder") return row.path;
  // A file id — fall back to the file's own folder.
  const slash = row.path.lastIndexOf("/");
  return slash < 0 ? "" : row.path.slice(0, slash);
};

// Find — creating if needed — the folder node for a vault-relative folder
// path, materialising every intermediate folder on disk and in the index.
const ensureFolder = async (vault: OpenVault, relPath: string): Promise<NodeRow | null> => {
  if (relPath === "") return null;
  const existing = rowByPath(vault.db, relPath);
  if (existing && existing.kind === "folder") return existing;

  const segments = relPath.split("/").filter(Boolean);
  let accum = "";
  let parentId: number | null = null;
  let row: NodeRow | null = null;
  for (const seg of segments) {
    accum = accum ? `${accum}/${seg}` : seg;
    const found = rowByPath(vault.db, accum);
    if (found && found.kind === "folder") {
      row = found;
      parentId = found.id;
      continue;
    }
    await makeFolder(vault.root, accum);
    const now = new Date().toISOString();
    row = vault.db.insert(nodesTable, {
      path: accum,
      kind: "folder",
      title: seg,
      body: "",
      parentId,
      mtime: Date.now(),
      createdAt: now,
      updatedAt: now,
    });
    parentId = row.id;
  }
  return row;
};

// Re-thread the *index + sidecar* for a node now sitting at `newPath` — the
// disk move has already happened. Shared by `relocate` (Bethink-initiated
// moves) and the filesystem watcher (external moves it correlates).
export const applyRelocation = (vault: OpenVault, row: NodeRow, newPath: string): void => {
  const oldPath = row.path;
  if (oldPath === newPath) return;
  moveMeta(vault.sidecar, oldPath, newPath);
  saveSidecar(vault.root, vault.sidecar);

  const newParentPath = dirname(newPath) === "." ? "" : dirname(newPath);
  const newParentId = newParentPath ? (rowByPath(vault.db, newParentPath)?.id ?? null) : null;
  const newTitle =
    row.kind === "file" ? basename(newPath).replace(/\.md$/i, "") : basename(newPath);

  vault.db.update(nodesTable, { id: row.id }, {
    path: newPath,
    title: newTitle,
    parentId: newParentId,
  } as Partial<NodeRow>);
  if (row.kind === "file" && newTitle !== row.title) {
    reindexNode(vault.db, { id: row.id, title: newTitle, body: row.body });
  }

  // Descendants: only their `path` string changes — ids and structure hold.
  if (row.kind === "folder") {
    const prefix = `${oldPath}/`;
    const descendants = vault.db.query<NodeRow>(
      "SELECT * FROM nodes WHERE path LIKE ?",
      `${prefix}%`,
    );
    for (const d of descendants) {
      vault.db.update(nodesTable, { id: d.id }, {
        path: `${newPath}/${d.path.slice(prefix.length)}`,
      } as Partial<NodeRow>);
    }
  }
};

// Move a node (file or folder) to a new vault-relative path: rename on disk,
// then re-thread the index + sidecar.
const relocate = async (vault: OpenVault, row: NodeRow, newPath: string): Promise<void> => {
  if (row.path === newPath) return;
  await movePath(vault.root, row.path, newPath);
  applyRelocation(vault, row, newPath);
};

// --- mutations ------------------------------------------------------------

export type CreateInput = {
  readonly title?: string;
  readonly parentId?: number | null;
  readonly body?: string;
  readonly icon?: string;
  readonly sortKey?: number;
};

export const createPage = async (vault: OpenVault, input: CreateInput): Promise<Page> => {
  const containerPath = containerPathFor(vault.db, input.parentId);
  const parentRow = containerPath ? await ensureFolder(vault, containerPath) : null;

  const fileName = `${sanitizeName(input.title?.trim() || "Untitled")}.md`;
  const relPath = await uniqueRelPath(
    vault.root,
    containerPath ? `${containerPath}/${fileName}` : fileName,
  );
  const body = input.body ?? "";
  const mtime = await writeMarkdown(vault.root, relPath, body);

  const now = new Date().toISOString();
  const row = vault.db.insert(nodesTable, {
    path: relPath,
    kind: "file",
    title: basename(relPath).replace(/\.md$/i, ""),
    body,
    parentId: parentRow?.id ?? null,
    icon: input.icon ?? "",
    isDaily: inFolder(relPath, vault.config.dailyFolder),
    isTemplate: inFolder(relPath, vault.config.templatesFolder),
    sortKey: input.sortKey ?? 0,
    mtime,
    createdAt: now,
    updatedAt: now,
  });
  reindexNode(vault.db, row);

  if (input.icon || input.sortKey) {
    setMeta(vault.sidecar, relPath, { icon: input.icon, sortKey: input.sortKey });
    saveSidecar(vault.root, vault.sidecar);
  }
  return rowToPage(row);
};

export const createFolder = async (
  vault: OpenVault,
  parentId: number | null,
  title: string,
): Promise<Page> => {
  const containerPath = containerPathFor(vault.db, parentId);
  if (containerPath) await ensureFolder(vault, containerPath);
  const name = sanitizeName(title.trim() || "New Folder");
  const relPath = await uniqueRelPath(
    vault.root,
    containerPath ? `${containerPath}/${name}` : name,
  );
  const row = await ensureFolder(vault, relPath);
  if (!row) throw new Error("failed to create folder");
  return rowToPage(row);
};

export type UpdateInput = {
  readonly id: number;
  readonly title?: string;
  readonly body?: string;
  readonly icon?: string;
  readonly parentId?: number | null;
  readonly pinned?: boolean;
  readonly archived?: boolean;
  readonly isTemplate?: boolean;
  readonly sortKey?: number;
};

export const updatePage = async (vault: OpenVault, input: UpdateInput): Promise<Page> => {
  const row = getRow(vault.db, input.id);
  if (!row) throw new Error(`node ${input.id} not found`);

  // Body — write the file, refresh the index row + derived rows.
  if (input.body !== undefined && row.kind === "file") {
    const mtime = await writeMarkdown(vault.root, row.path, input.body);
    vault.db.update(nodesTable, { id: row.id }, {
      body: input.body,
      mtime,
      updatedAt: new Date().toISOString(),
    } as Partial<NodeRow>);
    reindexNode(vault.db, { id: row.id, title: row.title, body: input.body });
  }

  // A new parent is a move; a new title is a rename. Both go through
  // `relocate`, which re-reads the row so we pick up the body write above.
  const moveParent = input.parentId !== undefined && input.parentId !== row.parentId;
  const renameTitle = input.title !== undefined && input.title.trim() !== row.title;
  if (moveParent || renameTitle) {
    const current = getRow(vault.db, input.id) ?? row;
    const containerPath = moveParent
      ? containerPathFor(vault.db, input.parentId)
      : dirname(current.path) === "."
        ? ""
        : dirname(current.path);
    if (moveParent && containerPath) await ensureFolder(vault, containerPath);
    const name = renameTitle
      ? sanitizeName(input.title?.trim() ?? current.title)
      : basename(current.path).replace(/\.md$/i, "");
    const leaf = current.kind === "file" ? `${name}.md` : name;
    const target = await uniqueRelPath(
      vault.root,
      containerPath ? `${containerPath}/${leaf}` : leaf,
    );
    await relocate(vault, current, target);
  }

  // Bethink-local metadata — index column + sidecar.
  const metaPatch: Record<string, unknown> = {};
  const sidePatch: Parameters<typeof setMeta>[2] = {};
  if (input.icon !== undefined) {
    metaPatch.icon = input.icon;
    sidePatch.icon = input.icon;
  }
  if (input.pinned !== undefined) {
    metaPatch.pinned = input.pinned;
    sidePatch.pinned = input.pinned;
  }
  if (input.archived !== undefined) {
    metaPatch.archived = input.archived;
    sidePatch.archived = input.archived;
  }
  if (input.isTemplate !== undefined) {
    metaPatch.isTemplate = input.isTemplate;
    sidePatch.isTemplate = input.isTemplate;
  }
  if (input.sortKey !== undefined) {
    metaPatch.sortKey = input.sortKey;
    sidePatch.sortKey = input.sortKey;
  }
  if (Object.keys(metaPatch).length > 0) {
    vault.db.update(nodesTable, { id: input.id }, metaPatch as Partial<NodeRow>);
    const fresh = getRow(vault.db, input.id);
    if (fresh) {
      setMeta(vault.sidecar, fresh.path, sidePatch);
      saveSidecar(vault.root, vault.sidecar);
    }
  }

  const final = getRow(vault.db, input.id);
  if (!final) throw new Error(`node ${input.id} vanished mid-update`);
  return rowToPage(final);
};

// Delete a node and (for folders) its whole subtree. Returns every removed
// id so the webview can prune its local state in one pass.
export const deletePage = async (
  vault: OpenVault,
  id: number,
): Promise<{ id: number; removed: number[] }> => {
  const row = getRow(vault.db, id);
  if (!row) return { id, removed: [] };

  const subtree =
    row.kind === "folder"
      ? [row, ...vault.db.query<NodeRow>("SELECT * FROM nodes WHERE path LIKE ?", `${row.path}/%`)]
      : [row];

  await removePath(vault.root, row.path);
  dropMeta(vault.sidecar, row.path);
  saveSidecar(vault.root, vault.sidecar);

  const removed: number[] = [];
  for (const node of subtree) {
    vault.db.remove(nodesTable, { id: node.id });
    vault.db.remove(embeddingsTable, { nodeId: node.id });
    unindexNode(vault.db, node.id);
    removed.push(node.id);
  }
  return { id, removed };
};

export const movePage = async (
  vault: OpenVault,
  id: number,
  parentId: number | null,
  sortKey: number,
): Promise<Page> => {
  const row = getRow(vault.db, id);
  if (!row) throw new Error(`node ${id} not found`);

  const containerPath = containerPathFor(vault.db, parentId);
  if (containerPath) await ensureFolder(vault, containerPath);
  const leaf = basename(row.path);
  const target = await uniqueRelPath(vault.root, containerPath ? `${containerPath}/${leaf}` : leaf);
  await relocate(vault, row, target);

  const moved = getRow(vault.db, id);
  if (!moved) throw new Error(`node ${id} vanished mid-move`);
  vault.db.update(nodesTable, { id }, { sortKey } as Partial<NodeRow>);
  setMeta(vault.sidecar, moved.path, { sortKey });
  saveSidecar(vault.root, vault.sidecar);

  const final = getRow(vault.db, id);
  return rowToPage(final ?? moved);
};

// --- reads ----------------------------------------------------------------

export const getPage = (db: DB, id: number): Page | null => {
  const row = getRow(db, id);
  return row ? rowToPage(row) : null;
};

// Look up a *file* node by (case-insensitive) title — does NOT create it.
export const findByTitle = (db: DB, title: string): Page | null => {
  const row = db.query<NodeRow>(
    "SELECT * FROM nodes WHERE kind = 'file' AND lower(title) = ? AND archived = 0 LIMIT 1",
    linkKey(title),
  )[0];
  return row ? rowToPage(row) : null;
};

// Find a file by title, or create it at the vault root. Backs wiki links
// that point at a page which doesn't exist yet.
export const resolveByTitle = async (vault: OpenVault, title: string): Promise<Page> => {
  const existing = findByTitle(vault.db, title);
  if (existing) return existing;
  return createPage(vault, { title: title.trim() });
};

// Find (or create) the daily note for an ISO date — lives in the configured
// daily folder, e.g. `Daily/2026-05-14.md`.
export const resolveDaily = async (vault: OpenVault, date: string): Promise<Page> => {
  const dailyFolder = vault.config.dailyFolder;
  const relPath = dailyFolder ? `${dailyFolder}/${date}.md` : `${date}.md`;
  const existing = rowByPath(vault.db, relPath);
  if (existing) return rowToPage(existing);
  const folder = dailyFolder ? await ensureFolder(vault, dailyFolder) : null;
  return createPage(vault, { title: date, parentId: folder?.id ?? null, icon: "\u{1F4C5}" });
};

const byUpdatedDesc = (a: PageMeta, b: PageMeta) => b.updatedAt.localeCompare(a.updatedAt);

export const pinnedPages = (db: DB): PageMeta[] =>
  db
    .query<NodeRow>("SELECT * FROM nodes WHERE kind = 'file' AND pinned = 1 AND archived = 0")
    .map(rowToMeta)
    .sort(byUpdatedDesc);

export const recentPages = (db: DB): PageMeta[] =>
  db
    .query<NodeRow>(
      "SELECT * FROM nodes WHERE kind = 'file' AND archived = 0 ORDER BY updatedAt DESC LIMIT 20",
    )
    .map(rowToMeta);

export const archivedPages = (db: DB): PageMeta[] =>
  db
    .query<NodeRow>(
      "SELECT * FROM nodes WHERE kind = 'file' AND archived = 1 ORDER BY updatedAt DESC",
    )
    .map(rowToMeta);

export const dailyPages = (db: DB): PageMeta[] =>
  db
    .query<NodeRow>(
      "SELECT * FROM nodes WHERE kind = 'file' AND isDaily = 1 AND archived = 0 ORDER BY title DESC",
    )
    .map(rowToMeta);

export const templatePages = (db: DB): PageMeta[] =>
  db
    .query<NodeRow>(
      "SELECT * FROM nodes WHERE kind = 'file' AND isTemplate = 1 AND archived = 0 ORDER BY title ASC",
    )
    .map(rowToMeta);

// The full non-archived hierarchy — folders *and* files — nested and sorted:
// folders before files, then by manual sort key, then by title.
export const buildTree = (db: DB): TreeNode[] => {
  const metas = db.query<NodeRow>("SELECT * FROM nodes WHERE archived = 0").map(rowToMeta);

  const byParent = new Map<number | null, PageMeta[]>();
  for (const m of metas) {
    const bucket = byParent.get(m.parentId);
    if (bucket) bucket.push(m);
    else byParent.set(m.parentId, [m]);
  }

  const order = (a: PageMeta, b: PageMeta) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.sortKey - b.sortKey || a.title.localeCompare(b.title);
  };

  const grow = (parentId: number | null): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort(order)
      .map((m) => ({ ...m, children: grow(m.id) }));

  return grow(null);
};
