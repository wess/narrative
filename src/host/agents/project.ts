import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import type {
  AgentDef,
  ChannelDef,
  ProjectAnalysis,
  ProjectChangedFile,
  ProjectDef,
  ProjectDiff,
  ProjectFileContent,
  ProjectFileNode,
  ProjectRun,
  ProjectScript,
  ProjectSnapshot,
  ProjectWriteProposal,
  ProjectWriteProposalStatus,
} from "../../shared/types.ts";
import { createChannel, saveChannel } from "./channel.ts";
import { createAgent, listAgents, saveAgent } from "./load.ts";
import { freshSlug, openAgentStore, projectNameFromPath, safeSlug } from "./store.ts";

type ProjectRow = {
  readonly slug: string;
  readonly name: string;
  readonly path: string;
  readonly description: string;
  readonly channelSlug: string | null;
  readonly allowRead: number;
  readonly allowWrite: number;
  readonly allowRun: number;
  readonly approvedCommands: string;
};

type ProjectRunRow = {
  readonly id: number;
  readonly projectSlug: string;
  readonly command: string;
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly createdAt: string;
};

type ProjectSnapshotRow = {
  readonly id: number;
  readonly projectSlug: string;
  readonly path: string;
  readonly content: string;
  readonly reason: string;
  readonly createdAt: string;
};

type ProjectWriteProposalRow = {
  readonly id: number;
  readonly projectSlug: string;
  readonly path: string;
  readonly content: string;
  readonly reason: string;
  readonly reviewComment: string;
  readonly status: ProjectWriteProposalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
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

const parseList = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const encodeList = (values: readonly string[]): string => JSON.stringify([...new Set(values)]);

const projectFromRow = (row: ProjectRow): ProjectDef => ({
  slug: row.slug,
  name: row.name,
  path: row.path,
  description: row.description,
  channelSlug: row.channelSlug,
  allowRead: Boolean(row.allowRead),
  allowWrite: Boolean(row.allowWrite),
  allowRun: Boolean(row.allowRun),
  approvedCommands: parseList(row.approvedCommands),
});

const runFromRow = (row: ProjectRunRow): ProjectRun => ({
  id: row.id,
  projectSlug: row.projectSlug,
  command: row.command,
  cwd: row.cwd,
  exitCode: row.exitCode,
  stdout: row.stdout,
  stderr: row.stderr,
  durationMs: row.durationMs,
  createdAt: row.createdAt,
});

const snapshotFromRow = (row: ProjectSnapshotRow): ProjectSnapshot => ({
  id: row.id,
  projectSlug: row.projectSlug,
  path: row.path,
  content: row.content,
  reason: row.reason,
  createdAt: row.createdAt,
});

const proposalFromRow = (
  row: ProjectWriteProposalRow,
  diff: string | null = null,
): ProjectWriteProposal => ({
  id: row.id,
  projectSlug: row.projectSlug,
  path: row.path,
  content: row.content,
  diff,
  reason: row.reason,
  reviewComment: row.reviewComment,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", ".turbo"]);
const MAX_TREE_DEPTH = 4;
const MAX_TREE_CHILDREN = 200;

const listTree = async (root: string, dir: string, depth: number): Promise<ProjectFileNode[]> => {
  if (depth > MAX_TREE_DEPTH) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const visible = entries
    .filter((entry) => !entry.name.startsWith(".") || entry.name === ".github")
    .filter((entry) => !(entry.isDirectory() && SKIP_DIRS.has(entry.name)))
    .sort(
      (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
    )
    .slice(0, MAX_TREE_CHILDREN);
  const nodes: ProjectFileNode[] = [];
  for (const entry of visible) {
    const full = `${dir}/${entry.name}`;
    const path = full.slice(root.length).replace(/^\/+/, "");
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path,
        kind: "folder",
        children: await listTree(root, full, depth + 1),
      });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path, kind: "file", children: [] });
    }
  }
  return nodes;
};

