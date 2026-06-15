// Standalone MCP server — exposes the Bethink vault to AI clients
// (Claude Desktop, Cursor, Claude Code, …) over stdio. Launch it with:
//
//   bun /absolute/path/to/bethink/src/mcp.ts
//
// then register that command in the client's MCP config. The vault is a
// folder of Markdown files; this process opens the most-recently-used vault,
// builds its own in-memory index, and serves reads + `create-page` (which
// writes a real `.md` file — the running app's watcher will pick it up).
//
// IMPORTANT: this process must never write to stdout except MCP protocol
// frames, so nothing here may `console.log` (stderr is fine).

import { join } from "node:path";
import { ensurePaths } from "@basket/config";
import { createMcpServer } from "@basket/mcp";
import { z } from "zod";
import {
  createHarnessScenario,
  diffProjectFile,
  getProject,
  listAgentRuns,
  listAgents,
  listChannelMessages,
  listChannels,
  listHarnessRuns,
  listHarnessScenarios,
  listProjectRuns,
  listProjects,
  listProjectWriteProposals,
  projectTree,
  proposeProjectWrite,
  readProjectFile,
  recordHarnessRun,
} from "./host/agents/index.ts";
import { listChannelMemories, listGlobalMemories } from "./host/agents/memory.ts";
import { buildCanvasView } from "./host/canvas.ts";
import { captureWeb, listWebCaptures } from "./host/capture.ts";
import * as repo from "./host/pages.ts";
import { buildBaseView } from "./host/properties.ts";
import * as rel from "./host/relations.ts";
import { runSearch, runUnifiedSearch } from "./host/search.ts";
import { buildIndex } from "./host/vault/buildindex.ts";
import { dirExists } from "./host/vault/fileio.ts";
import { loadRecents } from "./host/vault/recents.ts";

const paths = await ensurePaths({ name: "Bethink", id: "io.wess.bethink" });

// Resolve which vault to serve: the most recent one that still exists, or
// the default vault folder if it's there.
const recents = await loadRecents(join(paths.config, "vaults.json"));
let root = recents.last();
if (!root || !(await dirExists(root))) {
  const fallback = join(paths.data, "vault");
  root = (await dirExists(fallback)) ? fallback : null;
}
if (!root) {
  process.stderr.write("[bethink-mcp] no vault found — open a vault in Bethink first\n");
  process.exit(1);
}

let vault = await buildIndex(root);
let db = vault.db;
const writesEnabled = /^(1|true|yes)$/i.test(process.env.BETHINK_MCP_ALLOW_WRITES ?? "");

const mcpError = (
  code: string,
  message: string,
): { ok: false; error: { code: string; message: string } } => ({
  ok: false,
  error: { code, message },
});

const limitOf = (limit: number | undefined, fallback: number, max: number): number =>
  Math.max(1, Math.min(max, Math.floor(limit ?? fallback)));

const refreshVault = async (): Promise<void> => {
  vault = await buildIndex(root);
  db = vault.db;
};

const requireProjectRead = async (
  project: string,
): Promise<{ ok: true } | { ok: false; error: ReturnType<typeof mcpError> }> => {
  const record = await getProject(root, project);
  if (!record) return { ok: false, error: mcpError("project_not_found", "Project not found.") };
  if (!record.allowRead) {
    return {
      ok: false,
      error: mcpError("project_read_disabled", "Project read access is disabled for this project."),
    };
  }
  return { ok: true };
};

const server = createMcpServer({
  name: "bethink",
  version: "1.0.0",
  description: "Search and read your Bethink knowledge base, agents, channels, and projects.",
});

// The installed MCP SDK wants Zod raw shapes for `inputSchema`.
server.tool({
  name: "server-status",
  description: "Bethink MCP server status, active vault, and permission flags.",
  handler: () => ({
    ok: true,
    vault: {
      root,
      pages: db.query<{ count: number }>("SELECT COUNT(*) AS count FROM nodes")[0]?.count ?? 0,
    },
    permissions: {
      reads: true,
      writes: writesEnabled,
      writeEnvironment: "BETHINK_MCP_ALLOW_WRITES=true",
    },
  }),
});

server.tool({
  name: "refresh-index",
  description: "Rebuild the MCP server's in-memory vault index from disk.",
  handler: async () => {
    await refreshVault();
    return {
      ok: true,
      pages:
        db.query<{ count: number }>(
          "SELECT COUNT(*) AS count FROM nodes WHERE kind = 'file' AND archived = 0",
        )[0]?.count ?? 0,
    };
  },
});

