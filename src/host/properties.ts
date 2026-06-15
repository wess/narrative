import type { DB } from "@basket/db";
import type { BaseRow, BaseView, PropertySubjectType, PropertyValue } from "../shared/types.ts";
import { parseSource } from "./agents/parse.ts";
import { openAgentStore } from "./agents/store.ts";
import type { NodeRow } from "./schema.ts";
import type { OpenVault } from "./vault/types.ts";

type StoredPropertyRow = {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly key: string;
  readonly value: string;
  readonly source: string;
  readonly updatedAt: string;
};

type AgentRow = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly tools: string;
  readonly updatedAt: string;
};

type ChannelRow = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly mode: string;
  readonly agents: string;
  readonly projects: string;
  readonly context: string;
  readonly updatedAt: string;
};

type ProjectRow = {
  readonly slug: string;
  readonly name: string;
  readonly path: string;
  readonly description: string;
  readonly channelSlug: string | null;
  readonly updatedAt: string;
};

const stringify = (value: string | readonly string[] | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const decodeList = (value: string): string => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string").join(", ")
      : "";
  } catch {
    return "";
  }
};

const pushValue = (
  rows: PropertyValue[],
  subjectType: PropertySubjectType,
  subjectId: string,
  subjectName: string,
  key: string,
  value: string | readonly string[] | null | undefined,
  source: string,
  updatedAt: string,
): void => {
  const text = stringify(value);
  if (!text) return;
  rows.push({ subjectType, subjectId, subjectName, key, value: text, source, updatedAt });
};

const pageValues = (vaultDb: DB): PropertyValue[] => {
  const rows: PropertyValue[] = [];
  const pages = vaultDb.query<NodeRow>("SELECT * FROM nodes WHERE kind = 'file' ORDER BY title");
  for (const page of pages) {
    const subjectId = String(page.id);
    const updatedAt = page.updatedAt;
    pushValue(rows, "page", subjectId, page.title, "title", page.title, "index", updatedAt);
    pushValue(rows, "page", subjectId, page.title, "path", page.path, "index", updatedAt);
    pushValue(rows, "page", subjectId, page.title, "kind", page.kind, "index", updatedAt);
    if (page.icon)
      pushValue(rows, "page", subjectId, page.title, "icon", page.icon, "index", updatedAt);
    if (page.pinned)
      pushValue(rows, "page", subjectId, page.title, "pinned", "true", "index", updatedAt);
    if (page.isTemplate) {
      pushValue(rows, "page", subjectId, page.title, "template", "true", "index", updatedAt);
    }
    const { fm } = parseSource(page.body);
    for (const [key, value] of Object.entries(fm)) {
      pushValue(rows, "page", subjectId, page.title, key, value, "frontmatter", updatedAt);
    }
  }
  return rows;
};

