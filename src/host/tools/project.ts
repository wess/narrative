import { readdir } from "node:fs/promises";
import {
  changedProjectFiles,
  diffProjectFile,
  getProject,
  listProjectRuns,
  listProjects,
  proposeProjectWrite,
  readProjectFile as readRegisteredProjectFile,
  resolveProjectFile,
  runProjectCommand,
  writeProjectFile as writeRegisteredProjectFile,
} from "../agents/project.ts";
import { asBool, asNumber, asObject, asString, type Tool } from "./types.ts";

const MAX_WRITE_BYTES = 1_000_000;
const SKIP = new Set([".git", "node_modules", ".next", "dist", "build", ".turbo"]);

export const listProjectFiles: Tool = {
  name: "project.list",
  description: "List registered projects, or list files inside a project folder.",
  usage: '{"project": "stohr", "path": "src"}',
  run: async (ctx, args) => {
    const o = asObject(args);
    const projectSlug = asString(o.project) ?? asString(o.projectSlug);
    if (!projectSlug) {
      const projects = await listProjects(ctx.vault.root);
      return {
        projects: projects.map((p) => ({
          slug: p.slug,
          name: p.name,
          path: p.path,
          approvedCommands: p.approvedCommands,
        })),
      };
    }
    const project = await getProject(ctx.vault.root, projectSlug);
    if (!project?.allowRead) return { error: "Project read access is disabled for this project." };
    const target = await resolveProjectFile(ctx.vault.root, projectSlug, asString(o.path) ?? "");
    if (!target) return { error: "project or path not found" };
    const entries = await readdir(target.full, { withFileTypes: true }).catch(() => null);
    if (!entries) return { error: "folder not found or not readable" };
    return {
      project: projectSlug,
      path: target.rel,
      entries: entries
        .filter((entry) => !entry.name.startsWith(".") || entry.name === ".github")
        .filter((entry) => !(entry.isDirectory() && SKIP.has(entry.name)))
        .map((entry) => ({
          name: entry.name,
          kind: entry.isDirectory() ? "folder" : entry.isFile() ? "file" : "other",
        })),
    };
  },
};

export const readProjectFile: Tool = {
  name: "project.read",
  description: "Read a text file inside a registered project folder.",
  usage: '{"project": "stohr", "path": "package.json"}',
  run: async (ctx, args) => {
    const o = asObject(args);
    const projectSlug = asString(o.project) ?? asString(o.projectSlug);
    const path = asString(o.path);
    if (!projectSlug || !path) return { error: "project and path are required" };
    const project = await getProject(ctx.vault.root, projectSlug);
    if (!project?.allowRead) return { error: "Project read access is disabled for this project." };
    const result = await readRegisteredProjectFile(ctx.vault.root, projectSlug, path);
    return result ?? { error: "file not found, not readable, or too large" };
  },
};

export const writeProjectFile: Tool = {
  name: "project.write",
  description:
    "Write a text file inside a registered project folder. Creates a snapshot before replacing an existing file. Requires project write access in Settings and confirm: true.",
  usage:
    '{"project": "stohr", "path": "src/index.ts", "content": "…", "reason": "implement feature", "confirm": true}',
  run: async (ctx, args) => {
    if (!ctx.projectWrite) {
      return { error: "Project folder writes are disabled in Settings." };
    }
    const o = asObject(args);
    if (asBool(o.confirm) !== true) {
      return { error: "Project writes require confirm: true." };
    }
    const projectSlug = asString(o.project) ?? asString(o.projectSlug);
    const path = asString(o.path);
    const content = asString(o.content);
    if (!projectSlug || !path || content === null) {
      return { error: "project, path, and content are required" };
    }
    const project = await getProject(ctx.vault.root, projectSlug);
    if (!project?.allowWrite)
      return { error: "Project write access is disabled for this project." };
    if (new TextEncoder().encode(content).byteLength > MAX_WRITE_BYTES) {
      return { error: "content is too large" };
    }
    return writeRegisteredProjectFile(
      ctx.vault.root,
      projectSlug,
      path,
      content,
      asString(o.reason) ?? "agent write",
    );
  },
};