server.tool<{ query: string }>({
  name: "search-pages",
  description:
    "Full-text search across the knowledge base. Supports operators: tag:foo, title:foo, content:foo, and /regex/.",
  inputSchema: { query: z.string().describe("Search query") },
  handler: ({ query }) =>
    runSearch(db, query)
      .slice(0, 20)
      .map((hit) => {
        const page = repo.getPage(db, hit.id);
        return { id: hit.id, title: page?.title ?? "Untitled", snippet: hit.snippet };
      }),
});

server.tool<{ query: string }>({
  name: "search-all",
  description:
    "Unified Bethink search across pages, agents, channels, projects, memory, captures, runs, transcripts, and proposals.",
  inputSchema: { query: z.string().describe("Search query") },
  handler: ({ query }) => runUnifiedSearch(root, db, query),
});

server.tool<{ id?: number; title?: string }>({
  name: "get-page",
  description: "Fetch a page's full markdown content by id or exact (case-insensitive) title.",
  inputSchema: {
    id: z.number().optional().describe("Page id"),
    title: z.string().optional().describe("Exact page title"),
  },
  handler: ({ id, title }) => {
    const page =
      id !== undefined ? repo.getPage(db, id) : title ? repo.findByTitle(db, title) : null;
    if (!page) return { error: "Page not found" };
    return {
      id: page.id,
      path: page.path,
      title: page.title,
      body: page.body,
      updatedAt: page.updatedAt,
    };
  },
});

server.tool<{ limit?: number }>({
  name: "list-pages",
  description: "List every page in the knowledge base (id, title, path, parent id).",
  inputSchema: {
    limit: z.number().optional().describe("Maximum pages to return, capped at 500"),
  },
  handler: ({ limit }) =>
    db.query<{ id: number; title: string; path: string; parentId: number | null }>(
      "SELECT id, title, path, parentId FROM nodes WHERE kind = 'file' AND archived = 0 ORDER BY title COLLATE NOCASE LIMIT ?",
      limitOf(limit, 200, 500),
    ),
});

server.tool<{ id: number }>({
  name: "page-links",
  description: "The pages linking to a page (backlinks) and the pages it links out to.",
  inputSchema: { id: z.number().describe("Page id") },
  handler: ({ id }) => {
    const page = repo.getPage(db, id);
    if (!page) return { error: "Page not found" };
    return {
      incoming: rel
        .backlinksFor(db, id, page.title)
        .linked.map((b) => ({ id: b.id, title: b.title })),
      outgoing: rel.outgoingFor(db, id).map((b) => ({ id: b.id, title: b.title })),
    };
  },
});

server.tool<{ title: string; body?: string }>({
  name: "create-page",
  description:
    "Create a new page (a real .md file in the vault). Requires BETHINK_MCP_ALLOW_WRITES=true.",
  inputSchema: {
    title: z.string().describe("Page title"),
    body: z.string().optional().describe("Markdown body"),
  },
  handler: async ({ title, body }) => {
    if (!writesEnabled)
      return mcpError("writes_disabled", "Set BETHINK_MCP_ALLOW_WRITES=true to enable MCP writes.");
    const page = await repo.createPage(vault, { title, body: body ?? "" });
    return { id: page.id, path: page.path, title: page.title };
  },
});

server.tool({
  name: "list-agents",
  description: "List Bethink agents with model/provider hints and tool allowlists.",
  handler: () => listAgents(root),
});

server.tool({
  name: "list-channels",
  description: "List Bethink channels, assigned agents, linked projects, context, and briefs.",
  handler: () => listChannels(root),
});

server.tool<{ channel: string; limit?: number }>({
  name: "channel-messages",
  description: "List recent durable transcript messages for a channel.",
  inputSchema: {
    channel: z.string().describe("Channel slug"),
    limit: z.number().optional().describe("Maximum messages, capped at 300"),
  },
  handler: async ({ channel, limit }) => ({
    messages: await listChannelMessages(root, channel, limitOf(limit, 80, 300)),
  }),
});

server.tool({
  name: "list-projects",
  description: "List registered project folders. Does not read project file contents.",
  handler: () => listProjects(root),
});

server.tool<{ project: string }>({
  name: "project-tree",
  description: "List the visible file tree for a registered project folder.",
  inputSchema: {
    project: z.string().describe("Project slug"),
  },
  handler: async ({ project }) => {
    const readable = await requireProjectRead(project);
    if (!readable.ok) return readable.error;
    return (
      (await projectTree(root, project)) ?? mcpError("project_not_found", "Project not found.")
    );
  },
});

