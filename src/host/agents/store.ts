import { mkdir, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { connect, type DB } from "@basket/db";

const DATA_DIR = ".narrative";
const DATA_FILE = "narrative.sqlite";
const SLUG_RE = /^[a-z0-9]+$/;

const stores = new Map<string, DB>();

export const safeSlug = (slug: string): string | null => (SLUG_RE.test(slug) ? slug : null);

export const slugify = (name: string, fallback = "item"): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 64) || fallback;

const dbPath = (vaultRoot: string): string => join(vaultRoot, DATA_DIR, DATA_FILE);

const migrateStore = (db: DB): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '🤖',
      provider TEXT,
      model TEXT,
      tools TEXT NOT NULL DEFAULT '[]',
      systemPrompt TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS commands (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '✨',
      agent TEXT,
      provider TEXT,
      model TEXT,
      tools TEXT NOT NULL DEFAULT '[]',
      prompt TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '💬',
      mode TEXT NOT NULL DEFAULT 'roundtable',
      agents TEXT NOT NULL DEFAULT '[]',
      projects TEXT NOT NULL DEFAULT '[]',
      context TEXT NOT NULL DEFAULT '[]',
      brief TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      channelSlug TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      channelSlug TEXT,
      agentSlug TEXT,
      kind TEXT NOT NULL DEFAULT 'turn',
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'chat',
      weight REAL NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS memories_scope_idx ON memories(scope, channelSlug, updatedAt)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS memories_agent_idx ON memories(agentSlug, updatedAt)");
  db.exec("CREATE INDEX IF NOT EXISTS projects_channel_idx ON projects(channelSlug)");
};

export const openAgentStore = async (vaultRoot: string): Promise<DB> => {
  const existing = stores.get(vaultRoot);
  if (existing) return existing;
  await mkdir(join(vaultRoot, DATA_DIR), { recursive: true });
  const db = connect(dbPath(vaultRoot));
  migrateStore(db);
  stores.set(vaultRoot, db);
  return db;
};

export const closeAgentStore = (vaultRoot: string): void => {
  const db = stores.get(vaultRoot);
  if (!db) return;
  db.close();
  stores.delete(vaultRoot);
};

export const freshSlug = async (
  vaultRoot: string,
  table: "agents" | "channels" | "commands" | "projects",
  name: string,
  fallback: string,
): Promise<string> => {
  const db = await openAgentStore(vaultRoot);
  const base = slugify(name, fallback);
  let candidate = base;
  let n = 1;
  while (db.query<{ slug: string }>(`SELECT slug FROM ${table} WHERE slug = ?`, candidate).length) {
    candidate = `${base}${n++}`;
  }
  return candidate;
};

export const hasRows = (db: DB, table: string): boolean =>
  db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)[0]?.count !== 0;

export const encodeList = (values: readonly string[]): string => JSON.stringify([...values]);

export const decodeList = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

export const listMarkdown = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir);
    return entries.filter((name) => name.toLowerCase().endsWith(".md"));
  } catch {
    return [];
  }
};

export const projectNameFromPath = (path: string): string => basename(path) || path;
