// Read-only vault tools: search, listings, tags, links. Each one returns a
// JSON-shaped object the model can quote back into prose, with page ids the
// next tool turn can act on.

import { findByTitle, getPage } from "../pages.ts";
import { retrieveContext } from "../rag.ts";
import * as rel from "../relations.ts";
import { runSearch } from "../search.ts";
import { asNumber, asObject, asString, type Tool } from "./types.ts";

const projectPage = (page: { id: number; title: string; path: string; icon: string }) => ({
  id: page.id,
  title: page.title,
  path: page.path,
  icon: page.icon,
});

export const search: Tool = {
  name: "vault.search",
  description: "Full-text search the vault. Supports tag:foo, title:bar, /regex/.",
  usage: '{"query": "design notes"}',
  run: async (ctx, args) => {
    const query = asString(asObject(args).query);
    if (!query) return { error: "query is required" };
    const hits = runSearch(ctx.vault.db, query)
      .map((hit) => {
        const page = getPage(ctx.vault.db, hit.id);
        return page ? { ...projectPage(page), snippet: hit.snippet } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 12);
    return { hits };
  },
};

export const semanticSearch: Tool = {
  name: "vault.semanticsearch",
  description:
    "Semantic / RAG retrieval: ranks pages by meaning. Falls back to keyword search when embeddings aren't available.",
  usage: '{"query": "what we decided about onboarding", "k": 5}',
  run: async (ctx, args) => {
    const o = asObject(args);
    const query = asString(o.query);
    if (!query) return { error: "query is required" };
    if (!ctx.provider) return { error: "No AI provider configured." };
    const k = asNumber(o.k) ?? 5;
    const { pages, mode } = await retrieveContext(ctx.vault.db, ctx.provider, query, k);
    return { mode, pages: pages.map(projectPage) };
  },
};

export const readPage: Tool = {
  name: "vault.read",
  description: "Read a page by id or title. Returns the full markdown body.",
  usage: '{"id": 12} or {"title": "Welcome"}',
  run: async (ctx, args) => {
    const o = asObject(args);
    const id = asNumber(o.id);
    if (id !== null) {
      const page = getPage(ctx.vault.db, id);
      if (!page) return { error: `Page ${id} not found.` };
      return { id: page.id, title: page.title, path: page.path, body: page.body };
    }
    const title = asString(o.title);
    if (!title) return { error: "id or title is required" };
    const page = findByTitle(ctx.vault.db, title);
    if (!page) return { error: `No page titled "${title}".` };
    return { id: page.id, title: page.title, path: page.path, body: page.body };
  },
};

export const backlinks: Tool = {
  name: "vault.backlinks",
  description: "Pages that link to a given page (explicit and unlinked mentions).",
  usage: '{"id": 12}',
  run: async (ctx, args) => {
    const id = asNumber(asObject(args).id);
    if (id === null) return { error: "id is required" };
    const page = getPage(ctx.vault.db, id);
    if (!page) return { error: `Page ${id} not found.` };
    const result = rel.backlinksFor(ctx.vault.db, id, page.title);
    return {
      linked: result.linked.map((b) => ({ id: b.id, title: b.title, snippet: b.snippet })),
      unlinked: result.unlinked.map((b) => ({ id: b.id, title: b.title, snippet: b.snippet })),
    };
  },
};

export const outgoing: Tool = {
  name: "vault.outgoing",
  description: "Pages a given page links out to.",
  usage: '{"id": 12}',
  run: async (ctx, args) => {
    const id = asNumber(asObject(args).id);
    if (id === null) return { error: "id is required" };
    const links = rel.outgoingFor(ctx.vault.db, id);
    return { links: links.map((b) => ({ id: b.id, title: b.title })) };
  },
};

export const tags: Tool = {
  name: "vault.tags",
  description: "Every tag in the vault with usage counts.",
  usage: "{}",
  run: async (ctx) => ({ tags: rel.listTags(ctx.vault.db) }),
};

export const pagesWithTag: Tool = {
  name: "vault.tagpages",
  description: "Pages carrying a tag (or any nested tag beneath it).",
  usage: '{"tag": "idea"}',
  run: async (ctx, args) => {
    const tag = asString(asObject(args).tag);
    if (!tag) return { error: "tag is required" };
    return {
      pages: rel
        .pagesWithTag(ctx.vault.db, tag)
        .map((p) => ({ id: p.id, title: p.title, path: p.path })),
    };
  },
};

export const stats: Tool = {
  name: "vault.stats",
  description: "Total pages, words, links, and tags in the vault.",
  usage: "{}",
  run: async (ctx) => rel.statsFor(ctx.vault.db),
};

export const tools: readonly Tool[] = [
  search,
  semanticSearch,
  readPage,
  backlinks,
  outgoing,
  tags,
  pagesWithTag,
  stats,
];