server.tool<{ project: string; path: string }>({
  name: "project-read-file",
  description: "Read a text file inside a registered project folder.",
  inputSchema: {
    project: z.string().describe("Project slug"),
    path: z.string().describe("Project-relative file path"),
  },
  handler: async ({ project, path }) => {
    const readable = await requireProjectRead(project);
    if (!readable.ok) return readable.error;
    return (
      (await readProjectFile(root, project, path)) ??
      mcpError("file_not_readable", "File was not found, is too large, or is not readable.")
    );
  },
});

server.tool<{ project: string; path: string }>({
  name: "project-diff-file",
  description: "Show the latest saved before-and-after view for a project file.",
  inputSchema: {
    project: z.string().describe("Project slug"),
    path: z.string().describe("Project-relative file path"),
  },
  handler: async ({ project, path }) => {
    const readable = await requireProjectRead(project);
    if (!readable.ok) return readable.error;
    return (
      (await diffProjectFile(root, project, path)) ??
      mcpError("diff_not_found", "No saved file change is available for that path.")
    );
  },
});

server.tool<{ project: string }>({
  name: "project-run-history",
  description: "List recent stored command runs for a registered project.",
  inputSchema: {
    project: z.string().describe("Project slug"),
  },
  handler: async ({ project }) => ({ runs: (await listProjectRuns(root, project)).slice(0, 20) }),
});

server.tool<{ limit?: number }>({
  name: "agent-run-history",
  description: "List recent durable agent runs across agents and channels.",
  inputSchema: {
    limit: z.number().optional().describe("Maximum runs, capped at 300"),
  },
  handler: async ({ limit }) => ({ runs: await listAgentRuns(root, limitOf(limit, 80, 300)) }),
});

server.tool<{ limit?: number }>({
  name: "harness-scenarios",
  description:
    "List saved agent harness scenarios for replay, regression checks, and loop testing.",
  inputSchema: {
    limit: z.number().optional().describe("Maximum scenarios, capped at 300"),
  },
  handler: async ({ limit }) => ({
    scenarios: await listHarnessScenarios(root, limitOf(limit, 100, 300)),
  }),
});

server.tool<{
  name: string;
  prompt: string;
  expected?: string;
  agent?: string;
  channel?: string;
  tools?: string[];
  maxIterations?: number;
}>({
  name: "harness-create-scenario",
  description:
    "Create an agent harness scenario. Requires BETHINK_MCP_ALLOW_WRITES=true because it writes Bethink metadata.",
  inputSchema: {
    name: z.string().describe("Scenario name"),
    prompt: z.string().describe("User prompt to replay"),
    expected: z.string().optional().describe("Expected behavior or acceptance criteria"),
    agent: z.string().optional().describe("Optional agent slug"),
    channel: z.string().optional().describe("Optional channel slug"),
    tools: z.array(z.string()).optional().describe("Expected or allowed tools for this scenario"),
    maxIterations: z.number().optional().describe("Iteration budget for loop testing"),
  },
  handler: async (input) => {
    if (!writesEnabled)
      return mcpError("writes_disabled", "Set BETHINK_MCP_ALLOW_WRITES=true to enable MCP writes.");
    return createHarnessScenario(root, {
      name: input.name,
      prompt: input.prompt,
      expected: input.expected,
      agentSlug: input.agent,
      channelSlug: input.channel,
      tools: input.tools,
      maxIterations: input.maxIterations,
    });
  },
});

server.tool<{ scenario?: string; limit?: number }>({
  name: "harness-run-history",
  description: "List recorded harness run results, optionally for one scenario.",
  inputSchema: {
    scenario: z.string().optional().describe("Optional scenario slug"),
    limit: z.number().optional().describe("Maximum runs, capped at 300"),
  },
  handler: async ({ scenario, limit }) => ({
    runs: await listHarnessRuns(root, scenario, limitOf(limit, 100, 300)),
  }),
});

