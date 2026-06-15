// Agent + command repository. Runtime state is stored in the vault-local
// `.narrative/narrative.sqlite`; legacy markdown files are imported as a
// compatibility path the first time the store is empty.

import { join } from "node:path";
import type { AgentDef, AiProvider, CommandDef } from "../../shared/types.ts";
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

const AGENTS_DIR = ".narrative/agents";
const COMMANDS_DIR = ".narrative/commands";

const KNOWN_PROVIDERS = new Set<AiProvider>([
  "anthropic",
  "openai",
  "ollama",
  "ollama-cloud",
  "openai-compatible",
]);

type AgentRow = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly tools: string;
  readonly systemPrompt: string;
};

type CommandRow = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly agent: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly tools: string;
  readonly prompt: string;
};

const coerceProvider = (raw: string | null): AiProvider | null =>
  raw && KNOWN_PROVIDERS.has(raw as AiProvider) ? (raw as AiProvider) : null;

const now = (): string => new Date().toISOString();

const quoteYaml = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const listBlock = (values: readonly string[]): string =>
  values.length > 0 ? values.map((value) => `  - ${value}`).join("\n") : "";

const agentFromRow = (row: AgentRow): AgentDef => ({
  slug: row.slug,
  path: `.narrative/narrative.sqlite#agents/${row.slug}`,
  name: row.name,
  description: row.description,
  icon: row.icon || "\u{1F916}",
  model: row.model,
  provider: coerceProvider(row.provider),
  tools: decodeList(row.tools),
  systemPrompt: row.systemPrompt,
});

const commandFromRow = (row: CommandRow): CommandDef => ({
  slug: row.slug,
  path: `.narrative/narrative.sqlite#commands/${row.slug}`,
  name: row.name,
  description: row.description,
  icon: row.icon || "\u{2728}",
  agent: row.agent,
  model: row.model,
  provider: coerceProvider(row.provider),
  tools: decodeList(row.tools),
  prompt: row.prompt,
});

const agentSource = (agent: AgentDef): string =>
  `${[
    "---",
    `name: ${quoteYaml(agent.name)}`,
    `description: ${quoteYaml(agent.description)}`,
    `icon: ${quoteYaml(agent.icon)}`,
    agent.provider ? `provider: ${agent.provider}` : "",
    agent.model ? `model: ${quoteYaml(agent.model)}` : "",
    "tools:",
    listBlock(agent.tools),
    "---",
    agent.systemPrompt,
  ]
    .filter((line) => line !== "")
    .join("\n")
    .trimEnd()}\n`;

const commandSource = (command: CommandDef): string =>
  `${[
    "---",
    `name: ${quoteYaml(command.name)}`,
    `description: ${quoteYaml(command.description)}`,
    `icon: ${quoteYaml(command.icon)}`,
    command.agent ? `agent: ${command.agent}` : "",
    command.provider ? `provider: ${command.provider}` : "",
    command.model ? `model: ${quoteYaml(command.model)}` : "",
    "tools:",
    listBlock(command.tools),
    "---",
    command.prompt,
  ]
    .filter((line) => line !== "")
    .join("\n")
    .trimEnd()}\n`;

const AGENT_TEMPLATE = (name: string) => ({
  name,
  description: "A new agent.",
  icon: "\u{1F916}",
  tools: ["vault.search", "vault.read"],
  systemPrompt: `You are ${name}, an assistant working inside the user's Bethink vault.
Be concise. Use tools to ground your answers in real pages, and cite the
titles you used.`,
});

const COMMAND_TEMPLATE = (name: string) => ({
  name,
  description: "A new command.",
  icon: "\u{2728}",
  prompt: `${name} - replace this body with the prompt to send to the assistant when
the command is invoked.`,
});

const importLegacyAgents = async (vaultRoot: string): Promise<void> => {
  const db = await openAgentStore(vaultRoot);
  if (hasRows(db, "agents")) return;
  const dir = join(vaultRoot, AGENTS_DIR);
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
      `INSERT OR IGNORE INTO agents
        (slug, name, description, icon, provider, model, tools, systemPrompt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      slug,
      stringField(fm, "name") ?? slug,
      stringField(fm, "description") ?? "",
      stringField(fm, "icon") ?? "\u{1F916}",
      coerceProvider(stringField(fm, "provider")),
      stringField(fm, "model"),
      encodeList(arrayField(fm, "tools")),
      body.trim(),
      stamp,
      stamp,
    );
  }
};

const importLegacyCommands = async (vaultRoot: string): Promise<void> => {
  const db = await openAgentStore(vaultRoot);
  if (hasRows(db, "commands")) return;
  const dir = join(vaultRoot, COMMANDS_DIR);
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
      `INSERT OR IGNORE INTO commands
        (slug, name, description, icon, agent, provider, model, tools, prompt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      slug,
      stringField(fm, "name") ?? slug,
      stringField(fm, "description") ?? "",
      stringField(fm, "icon") ?? "\u{2728}",
      stringField(fm, "agent"),
      coerceProvider(stringField(fm, "provider")),
      stringField(fm, "model"),
      encodeList(arrayField(fm, "tools")),
      body.trim(),
      stamp,
      stamp,
    );
  }
};

