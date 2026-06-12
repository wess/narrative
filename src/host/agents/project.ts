import { basename } from "node:path";
import type { AgentDef, ChannelDef, ProjectDef } from "../../shared/types.ts";
import { createChannel, saveChannel } from "./channel.ts";
import { createAgent, listAgents, saveAgent } from "./load.ts";
import { freshSlug, openAgentStore, projectNameFromPath, safeSlug } from "./store.ts";

type ProjectRow = {
  readonly slug: string;
  readonly name: string;
  readonly path: string;
  readonly description: string;
  readonly channelSlug: string | null;
};

type SuggestedRole = {
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly prompt: string;
  readonly tools: readonly string[];
};

export type SuggestedChannelResult = {
  readonly project: ProjectDef;
  readonly channel: ChannelDef;
  readonly agents: readonly AgentDef[];
};

const now = (): string => new Date().toISOString();

const projectFromRow = (row: ProjectRow): ProjectDef => ({
  slug: row.slug,
  name: row.name,
  path: row.path,
  description: row.description,
  channelSlug: row.channelSlug,
});

const quoteYaml = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const roleSource = (role: SuggestedRole): string =>
  [
    "---",
    `name: ${quoteYaml(role.name)}`,
    `description: ${quoteYaml(role.description)}`,
    `icon: ${quoteYaml(role.icon)}`,
    "tools:",
    ...role.tools.map((tool) => `  - ${tool}`),
    "---",
    role.prompt,
  ].join("\n");

const channelSource = (
  project: ProjectDef,
  channel: ChannelDef,
  agents: readonly AgentDef[],
): string =>
  [
    "---",
    `name: ${quoteYaml(channel.name)}`,
    `description: ${quoteYaml(channel.description)}`,
    `icon: ${quoteYaml(channel.icon)}`,
    "mode: roundtable",
    "agents:",
    ...agents.map((agent) => `  - ${agent.slug}`),
    "projects:",
    `  - ${project.slug}`,
    "context:",
    `  - ${project.path}`,
    "---",
    [
      `Project: ${project.name}`,
      `Folder: ${project.path}`,
      "",
      "Use this channel to plan, implement, review, and test work for this project.",
      "Keep decisions, blockers, and useful repo facts in channel memory.",
    ].join("\n"),
  ].join("\n");

const rolesForProject = (name: string): readonly SuggestedRole[] => [
  {
    name: `${name} Architect`,
    description: "Plans implementation work and keeps project structure coherent.",
    icon: "\u{1F3D7}\u{FE0F}",
    tools: ["vault.search", "vault.read"],
    prompt:
      "You are the project architect. Clarify goals, identify constraints, break work into small steps, and keep designs simple.",
  },
  {
    name: `${name} Builder`,
    description: "Implements focused changes and keeps momentum on the current task.",
    icon: "\u{1F6E0}\u{FE0F}",
    tools: ["vault.search", "vault.read", "vault.write", "vault.append"],
    prompt:
      "You are the project builder. Make pragmatic implementation decisions, prefer small changes, and surface blockers quickly.",
  },
  {
    name: `${name} Reviewer`,
    description: "Reviews changes for bugs, missing tests, and regression risk.",
    icon: "\u{1F50E}",
    tools: ["vault.search", "vault.read"],
    prompt:
      "You are the project reviewer. Prioritize correctness, behavioral regressions, missing tests, and unclear assumptions.",
  },
];

const roleKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const findReusableAgent = (agents: readonly AgentDef[], role: SuggestedRole): AgentDef | null => {
  const key = roleKey(role.name.replace(/^[a-z0-9]+\s+/i, ""));
  return (
    agents.find((agent) => roleKey(agent.name).includes(key)) ??
    agents.find((agent) => roleKey(agent.description).includes(key)) ??
    null
  );
};

export const listProjects = async (vaultRoot: string): Promise<ProjectDef[]> => {
  const db = await openAgentStore(vaultRoot);
  return db
    .query<ProjectRow>("SELECT * FROM projects ORDER BY name COLLATE NOCASE")
    .map(projectFromRow);
};

export const createProject = async (
  vaultRoot: string,
  path: string,
): Promise<ProjectDef | null> => {
  const db = await openAgentStore(vaultRoot);
  const name = projectNameFromPath(path);
  const existing = db.query<ProjectRow>("SELECT * FROM projects WHERE path = ?", path)[0];
  if (existing) return projectFromRow(existing);
  const slug = await freshSlug(vaultRoot, "projects", name, "project");
  const stamp = now();
  db.exec(
    `INSERT INTO projects
      (slug, name, path, description, channelSlug, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    slug,
    name,
    path,
    `External project folder ${basename(path)}.`,
    stamp,
    stamp,
  );
  return (await listProjects(vaultRoot)).find((project) => project.slug === slug) ?? null;
};

export const deleteProject = async (vaultRoot: string, slug: string): Promise<void> => {
  const clean = safeSlug(slug);
  if (!clean) return;
  const db = await openAgentStore(vaultRoot);
  db.exec("DELETE FROM projects WHERE slug = ?", clean);
};

export const suggestChannelForProject = async (
  vaultRoot: string,
  slug: string,
): Promise<SuggestedChannelResult | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  const project = (await listProjects(vaultRoot)).find((item) => item.slug === clean);
  if (!project) return null;
  const existingAgents = await listAgents(vaultRoot);
  const selected: AgentDef[] = [];
  for (const role of rolesForProject(project.name)) {
    const reusable = findReusableAgent([...existingAgents, ...selected], role);
    if (reusable) {
      selected.push(reusable);
      continue;
    }
    const created = await createAgent(vaultRoot, role.name);
    if (!created) continue;
    const saved = await saveAgent(vaultRoot, created.slug, roleSource(role));
    if (saved) selected.push(saved);
  }
  const channel = await createChannel(vaultRoot, `${project.name} Project`);
  if (!channel) return null;
  const saved = await saveChannel(
    vaultRoot,
    channel.slug,
    channelSource(project, channel, selected),
  );
  if (!saved) return null;
  const db = await openAgentStore(vaultRoot);
  db.exec(
    "UPDATE projects SET channelSlug = ?, updatedAt = ? WHERE slug = ?",
    saved.slug,
    now(),
    clean,
  );
  return {
    project: { ...project, channelSlug: saved.slug },
    channel: saved,
    agents: selected,
  };
};