const quoteYaml = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const isInside = (root: string, target: string): boolean =>
  target === root || target.startsWith(`${root}${sep}`);

const normalizeRel = (path: string): string => path.replace(/^\/+/, "").replace(/\\/g, "/");

const existsIn = async (root: string, path: string): Promise<boolean> =>
  Boolean(await stat(resolve(root, path)).catch(() => null));

const readJsonIn = async <T>(root: string, path: string): Promise<T | null> => {
  try {
    return (await Bun.file(resolve(root, path)).json()) as T;
  } catch {
    return null;
  }
};

export const resolveProjectFile = async (
  vaultRoot: string,
  projectSlug: string,
  path = "",
): Promise<{ project: ProjectDef; root: string; full: string; rel: string } | null> => {
  const project = await getProject(vaultRoot, projectSlug);
  if (!project) return null;
  const root = resolve(project.path);
  const rel = normalizeRel(path);
  const full = resolve(root, rel);
  if (!isInside(root, full)) return null;
  return { project, root, full, rel };
};

export const readProjectFile = async (
  vaultRoot: string,
  projectSlug: string,
  path: string,
  maxBytes = 240_000,
): Promise<ProjectFileContent | null> => {
  const resolved = await resolveProjectFile(vaultRoot, projectSlug, path);
  if (!resolved) return null;
  if (!resolved.project.allowRead) return null;
  const info = await stat(resolved.full).catch(() => null);
  if (!info?.isFile() || info.size > maxBytes) return null;
  return { path: resolved.rel, content: await Bun.file(resolved.full).text() };
};

const createSnapshot = async (
  vaultRoot: string,
  projectSlug: string,
  path: string,
  content: string,
  reason: string,
): Promise<ProjectSnapshot> => {
  const db = await openAgentStore(vaultRoot);
  db.exec(
    `INSERT INTO projectSnapshots
      (projectSlug, path, content, reason, createdAt)
      VALUES (?, ?, ?, ?, ?)`,
    projectSlug,
    path,
    content,
    reason,
    now(),
  );
  const row = db.query<ProjectSnapshotRow>(
    "SELECT * FROM projectSnapshots ORDER BY id DESC LIMIT 1",
  )[0];
  if (!row) throw new Error("Snapshot insert failed.");
  return snapshotFromRow(row);
};

export const writeProjectFile = async (
  vaultRoot: string,
  projectSlug: string,
  path: string,
  content: string,
  reason: string,
): Promise<{ path: string; bytes: number; snapshotId: number | null } | { error: string }> => {
  const resolved = await resolveProjectFile(vaultRoot, projectSlug, path);
  if (!resolved) return { error: "project or path not found" };
  const existing = await Bun.file(resolved.full)
    .text()
    .catch(() => null);
  const snapshot =
    existing === null
      ? null
      : await createSnapshot(vaultRoot, projectSlug, resolved.rel, existing, reason);
  await mkdir(dirname(resolved.full), { recursive: true });
  await Bun.write(resolved.full, content);
  return {
    path: resolved.rel,
    bytes: new TextEncoder().encode(content).byteLength,
    snapshotId: snapshot?.id ?? null,
  };
};

export const listProjectSnapshots = async (
  vaultRoot: string,
  projectSlug: string,
  path?: string,
): Promise<ProjectSnapshot[]> => {
  const db = await openAgentStore(vaultRoot);
  const clean = safeSlug(projectSlug);
  if (!clean) return [];
  return (
    path
      ? db.query<ProjectSnapshotRow>(
          "SELECT * FROM projectSnapshots WHERE projectSlug = ? AND path = ? ORDER BY id DESC LIMIT 50",
          clean,
          normalizeRel(path),
        )
      : db.query<ProjectSnapshotRow>(
          "SELECT * FROM projectSnapshots WHERE projectSlug = ? ORDER BY id DESC LIMIT 50",
          clean,
        )
  ).map(snapshotFromRow);
};

