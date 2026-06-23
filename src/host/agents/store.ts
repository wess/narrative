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
      allowRead INTEGER NOT NULL DEFAULT 1,
      allowWrite INTEGER NOT NULL DEFAULT 0,
      allowRun INTEGER NOT NULL DEFAULT 0,
      approvedCommands TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  for (const column of [
    "allowRead INTEGER NOT NULL DEFAULT 1",
    "allowWrite INTEGER NOT NULL DEFAULT 0",
    "allowRun INTEGER NOT NULL DEFAULT 0",
    "approvedCommands TEXT NOT NULL DEFAULT '[]'",
  ]) {
    try {
      db.exec(`ALTER TABLE projects ADD COLUMN ${column}`);
    } catch {
      // Existing vaults already have the column.
    }
  }
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
      pinned INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    db.exec("ALTER TABLE memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Existing vaults already have the column.
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS projectRuns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectSlug TEXT NOT NULL,
      command TEXT NOT NULL,
      cwd TEXT NOT NULL DEFAULT '',
      exitCode INTEGER,
      stdout TEXT NOT NULL DEFAULT '',
      stderr TEXT NOT NULL DEFAULT '',
      durationMs INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projectSnapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectSlug TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS propertyValues (
      subjectType TEXT NOT NULL,
      subjectId TEXT NOT NULL,
      subjectName TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (subjectType, subjectId, key)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvasNodes (
      id TEXT PRIMARY KEY,
      subjectType TEXT NOT NULL,
      subjectId TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      width REAL NOT NULL DEFAULT 190,
      height REAL NOT NULL DEFAULT 92,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvasEdges (
      id TEXT PRIMARY KEY,
      fromNode TEXT NOT NULL,
      toNode TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvasHiddenNodes (
      id TEXT PRIMARY KEY,
      hiddenAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS webCaptures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      pageId INTEGER NOT NULL,
      pageTitle TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentRuns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requestId TEXT NOT NULL,
      agentSlug TEXT,
      channelSlug TEXT,
      userPrompt TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      toolCalls TEXT NOT NULL DEFAULT '[]',
      stopReason TEXT NOT NULL DEFAULT 'complete',
      iterations INTEGER NOT NULL DEFAULT 0,
      durationMs INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  for (const column of [
    "stopReason TEXT NOT NULL DEFAULT 'complete'",
    "iterations INTEGER NOT NULL DEFAULT 0",
  ]) {
    try {
      db.exec(`ALTER TABLE agentRuns ADD COLUMN ${column}`);
    } catch {
      // Existing vaults already have the column.
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS channelMessages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channelSlug TEXT NOT NULL,
      agentSlug TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      toolCalls TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projectWriteProposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectSlug TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      reviewComment TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    db.exec("ALTER TABLE projectWriteProposals ADD COLUMN reviewComment TEXT NOT NULL DEFAULT ''");
  } catch {
    // Existing vaults already have the column.
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS kanbanCards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectSlug TEXT,
      channelSlug TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT NOT NULL DEFAULT 'normal',
      agentSlug TEXT,
      pageId INTEGER,
      sortKey REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      projectSlug TEXT,
      channelSlug TEXT,
      steps TEXT NOT NULL DEFAULT '[]',
      triggers TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflowRuns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflowSlug TEXT NOT NULL,
      status TEXT NOT NULL,
      triggerKind TEXT NOT NULL DEFAULT 'manual',
      input TEXT NOT NULL DEFAULT '',
      output TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      stepResults TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS harnessScenarios (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agentSlug TEXT,
      channelSlug TEXT,
      prompt TEXT NOT NULL DEFAULT '',
      expected TEXT NOT NULL DEFAULT '',
      tools TEXT NOT NULL DEFAULT '[]',
      maxIterations INTEGER NOT NULL DEFAULT 8,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS harnessRuns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenarioSlug TEXT NOT NULL,
      agentRunId INTEGER,
      status TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      stopReason TEXT NOT NULL DEFAULT 'complete',
      iterations INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS memories_scope_idx ON memories(scope, channelSlug, updatedAt)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS memories_agent_idx ON memories(agentSlug, updatedAt)");
  db.exec("CREATE INDEX IF NOT EXISTS projects_channel_idx ON projects(channelSlug)");
  db.exec("CREATE INDEX IF NOT EXISTS project_runs_project_idx ON projectRuns(projectSlug, id)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS project_snapshots_file_idx ON projectSnapshots(projectSlug, path, id)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS property_values_key_idx ON propertyValues(key, value)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS canvas_nodes_subject_idx ON canvasNodes(subjectType, subjectId)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS canvas_edges_from_idx ON canvasEdges(fromNode)");
  db.exec("CREATE INDEX IF NOT EXISTS canvas_hidden_nodes_idx ON canvasHiddenNodes(hiddenAt)");
  db.exec("CREATE INDEX IF NOT EXISTS web_captures_url_idx ON webCaptures(url)");
  db.exec("CREATE INDEX IF NOT EXISTS agent_runs_created_idx ON agentRuns(createdAt, id)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS channel_messages_channel_idx ON channelMessages(channelSlug, id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS project_write_proposals_status_idx ON projectWriteProposals(status, id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS kanban_cards_project_idx ON kanbanCards(projectSlug, status, sortKey)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS kanban_cards_channel_idx ON kanbanCards(channelSlug, status, sortKey)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS workflows_project_idx ON workflows(projectSlug)");
  db.exec("CREATE INDEX IF NOT EXISTS workflows_channel_idx ON workflows(channelSlug)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS workflow_runs_workflow_idx ON workflowRuns(workflowSlug, id)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS harness_runs_scenario_idx ON harnessRuns(scenarioSlug, id)");
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
  table: "agents" | "channels" | "commands" | "projects" | "harnessScenarios" | "workflows",
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