const nativeValues = (db: DB): PropertyValue[] => {
  const rows: PropertyValue[] = [];
  for (const agent of db.query<AgentRow>("SELECT * FROM agents ORDER BY name")) {
    pushValue(rows, "agent", agent.slug, agent.name, "name", agent.name, "agents", agent.updatedAt);
    pushValue(
      rows,
      "agent",
      agent.slug,
      agent.name,
      "description",
      agent.description,
      "agents",
      agent.updatedAt,
    );
    pushValue(rows, "agent", agent.slug, agent.name, "icon", agent.icon, "agents", agent.updatedAt);
    pushValue(
      rows,
      "agent",
      agent.slug,
      agent.name,
      "provider",
      agent.provider,
      "agents",
      agent.updatedAt,
    );
    pushValue(
      rows,
      "agent",
      agent.slug,
      agent.name,
      "model",
      agent.model,
      "agents",
      agent.updatedAt,
    );
    pushValue(
      rows,
      "agent",
      agent.slug,
      agent.name,
      "tools",
      decodeList(agent.tools),
      "agents",
      agent.updatedAt,
    );
  }
  for (const channel of db.query<ChannelRow>("SELECT * FROM channels ORDER BY name")) {
    pushValue(
      rows,
      "channel",
      channel.slug,
      channel.name,
      "name",
      channel.name,
      "channels",
      channel.updatedAt,
    );
    pushValue(
      rows,
      "channel",
      channel.slug,
      channel.name,
      "description",
      channel.description,
      "channels",
      channel.updatedAt,
    );
    pushValue(
      rows,
      "channel",
      channel.slug,
      channel.name,
      "mode",
      channel.mode,
      "channels",
      channel.updatedAt,
    );
    pushValue(
      rows,
      "channel",
      channel.slug,
      channel.name,
      "agents",
      decodeList(channel.agents),
      "channels",
      channel.updatedAt,
    );
    pushValue(
      rows,
      "channel",
      channel.slug,
      channel.name,
      "projects",
      decodeList(channel.projects),
      "channels",
      channel.updatedAt,
    );
    pushValue(
      rows,
      "channel",
      channel.slug,
      channel.name,
      "context",
      decodeList(channel.context),
      "channels",
      channel.updatedAt,
    );
  }
  for (const project of db.query<ProjectRow>("SELECT * FROM projects ORDER BY name")) {
    pushValue(
      rows,
      "project",
      project.slug,
      project.name,
      "name",
      project.name,
      "projects",
      project.updatedAt,
    );
    pushValue(
      rows,
      "project",
      project.slug,
      project.name,
      "path",
      project.path,
      "projects",
      project.updatedAt,
    );
    pushValue(
      rows,
      "project",
      project.slug,
      project.name,
      "description",
      project.description,
      "projects",
      project.updatedAt,
    );
    pushValue(
      rows,
      "project",
      project.slug,
      project.name,
      "channel",
      project.channelSlug,
      "projects",
      project.updatedAt,
    );
  }
  return rows;
};

const saveValues = async (vaultRoot: string, values: readonly PropertyValue[]): Promise<void> => {
  const db = await openAgentStore(vaultRoot);
  db.exec("DELETE FROM propertyValues");
  for (const value of values) {
    db.exec(
      `INSERT INTO propertyValues
        (subjectType, subjectId, subjectName, key, value, source, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      value.subjectType,
      value.subjectId,
      value.subjectName,
      value.key,
      value.value,
      value.source,
      value.updatedAt,
    );
  }
};

const readValues = async (vaultRoot: string): Promise<PropertyValue[]> => {
  const db = await openAgentStore(vaultRoot);
  return db
    .query<StoredPropertyRow>(
      "SELECT * FROM propertyValues ORDER BY subjectType, subjectName COLLATE NOCASE, key",
    )
    .map((row) => ({
      subjectType: row.subjectType as PropertySubjectType,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      key: row.key,
      value: row.value,
      source: row.source,
      updatedAt: row.updatedAt,
    }));
};

export const buildBaseView = async (vault: OpenVault): Promise<BaseView> => {
  const db = await openAgentStore(vault.root);
  const values = [...pageValues(vault.db), ...nativeValues(db)];
  await saveValues(vault.root, values);
  const stored = await readValues(vault.root);
  const keyCounts = new Map<string, number>();
  for (const value of stored) keyCounts.set(value.key, (keyCounts.get(value.key) ?? 0) + 1);
  const columns = [...keyCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 16)
    .map(([key]) => key);

  const bySubject = new Map<string, BaseRow>();
  for (const value of stored) {
    const id = `${value.subjectType}:${value.subjectId}`;
    const existing = bySubject.get(id);
    const nextValues = { ...(existing?.values ?? {}), [value.key]: value.value };
    bySubject.set(id, {
      subjectType: value.subjectType,
      subjectId: value.subjectId,
      subjectName: value.subjectName,
      values: nextValues,
      updatedAt: value.updatedAt,
    });
  }

  return {
    columns,
    rows: [...bySubject.values()].sort(
      (a, b) =>
        a.subjectType.localeCompare(b.subjectType) || a.subjectName.localeCompare(b.subjectName),
    ),
    updatedAt: new Date().toISOString(),
  };
};
