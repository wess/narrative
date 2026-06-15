import { column, defineTable, type RowOf } from "@basket/db";

// The vault is now a folder of Markdown files on disk — this SQLite schema is
// a *derived index* over it, built fresh (in memory) every time a vault
// opens. A `node` is one entry in the vault tree: either a `.md` file (a
// page, with `body`) or a `folder` (a real directory, `body` empty). `path`
// is the vault-relative path and is the bridge back to the file on disk.
export const nodesTable = defineTable("nodes", {
  id: column.serial(),
  path: column.text().unique(), // vault-relative, e.g. "Projects/API.md"
  kind: column.text(), // "file" | "folder"
  title: column.text(), // file basename without `.md`, or folder name
  body: column.text().default(""), // file content cache; "" for folders
  parentId: column.integer().nullable(), // the containing folder's node id
  icon: column.text().default(""), // Bethink-local, from the sidecar
  pinned: column.boolean().default(false), // Bethink-local, from the sidecar
  archived: column.boolean().default(false), // Bethink-local, from the sidecar
  isDaily: column.boolean().default(false), // derived: lives in the daily folder
  isTemplate: column.boolean().default(false), // Bethink-local, from the sidecar
  sortKey: column.real().default(0), // Bethink-local manual order, from the sidecar
  mtime: column.real().default(0), // file mtime — drives change detection
  createdAt: column.timestamp().default("now()"),
  updatedAt: column.timestamp().default("now()"),
});

// Derived from `[[wiki links]]` in file bodies; rebuilt whenever a file is
// (re)indexed. `targetTitle` is the normalised link key — the target node is
// resolved by join, so renames never leave dangling rows.
export const linksTable = defineTable("links", {
  id: column.serial(),
  sourceId: column.integer(),
  targetTitle: column.text(),
});

// Derived from `#tags` in file bodies; rebuilt on every (re)index.
export const tagsTable = defineTable("tags", {
  id: column.serial(),
  nodeId: column.integer(),
  tag: column.text(),
});

// One embedding vector per file, for semantic RAG retrieval. `vector` is a
// JSON-encoded number[]; `model` lets us invalidate when the model changes.
export const embeddingsTable = defineTable("embeddings", {
  id: column.serial(),
  nodeId: column.integer().unique(),
  model: column.text(),
  vector: column.text(),
});

export const tables = [nodesTable, linksTable, tagsTable, embeddingsTable] as const;

export type NodeRow = RowOf<typeof nodesTable>;
export type LinkRow = RowOf<typeof linksTable>;
export type TagRow = RowOf<typeof tagsTable>;
export type EmbeddingRow = RowOf<typeof embeddingsTable>;