export const proposeProjectFile: Tool = {
  name: "project.propose",
  description:
    "Propose a text-file change inside a registered project folder for user review. Does not write the file.",
  usage:
    '{"project": "stohr", "path": "src/index.ts", "content": "…", "reason": "implement feature"}',
  run: async (ctx, args) => {
    const o = asObject(args);
    const projectSlug = asString(o.project) ?? asString(o.projectSlug);
    const path = asString(o.path);
    const content = asString(o.content);
    if (!projectSlug || !path || content === null) {
      return { error: "project, path, and content are required" };
    }
    if (new TextEncoder().encode(content).byteLength > MAX_WRITE_BYTES) {
      return { error: "content is too large" };
    }
    return proposeProjectWrite(
      ctx.vault.root,
      projectSlug,
      path,
      content,
      asString(o.reason) ?? "agent proposed change",
    );
  },
};

export const runProject: Tool = {
  name: "project.run",
  description:
    "Run a command inside a registered project folder. Stores stdout, stderr, exit code, and duration. Requires project write access in Settings and confirm: true.",
  usage:
    '{"project": "stohr", "command": "bun test", "cwd": "", "timeoutMs": 120000, "confirm": true}',
  run: async (ctx, args) => {
    if (!ctx.projectWrite) {
      return { error: "Project command execution is disabled in Settings." };
    }
    const o = asObject(args);
    if (asBool(o.confirm) !== true) {
      return { error: "Project command execution requires confirm: true." };
    }
    const projectSlug = asString(o.project) ?? asString(o.projectSlug);
    const command = asString(o.command);
    if (!projectSlug || !command) return { error: "project and command are required" };
    const project = await getProject(ctx.vault.root, projectSlug);
    if (!project?.allowRun) {
      return { error: "Project command execution is disabled for this project." };
    }
    return runProjectCommand(
      ctx.vault.root,
      projectSlug,
      command,
      asString(o.cwd) ?? "",
      asNumber(o.timeoutMs) ?? 120_000,
    );
  },
};

export const recentProjectRuns: Tool = {
  name: "project.runs",
  description: "List recent command runs for a registered project.",
  usage: '{"project": "stohr"}',
  run: async (ctx, args) => {
    const projectSlug = asString(asObject(args).project) ?? asString(asObject(args).projectSlug);
    if (!projectSlug) return { error: "project is required" };
    return { runs: await listProjectRuns(ctx.vault.root, projectSlug) };
  },
};

export const changedProjectFilesTool: Tool = {
  name: "project.changed",
  description: "List files that have snapshots from prior agent writes.",
  usage: '{"project": "stohr"}',
  run: async (ctx, args) => {
    const projectSlug = asString(asObject(args).project) ?? asString(asObject(args).projectSlug);
    if (!projectSlug) return { error: "project is required" };
    return { files: await changedProjectFiles(ctx.vault.root, projectSlug) };
  },
};

export const diffProjectFileTool: Tool = {
  name: "project.diff",
  description: "Show the diff between the latest snapshot and current file content.",
  usage: '{"project": "stohr", "path": "src/index.ts"}',
  run: async (ctx, args) => {
    const o = asObject(args);
    const projectSlug = asString(o.project) ?? asString(o.projectSlug);
    const path = asString(o.path);
    if (!projectSlug || !path) return { error: "project and path are required" };
    return (
      (await diffProjectFile(ctx.vault.root, projectSlug, path)) ?? {
        error: "no snapshot diff available",
      }
    );
  },
};

export const tools: readonly Tool[] = [
  listProjectFiles,
  readProjectFile,
  proposeProjectFile,
  writeProjectFile,
  runProject,
  recentProjectRuns,
  changedProjectFilesTool,
  diffProjectFileTool,
];