export const proposeProjectWrite = async (
  vaultRoot: string,
  projectSlug: string,
  path: string,
  content: string,
  reason: string,
): Promise<ProjectWriteProposal | { error: string }> => {
  const resolved = await resolveProjectFile(vaultRoot, projectSlug, path);
  if (!resolved) return { error: "project or path not found" };
  const db = await openAgentStore(vaultRoot);
  const stamp = now();
  db.exec(
    `INSERT INTO projectWriteProposals
      (projectSlug, path, content, reason, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    projectSlug,
    resolved.rel,
    content,
    reason,
    "pending",
    stamp,
    stamp,
  );
  const row = db.query<ProjectWriteProposalRow>(
    "SELECT * FROM projectWriteProposals ORDER BY id DESC LIMIT 1",
  )[0];
  if (!row) return { error: "proposal insert failed" };
  return proposalFromRow(row);
};

export const listProjectWriteProposals = async (
  vaultRoot: string,
  status: ProjectWriteProposalStatus | "all" = "pending",
): Promise<ProjectWriteProposal[]> => {
  const db = await openAgentStore(vaultRoot);
  const rows =
    status === "all"
      ? db.query<ProjectWriteProposalRow>(
          "SELECT * FROM projectWriteProposals ORDER BY id DESC LIMIT 100",
        )
      : db.query<ProjectWriteProposalRow>(
          "SELECT * FROM projectWriteProposals WHERE status = ? ORDER BY id DESC LIMIT 100",
          status,
        );
  const proposals: ProjectWriteProposal[] = [];
  for (const row of rows) {
    const current = await readProjectFile(vaultRoot, row.projectSlug, row.path);
    const before = (current?.content ?? "").split(/\r?\n/);
    const after = row.content.split(/\r?\n/);
    const diff = buildTextDiff(
      `current/${row.path}`,
      `proposal:${row.id}/${row.path}`,
      before,
      after,
    );
    proposals.push(proposalFromRow(row, diff));
  }
  return proposals;
};

export const decideProjectWriteProposal = async (
  vaultRoot: string,
  id: number,
  approve: boolean,
  comment = "",
): Promise<ProjectWriteProposal[]> => {
  const db = await openAgentStore(vaultRoot);
  const row = db.query<ProjectWriteProposalRow>(
    "SELECT * FROM projectWriteProposals WHERE id = ? LIMIT 1",
    id,
  )[0];
  if (!row || row.status !== "pending") return listProjectWriteProposals(vaultRoot);
  if (approve) {
    await writeProjectFile(vaultRoot, row.projectSlug, row.path, row.content, row.reason);
  }
  db.exec(
    "UPDATE projectWriteProposals SET status = ?, reviewComment = ?, updatedAt = ? WHERE id = ?",
    approve ? "approved" : "rejected",
    comment.trim().slice(0, 4000),
    now(),
    id,
  );
  return listProjectWriteProposals(vaultRoot);
};

function commonPrefix(a: readonly string[], b: readonly string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function commonSuffix(a: readonly string[], b: readonly string[], start: number): number {
  let i = 0;
  while (
    i + start < a.length &&
    i + start < b.length &&
    a[a.length - 1 - i] === b[b.length - 1 - i]
  ) {
    i++;
  }
  return i;
}

function buildTextDiff(
  beforeLabel: string,
  afterLabel: string,
  before: readonly string[],
  after: readonly string[],
): string {
  const prefix = commonPrefix(before, after);
  const suffix = commonSuffix(before, after, prefix);
  const removed = before.slice(prefix, before.length - suffix);
  const added = after.slice(prefix, after.length - suffix);
  const contextBefore = before.slice(Math.max(0, prefix - 3), prefix).map((line) => ` ${line}`);
  const contextAfter = after
    .slice(after.length - suffix, Math.min(after.length, after.length - suffix + 3))
    .map((line) => ` ${line}`);
  return [
    `--- ${beforeLabel}`,
    `+++ ${afterLabel}`,
    ...contextBefore,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ...contextAfter,
  ].join("\n");
}

export const diffProjectFile = async (
  vaultRoot: string,
  projectSlug: string,
  path: string,
): Promise<ProjectDiff | null> => {
  const current = await readProjectFile(vaultRoot, projectSlug, path);
  const snapshot = (await listProjectSnapshots(vaultRoot, projectSlug, path))[0];
  if (!current || !snapshot) return null;
  const before = snapshot.content.split(/\r?\n/);
  const after = current.content.split(/\r?\n/);
  const diff = buildTextDiff(
    `snapshot:${snapshot.id}/${current.path}`,
    `current/${current.path}`,
    before,
    after,
  );
  return { path: current.path, snapshotId: snapshot.id, diff };
};

export const changedProjectFiles = async (
  vaultRoot: string,
  projectSlug: string,
): Promise<ProjectChangedFile[]> => {
  const db = await openAgentStore(vaultRoot);
  const clean = safeSlug(projectSlug);
  if (!clean) return [];
  return db.query<ProjectChangedFile>(
    `SELECT path, MAX(id) AS latestSnapshotId, MAX(createdAt) AS changedAt
      FROM projectSnapshots
      WHERE projectSlug = ?
      GROUP BY path
      ORDER BY latestSnapshotId DESC
      LIMIT 100`,
    clean,
  );
};

const splitCommand = (command: string): string[] =>
  command
    .match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
    ?.map((part) => part.replace(/^["']|["']$/g, "")) ?? [];

const activeProjectRuns = new Map<number, ReturnType<typeof Bun.spawn>>();

export const runProjectCommand = async (
  vaultRoot: string,
  projectSlug: string,
  command: string,
  cwd = "",
  timeoutMs = 120_000,
): Promise<ProjectRun | { error: string }> => {
  const resolved = await resolveProjectFile(vaultRoot, projectSlug, cwd);
  if (!resolved) return { error: "project or cwd not found" };
  const info = await stat(resolved.full).catch(() => null);
  if (!info?.isDirectory()) return { error: "cwd is not a folder" };
  const parts = splitCommand(command);
  if (parts.length === 0) return { error: "command is required" };
  if (!resolved.project.approvedCommands.includes(command)) {
    return { error: "Project command is not approved for agent execution." };
  }
  const started = Date.now();
  const db = await openAgentStore(vaultRoot);
  db.exec(
    `INSERT INTO projectRuns
      (projectSlug, command, cwd, exitCode, stdout, stderr, durationMs, createdAt)
      VALUES (?, ?, ?, NULL, '', '', 0, ?)`,
    projectSlug,
    command,
    normalizeRel(cwd),
    now(),
  );
  const initial = db.query<ProjectRunRow>("SELECT * FROM projectRuns ORDER BY id DESC LIMIT 1")[0];
  if (!initial) throw new Error("Project run insert failed.");
  const proc = Bun.spawn(parts, {
    cwd: resolved.full,
    stdout: "pipe",
    stderr: "pipe",
  });
  activeProjectRuns.set(initial.id, proc);
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(() => {
    clearTimeout(timer);
    activeProjectRuns.delete(initial.id);
  });
  db.exec(
    `UPDATE projectRuns
      SET exitCode = ?, stdout = ?, stderr = ?, durationMs = ?
      WHERE id = ?`,
    exitCode,
    stdout.slice(-80_000),
    stderr.slice(-80_000),
    Date.now() - started,
    initial.id,
  );
  const row = db.query<ProjectRunRow>(
    "SELECT * FROM projectRuns WHERE id = ? LIMIT 1",
    initial.id,
  )[0];
  if (!row) throw new Error("Project run insert failed.");
  return runFromRow(row);
};

export const cancelProjectRun = async (vaultRoot: string, id: number): Promise<boolean> => {
  const db = await openAgentStore(vaultRoot);
  const row = db.query<ProjectRunRow>("SELECT * FROM projectRuns WHERE id = ? LIMIT 1", id)[0];
  if (!row || row.exitCode !== null) return false;
  const proc = activeProjectRuns.get(id);
  if (!proc) return false;
  proc.kill();
  return true;
};

export const listProjectRuns = async (
  vaultRoot: string,
  projectSlug: string,
): Promise<ProjectRun[]> => {
  const clean = safeSlug(projectSlug);
  if (!clean) return [];
  const db = await openAgentStore(vaultRoot);
  return db
    .query<ProjectRunRow>(
      "SELECT * FROM projectRuns WHERE projectSlug = ? ORDER BY id DESC LIMIT 50",
      clean,
    )
    .map(runFromRow);
};

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
    tools: [
      "vault.search",
      "vault.read",
      "project.list",
      "project.read",
      "project.runs",
      "project.changed",
      "project.diff",
    ],
    prompt:
      "You are the project architect. Clarify goals, identify constraints, break work into small steps, and keep designs simple.",
  },
  {
    name: `${name} Builder`,
    description: "Implements focused changes and keeps momentum on the current task.",
    icon: "\u{1F6E0}\u{FE0F}",
    tools: [
      "vault.search",
      "vault.read",
      "vault.update",
      "vault.append",
      "project.list",
      "project.read",
      "project.propose",
      "project.write",
      "project.run",
      "project.runs",
      "project.changed",
      "project.diff",
    ],
    prompt:
      "You are the project builder. Make pragmatic implementation decisions, prefer small changes, and use project.propose for file edits unless the user explicitly asks you to write directly.",
  },
  {
    name: `${name} Reviewer`,
    description: "Reviews changes for bugs, missing tests, and regression risk.",
    icon: "\u{1F50E}",
    tools: [
      "vault.search",
      "vault.read",
      "project.list",
      "project.read",
      "project.runs",
      "project.changed",
      "project.diff",
    ],
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

export const getProject = async (vaultRoot: string, slug: string): Promise<ProjectDef | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  return (await listProjects(vaultRoot)).find((project) => project.slug === clean) ?? null;
};

export const projectTree = async (
  vaultRoot: string,
  slug: string,
): Promise<ProjectFileNode | null> => {
  const project = await getProject(vaultRoot, slug);
  if (!project) return null;
  if (!project.allowRead) return null;
  const info = await stat(project.path).catch(() => null);
  if (!info?.isDirectory()) return null;
  const root = project.path.replace(/\/+$/, "");
  return {
    name: project.name,
    path: "",
    kind: "folder",
    children: await listTree(root, root, 0),
  };
};

type PackageJson = {
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
};

const packageManagerForRoot = async (root: string): Promise<string | null> =>
  (await existsIn(root, "bun.lock"))
    ? "bun"
    : (await existsIn(root, "pnpm-lock.yaml"))
      ? "pnpm"
      : (await existsIn(root, "yarn.lock"))
        ? "yarn"
        : (await existsIn(root, "package-lock.json"))
          ? "npm"
          : null;

const safeScript = (name: string, command: string): boolean => {
  const key = name.toLowerCase();
  const value = command.toLowerCase();
  if (/(deploy|publish|release|prisma\s+migrate|db:push|rm\s+-rf|sudo)/.test(value)) return false;
  return /(test|check|lint|type|format|build|verify)/.test(key);
};

const approvedCommandsForRoot = async (root: string): Promise<string[]> => {
  const packageJson = await readJsonIn<PackageJson>(root, "package.json");
  const runner = (await packageManagerForRoot(root)) ?? "npm";
  return Object.entries(packageJson?.scripts ?? {})
    .filter(([name, command]) => safeScript(name, command))
    .map(([name]) => `${runner} run ${name}`)
    .slice(0, 8);
};

export const analyzeProject = async (
  vaultRoot: string,
  slug: string,
): Promise<ProjectAnalysis | null> => {
  const project = await getProject(vaultRoot, slug);
  if (!project) return null;
  const root = resolve(project.path);
  const packageJson = await readJsonIn<PackageJson>(root, "package.json");
  const scripts: ProjectScript[] = Object.entries(packageJson?.scripts ?? {}).map(
    ([name, command]) => ({
      name,
      command,
      safe: safeScript(name, command),
    }),
  );
  const deps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };
  const stack = new Set<string>();
  const importantFiles: string[] = [];
  const addFile = async (path: string, label?: string) => {
    if (await existsIn(root, path)) {
      importantFiles.push(path);
      if (label) stack.add(label);
    }
  };

  await addFile("package.json", "JavaScript");
  await addFile("bun.lock", "Bun");
  await addFile("tsconfig.json", "TypeScript");
  await addFile("vite.config.ts", "Vite");
  await addFile("vite.config.js", "Vite");
  await addFile("next.config.js", "Next.js");
  await addFile("next.config.mjs", "Next.js");
  await addFile("pyproject.toml", "Python");
  await addFile("Cargo.toml", "Rust");
  await addFile("go.mod", "Go");
  await addFile("Dockerfile", "Docker");
  if (deps.react) stack.add("React");
  if (deps.vue) stack.add("Vue");
  if (deps.svelte) stack.add("Svelte");

  const packageManager = await packageManagerForRoot(root);
  const runner = packageManager ?? "npm";
  const recommendedCommands = scripts
    .filter((script) => script.safe)
    .map((script) => `${runner} run ${script.name}`)
    .slice(0, 8);
  const warnings = [
    scripts.some((script) => /deploy|publish|release/.test(script.name.toLowerCase()))
      ? "Deploy or release scripts were detected. Keep those out of agent runs unless you explicitly trust the agent."
      : "",
    packageManager === null && scripts.length > 0
      ? "No lockfile was found, so command suggestions may use the wrong package manager."
      : "",
  ].filter(Boolean);

  return {
    projectSlug: project.slug,
    projectName: project.name,
    stack: [...stack],
    packageManager,
    scripts,
    recommendedCommands,
    approvedCommands: project.approvedCommands,
    importantFiles,
    warnings,
  };
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
  const approvedCommands = await approvedCommandsForRoot(path);
  db.exec(
    `INSERT INTO projects
      (slug, name, path, description, channelSlug, allowRead, allowWrite, allowRun, approvedCommands, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    slug,
    name,
    path,
    `External project folder ${basename(path)}.`,
    1,
    0,
    0,
    encodeList(approvedCommands),
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

export const setProjectPermissions = async (
  vaultRoot: string,
  slug: string,
  patch: Partial<Pick<ProjectDef, "allowRead" | "allowWrite" | "allowRun">>,
): Promise<ProjectDef | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  const current = await getProject(vaultRoot, clean);
  if (!current) return null;
  const db = await openAgentStore(vaultRoot);
  const allowRead = patch.allowRead ?? current.allowRead;
  const allowWrite = patch.allowWrite ?? current.allowWrite;
  const allowRun = patch.allowRun ?? current.allowRun;
  db.exec(
    `UPDATE projects SET
      allowRead = ?, allowWrite = ?, allowRun = ?, updatedAt = ?
      WHERE slug = ?`,
    allowRead ? 1 : 0,
    allowWrite ? 1 : 0,
    allowRun ? 1 : 0,
    now(),
    clean,
  );
  return getProject(vaultRoot, clean);
};

export const setProjectApprovedCommands = async (
  vaultRoot: string,
  slug: string,
  commands: readonly string[],
): Promise<ProjectDef | null> => {
  const clean = safeSlug(slug);
  if (!clean) return null;
  const current = await getProject(vaultRoot, clean);
  if (!current) return null;
  const db = await openAgentStore(vaultRoot);
  db.exec(
    "UPDATE projects SET approvedCommands = ?, updatedAt = ? WHERE slug = ?",
    encodeList(commands.map((command) => command.trim()).filter(Boolean)),
    now(),
    clean,
  );
  return getProject(vaultRoot, clean);
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
