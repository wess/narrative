import { join } from "node:path";
import type { ChannelDef, ChannelMode } from "../../shared/types.ts";
import { arrayField, parseSource, stringField } from "./parse.ts";
import {
  decodeList,
  encodeList,
  freshSlug,
  hasRows,
  listMarkdown,
  openAgentStore,
  safeSlug,
} from "./store.ts";

const CHANNELS_DIR = ".narrative/channels";
const MODES = new Set<ChannelMode>(["roundtable", "focus", "manual"]);

type ChannelRow = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly mode: string;
  readonly agents: string;
  readonly projects: string;
  readonly context: string;
  readonly brief: string;
};

const now = (): string => new Date().toISOString();

const coerceMode = (raw: string | null): ChannelMode =>
  raw && MODES.has(raw as ChannelMode) ? (raw as ChannelMode) : "roundtable";

const quoteYaml = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const listBlock = (values: readonly string[]): string =>
  values.length > 0 ? values.map((value) => `  - ${value}`).join("\n") : "";

const channelFromRow = (row: ChannelRow): ChannelDef => ({
  slug: row.slug,
  path: `.narrative/narrative.sqlite#channels/${row.slug}`,
  name: row.name,
  description: row.description,
  icon: row.icon || "\u{1F4AC}",
  agents: decodeList(row.agents),
  projects: decodeList(row.projects),
  mode: coerceMode(row.mode),
  context: decodeList(row.context),
  brief: row.brief,
});

const channelSource = (channel: ChannelDef): string =>
  `${[
    "---",
    `name: ${quoteYaml(channel.name)}`,
    `description: ${quoteYaml(channel.description)}`,
    `icon: ${quoteYaml(channel.icon)}`,
    `mode: ${channel.mode}`,
    "agents:",
    listBlock(channel.agents),
    "projects:",
    listBlock(channel.projects),
    "context:",
    listBlock(channel.context),
    "---",
    channel.brief,
  ]
    .filter((line) => line !== "")
    .join("\n")
    .trimEnd()}\n`;

const importLegacyChannels = async (vaultRoot: string): Promise<void> => {
  const db = await openAgentStore(vaultRoot);
  if (hasRows(db, "channels")) return;
  const dir = join(vaultRoot, CHANNELS_DIR);
  for (const file of await listMarkdown(dir)) {
    const slug = file.slice(0, -3);
    if (!safeSlug(slug)) continue;
    const raw = await Bun.file(join(dir, file))
      .text()
      .catch(() => null);
    if (raw === null) continue;
    const { fm, body } = parseSource(raw);
    const stamp = now();
    db.exec(
      `INSERT OR IGNORE INTO channels
        (slug, name, description, icon, mode, agents, projects, context, brief, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      slug,
      stringField(fm, "name") ?? slug,
      stringField(fm, "description") ?? "",
      stringField(fm, "icon") ?? "\u{1F4AC}",
      coerceMode(stringField(fm, "mode")),
      encodeList(arrayField(fm, "agents")),
      encodeList(arrayField(fm, "projects")),
      encodeList(arrayField(fm, "context")),
      body.trim(),
      stamp,
      stamp,
    );
  }
};

export const listChannels = async (vaultRoot: string): Promise<ChannelDef[]> => {
  await importLegacyChannels(vaultRoot);
  const db = await openAgentStore(vaultRoot);
  return db
    .query<ChannelRow>("SELECT * FROM channels ORDER BY name COLLATE NOCASE")
    .map(channelFromRow);
};

export const createChannel = async (
  vaultRoot: string,
  name: string,
): Promise<ChannelDef | null> => {
  const db = await openAgentStore(vaultRoot);
  const display = name.trim() || "Channel";
  const slug = await freshSlug(vaultRoot, "channels", display, "channel");
  const stamp = now();
  db.exec(
    `INSERT INTO channels
      (slug, name, description, icon, mode, agents, projects, context, brief, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    slug,
    display,
    "A project room for agent collaboration.",
    "\u{1F4AC}",
    "roundtable",
    encodeList([]),
    encodeList([]),
    encodeList([]),
    "Use this channel to keep a project brief, assigned agents, and working context together.",
    stamp,
    stamp,
  );
  return (await listChannels(vaultRoot)).find((channel) => channel.slug === slug) ?? null;
};

export const readChannelSource = async (
  vaultRoot: string,
  slug: string,
): Promise<{ path: string; body: string } | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  const channel = (await listChannels(vaultRoot)).find((item) => item.slug === clean);
  return channel ? { path: channel.path, body: channelSource(channel) } : null;
};

export const saveChannel = async (
  vaultRoot: string,
  slug: string,
  body: string,
): Promise<ChannelDef | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  const db = await openAgentStore(vaultRoot);
  const { fm, body: brief } = parseSource(body);
  db.exec(
    `UPDATE channels SET
      name = ?, description = ?, icon = ?, mode = ?, agents = ?, projects = ?,
      context = ?, brief = ?, updatedAt = ?
      WHERE slug = ?`,
    stringField(fm, "name") ?? clean,
    stringField(fm, "description") ?? "",
    stringField(fm, "icon") ?? "\u{1F4AC}",
    coerceMode(stringField(fm, "mode")),
    encodeList(arrayField(fm, "agents")),
    encodeList(arrayField(fm, "projects")),
    encodeList(arrayField(fm, "context")),
    brief.trim(),
    now(),
    clean,
  );
  return (await listChannels(vaultRoot)).find((channel) => channel.slug === clean) ?? null;
};

export const deleteChannel = async (vaultRoot: string, slug: string): Promise<void> => {
  const clean = safeSlug(slug);
  if (!clean) return;
  const db = await openAgentStore(vaultRoot);
  db.exec("DELETE FROM channels WHERE slug = ?", clean);
  db.exec(
    "UPDATE projects SET channelSlug = NULL, updatedAt = ? WHERE channelSlug = ?",
    now(),
    clean,
  );
};