server.tool<{
  scenario: string;
  status: "pass" | "fail" | "error";
  score?: number;
  notes?: string;
  agentRunId?: number;
  stopReason?: "complete" | "maxiterations" | "cancelled" | "error";
  iterations?: number;
}>({
  name: "harness-record-run",
  description:
    "Record a harness result for a scenario. Requires BETHINK_MCP_ALLOW_WRITES=true because it writes Bethink metadata.",
  inputSchema: {
    scenario: z.string().describe("Scenario slug"),
    status: z.enum(["pass", "fail", "error"]).describe("Harness result"),
    score: z.number().optional().describe("0..1 score"),
    notes: z.string().optional().describe("Result notes"),
    agentRunId: z.number().optional().describe("Linked agent run id"),
    stopReason: z.enum(["complete", "maxiterations", "cancelled", "error"]).optional(),
    iterations: z.number().optional().describe("Loop iterations used"),
  },
  handler: async (input) => {
    if (!writesEnabled)
      return mcpError("writes_disabled", "Set BETHINK_MCP_ALLOW_WRITES=true to enable MCP writes.");
    return recordHarnessRun(root, {
      scenarioSlug: input.scenario,
      status: input.status,
      score: input.score,
      notes: input.notes,
      agentRunId: input.agentRunId,
      stopReason: input.stopReason,
      iterations: input.iterations,
    });
  },
});

server.tool({
  name: "project-review-queue",
  description: "List pending project write proposals awaiting user review.",
  handler: async () => ({ proposals: await listProjectWriteProposals(root) }),
});

server.tool<{ project: string; path: string; content: string; reason?: string }>({
  name: "project-propose-file",
  description:
    "Queue a proposed project file change for in-app review. Requires BETHINK_MCP_ALLOW_WRITES=true.",
  inputSchema: {
    project: z.string().describe("Project slug"),
    path: z.string().describe("Project-relative file path"),
    content: z.string().describe("Proposed full file content"),
    reason: z.string().optional().describe("Why this change is proposed"),
  },
  handler: async ({ project, path, content, reason }) => {
    if (!writesEnabled)
      return mcpError("writes_disabled", "Set BETHINK_MCP_ALLOW_WRITES=true to enable MCP writes.");
    return proposeProjectWrite(root, project, path, content, reason ?? "MCP proposed change");
  },
});

server.tool<{ channel?: string; limit?: number }>({
  name: "memory-list",
  description: "List global memory, or channel memory when a channel slug is provided.",
  inputSchema: {
    channel: z.string().optional().describe("Optional channel slug"),
    limit: z.number().optional().describe("Maximum memories, capped at 100"),
  },
  handler: async ({ channel, limit }) =>
    channel
      ? { memories: await listChannelMemories(root, channel, limitOf(limit, 20, 100)) }
      : { memories: await listGlobalMemories(root, limitOf(limit, 20, 100)) },
});

server.tool({
  name: "table-view",
  description:
    "Return Bethink's table view: pages, projects, agents, and channels with properties.",
  handler: () => buildBaseView(vault),
});

server.tool({
  name: "canvas-view",
  description: "Return Bethink's canvas nodes and edges for workspace mapping.",
  handler: () => buildCanvasView(vault),
});

server.tool<{ url: string; title?: string; notes?: string }>({
  name: "capture-web",
  description:
    "Capture a web URL into a Markdown page with source metadata. Requires BETHINK_MCP_ALLOW_WRITES=true.",
  inputSchema: {
    url: z.string().describe("URL to capture"),
    title: z.string().optional().describe("Optional title override"),
    notes: z.string().optional().describe("Optional capture notes"),
  },
  handler: async (input) => {
    if (!writesEnabled)
      return mcpError("writes_disabled", "Set BETHINK_MCP_ALLOW_WRITES=true to enable MCP writes.");
    return captureWeb(vault, input);
  },
});

server.tool<{ limit?: number }>({
  name: "capture-history",
  description: "List recent web captures and the Bethink pages they created.",
  inputSchema: {
    limit: z.number().optional().describe("Maximum captures, capped at 300"),
  },
  handler: async ({ limit }) => ({
    captures: await listWebCaptures(root, limitOf(limit, 100, 300)),
  }),
});

server.resource({
  uri: "bethink://recent",
  name: "Recent pages",
  description: "The 15 most recently updated pages, as markdown.",
  mimeType: "text/markdown",
  handler: () =>
    repo
      .recentPages(db)
      .slice(0, 15)
      .map((meta) => {
        const page = repo.getPage(db, meta.id);
        return `# ${page?.title ?? meta.title}\n\n${page?.body ?? ""}`;
      })
      .join("\n\n---\n\n"),
});

server.resource({
  uri: "bethink://tags",
  name: "All tags",
  description: "Every tag in the vault with its page count.",
  mimeType: "text/plain",
  handler: () =>
    rel
      .listTags(db)
      .map((t) => `#${t.tag} (${t.count})`)
      .join("\n"),
});

await server.serve();
