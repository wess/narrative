// Standalone MCP server — exposes the Narrative vault to AI clients
// (Claude Desktop, Cursor, Claude Code, …) over stdio. Launch it with:
//
//   bun /absolute/path/to/narrative/src/mcp.ts
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
import * as repo from "./host/pages.ts";
import * as rel from "./host/relations.ts";
import { runSearch } from "./host/search.ts";
import { buildIndex } from "./host/vault/buildindex.ts";
import { dirExists } from "./host/vault/fileio.ts";
import { loadRecents } from "./host/vault/recents.ts";

const paths = await ensurePaths({ name: "Narrative", id: "io.wess.narrative" });

// Resolve which vault to serve: the most recent one that still exists, or
// the default vault folder if it's there.
const recents = await loadRecents(join(paths.config, "vaults.json"));
let root = recents.last();
if (!root || !(await dirExists(root))) {
  const fallback = join(paths.data, "vault");
  root = (await dirExists(fallback)) ? fallback : null;
}
if (!root) {
  process.stderr.write("[narrative-mcp] no vault found — open a vault in Narrative first\n");
  process.exit(1);
}

const vault = await buildIndex(root);
const db = vault.db;

const server = createMcpServer({
  name: "narrative",
  version: "1.0.0",
  description: "Search and read your Narrative knowledge base.",
});

// The installed MCP SDK wants Zod raw shapes for `inputSchema`.
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

server.tool({
  name: "list-pages",
  description: "List every page in the knowledge base (id, title, path, parent id).",
  handler: () =>
    db.query<{ id: number; title: string; path: string; parentId: number | null }>(
      "SELECT id, title, path, parentId FROM nodes WHERE kind = 'file' AND archived = 0 ORDER BY title COLLATE NOCASE",
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
    "Create a new page (a real .md file in the vault). Wiki links ([[…]]) and #tags in the body are indexed automatically.",
  inputSchema: {
    title: z.string().describe("Page title"),
    body: z.string().optional().describe("Markdown body"),
  },
  handler: async ({ title, body }) => {
    const page = await repo.createPage(vault, { title, body: body ?? "" });
    return { id: page.id, path: page.path, title: page.title };
  },
});

server.resource({
  uri: "narrative://recent",
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
  uri: "narrative://tags",
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
