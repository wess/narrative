// Agent + command loaders. Both kinds are `.md` files in `.narrative/agents/`
// and `.narrative/commands/` inside the open vault — the dotfolder is
// invisible to the page tree but travels with the vault folder.

import { mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AgentDef, AiProvider, CommandDef } from "../../shared/types.ts";
import { arrayField, parseSource, stringField } from "./parse.ts";

const AGENTS_DIR = ".narrative/agents";
const COMMANDS_DIR = ".narrative/commands";

const KNOWN_PROVIDERS = new Set<AiProvider>([
  "anthropic",
  "openai",
  "ollama",
  "ollama-cloud",
  "openai-compatible",
]);

const coerceProvider = (raw: string | null): AiProvider | null => {
  if (!raw) return null;
  return KNOWN_PROVIDERS.has(raw as AiProvider) ? (raw as AiProvider) : null;
};

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 64) || "agent";

const listMarkdown = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir);
    return entries.filter((n) => n.toLowerCase().endsWith(".md"));
  } catch {
    return [];
  }
};

export const listAgents = async (vaultRoot: string): Promise<AgentDef[]> => {
  const dir = join(vaultRoot, AGENTS_DIR);
  const files = await listMarkdown(dir);
  const out: AgentDef[] = [];
  for (const file of files) {
    const slug = file.slice(0, -3);
    const path = `${AGENTS_DIR}/${file}`;
    const raw = await Bun.file(join(dir, file))
      .text()
      .catch(() => null);
    if (raw === null) continue;
    const { fm, body } = parseSource(raw);
    out.push({
      slug,
      path,
      name: stringField(fm, "name") ?? slug,
      description: stringField(fm, "description") ?? "",
      icon: stringField(fm, "icon") ?? "\u{1F916}",
      model: stringField(fm, "model"),
      provider: coerceProvider(stringField(fm, "provider")),
      tools: arrayField(fm, "tools"),
      systemPrompt: body.trim(),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
};

export const listCommands = async (vaultRoot: string): Promise<CommandDef[]> => {
  const dir = join(vaultRoot, COMMANDS_DIR);
  const files = await listMarkdown(dir);
  const out: CommandDef[] = [];
  for (const file of files) {
    const slug = file.slice(0, -3);
    const path = `${COMMANDS_DIR}/${file}`;
    const raw = await Bun.file(join(dir, file))
      .text()
      .catch(() => null);
    if (raw === null) continue;
    const { fm, body } = parseSource(raw);
    out.push({
      slug,
      path,
      name: stringField(fm, "name") ?? slug,
      description: stringField(fm, "description") ?? "",
      icon: stringField(fm, "icon") ?? "\u{2728}",
      agent: stringField(fm, "agent"),
      tools: arrayField(fm, "tools"),
      model: stringField(fm, "model"),
      provider: coerceProvider(stringField(fm, "provider")),
      prompt: body.trim(),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
};

// --- writers --------------------------------------------------------------

const AGENT_TEMPLATE = (name: string) => `---
name: ${name}
description: A new agent.
icon: 🤖
tools:
  - vault.search
  - vault.read
---
You are ${name}, an assistant working inside the user's Narrative vault.
Be concise. Use tools to ground your answers in real pages, and cite the
titles you used.
`;

const COMMAND_TEMPLATE = (name: string) => `---
name: ${name}
description: A new command.
icon: ✨
---
${name} — replace this body with the prompt to send to the assistant when
the command is invoked.
`;

const fileFor = (vaultRoot: string, dir: string, slug: string): string =>
  join(vaultRoot, dir, `${slug}.md`);

const writeIfMissing = async (path: string, body: string): Promise<boolean> => {
  if (await Bun.file(path).exists()) return false;
  await Bun.write(path, body);
  return true;
};

// A slug derived from the user's display name, plus a numeric suffix if the
// file is already taken.
const freshSlug = async (vaultRoot: string, dir: string, name: string): Promise<string> => {
  const base = slugify(name);
  let candidate = base;
  let n = 1;
  while (await Bun.file(fileFor(vaultRoot, dir, candidate)).exists()) {
    candidate = `${base}${n++}`;
  }
  return candidate;
};

export const createAgent = async (vaultRoot: string, name: string): Promise<AgentDef | null> => {
  await mkdir(join(vaultRoot, AGENTS_DIR), { recursive: true });
  const slug = await freshSlug(vaultRoot, AGENTS_DIR, name);
  await writeIfMissing(fileFor(vaultRoot, AGENTS_DIR, slug), AGENT_TEMPLATE(name.trim() || slug));
  const agents = await listAgents(vaultRoot);
  return agents.find((a) => a.slug === slug) ?? null;
};

export const createCommand = async (
  vaultRoot: string,
  name: string,
): Promise<CommandDef | null> => {
  await mkdir(join(vaultRoot, COMMANDS_DIR), { recursive: true });
  const slug = await freshSlug(vaultRoot, COMMANDS_DIR, name);
  await writeIfMissing(
    fileFor(vaultRoot, COMMANDS_DIR, slug),
    COMMAND_TEMPLATE(name.trim() || slug),
  );
  const commands = await listCommands(vaultRoot);
  return commands.find((c) => c.slug === slug) ?? null;
};

export const readAgentSource = async (
  vaultRoot: string,
  slug: string,
): Promise<{ path: string; body: string } | null> => {
  const path = `${AGENTS_DIR}/${slug}.md`;
  const text = await Bun.file(join(vaultRoot, path))
    .text()
    .catch(() => null);
  return text === null ? null : { path, body: text };
};

export const readCommandSource = async (
  vaultRoot: string,
  slug: string,
): Promise<{ path: string; body: string } | null> => {
  const path = `${COMMANDS_DIR}/${slug}.md`;
  const text = await Bun.file(join(vaultRoot, path))
    .text()
    .catch(() => null);
  return text === null ? null : { path, body: text };
};

export const saveAgent = async (
  vaultRoot: string,
  slug: string,
  body: string,
): Promise<AgentDef | null> => {
  await mkdir(join(vaultRoot, AGENTS_DIR), { recursive: true });
  await Bun.write(fileFor(vaultRoot, AGENTS_DIR, slug), body);
  const agents = await listAgents(vaultRoot);
  return agents.find((a) => a.slug === slug) ?? null;
};

export const saveCommand = async (
  vaultRoot: string,
  slug: string,
  body: string,
): Promise<CommandDef | null> => {
  await mkdir(join(vaultRoot, COMMANDS_DIR), { recursive: true });
  await Bun.write(fileFor(vaultRoot, COMMANDS_DIR, slug), body);
  const commands = await listCommands(vaultRoot);
  return commands.find((c) => c.slug === slug) ?? null;
};

export const deleteAgent = async (vaultRoot: string, slug: string): Promise<void> => {
  await unlink(fileFor(vaultRoot, AGENTS_DIR, slug)).catch(() => undefined);
};

export const deleteCommand = async (vaultRoot: string, slug: string): Promise<void> => {
  await unlink(fileFor(vaultRoot, COMMANDS_DIR, slug)).catch(() => undefined);
};