export const listAgents = async (vaultRoot: string): Promise<AgentDef[]> => {
  await importLegacyAgents(vaultRoot);
  const db = await openAgentStore(vaultRoot);
  return db.query<AgentRow>("SELECT * FROM agents ORDER BY name COLLATE NOCASE").map(agentFromRow);
};

export const listCommands = async (vaultRoot: string): Promise<CommandDef[]> => {
  await importLegacyCommands(vaultRoot);
  const db = await openAgentStore(vaultRoot);
  return db
    .query<CommandRow>("SELECT * FROM commands ORDER BY name COLLATE NOCASE")
    .map(commandFromRow);
};

export const createAgent = async (vaultRoot: string, name: string): Promise<AgentDef | null> => {
  const db = await openAgentStore(vaultRoot);
  const display = name.trim() || "Agent";
  const template = AGENT_TEMPLATE(display);
  const slug = await freshSlug(vaultRoot, "agents", display, "agent");
  const stamp = now();
  db.exec(
    `INSERT INTO agents
      (slug, name, description, icon, tools, systemPrompt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    slug,
    template.name,
    template.description,
    template.icon,
    encodeList(template.tools),
    template.systemPrompt,
    stamp,
    stamp,
  );
  return (await listAgents(vaultRoot)).find((agent) => agent.slug === slug) ?? null;
};

export const createCommand = async (
  vaultRoot: string,
  name: string,
): Promise<CommandDef | null> => {
  const db = await openAgentStore(vaultRoot);
  const display = name.trim() || "Command";
  const template = COMMAND_TEMPLATE(display);
  const slug = await freshSlug(vaultRoot, "commands", display, "command");
  const stamp = now();
  db.exec(
    `INSERT INTO commands
      (slug, name, description, icon, prompt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    slug,
    template.name,
    template.description,
    template.icon,
    template.prompt,
    stamp,
    stamp,
  );
  return (await listCommands(vaultRoot)).find((command) => command.slug === slug) ?? null;
};

export const readAgentSource = async (
  vaultRoot: string,
  slug: string,
): Promise<{ path: string; body: string } | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  const agent = (await listAgents(vaultRoot)).find((item) => item.slug === clean);
  return agent ? { path: agent.path, body: agentSource(agent) } : null;
};

export const readCommandSource = async (
  vaultRoot: string,
  slug: string,
): Promise<{ path: string; body: string } | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  const command = (await listCommands(vaultRoot)).find((item) => item.slug === clean);
  return command ? { path: command.path, body: commandSource(command) } : null;
};

export const saveAgent = async (
  vaultRoot: string,
  slug: string,
  body: string,
): Promise<AgentDef | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  const db = await openAgentStore(vaultRoot);
  const { fm, body: prompt } = parseSource(body);
  db.exec(
    `UPDATE agents SET
      name = ?, description = ?, icon = ?, provider = ?, model = ?, tools = ?,
      systemPrompt = ?, updatedAt = ?
      WHERE slug = ?`,
    stringField(fm, "name") ?? clean,
    stringField(fm, "description") ?? "",
    stringField(fm, "icon") ?? "\u{1F916}",
    coerceProvider(stringField(fm, "provider")),
    stringField(fm, "model"),
    encodeList(arrayField(fm, "tools")),
    prompt.trim(),
    now(),
    clean,
  );
  return (await listAgents(vaultRoot)).find((agent) => agent.slug === clean) ?? null;
};

export const saveCommand = async (
  vaultRoot: string,
  slug: string,
  body: string,
): Promise<CommandDef | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  const db = await openAgentStore(vaultRoot);
  const { fm, body: prompt } = parseSource(body);
  db.exec(
    `UPDATE commands SET
      name = ?, description = ?, icon = ?, agent = ?, provider = ?, model = ?,
      tools = ?, prompt = ?, updatedAt = ?
      WHERE slug = ?`,
    stringField(fm, "name") ?? clean,
    stringField(fm, "description") ?? "",
    stringField(fm, "icon") ?? "\u{2728}",
    stringField(fm, "agent"),
    coerceProvider(stringField(fm, "provider")),
    stringField(fm, "model"),
    encodeList(arrayField(fm, "tools")),
    prompt.trim(),
    now(),
    clean,
  );
  return (await listCommands(vaultRoot)).find((command) => command.slug === clean) ?? null;
};

export const deleteAgent = async (vaultRoot: string, slug: string): Promise<void> => {
  const clean = safeSlug(slug);
  if (!clean) return;
  const db = await openAgentStore(vaultRoot);
  db.exec("DELETE FROM agents WHERE slug = ?", clean);
};

export const deleteCommand = async (vaultRoot: string, slug: string): Promise<void> => {
  const clean = safeSlug(slug);
  if (!clean) return;
  const db = await openAgentStore(vaultRoot);
  db.exec("DELETE FROM commands WHERE slug = ?", clean);
};
