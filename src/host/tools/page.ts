// Mutating tools that touch the vault: create pages, append/replace bodies,
// pin / archive / tag, and open a page in the editor. Each goes through the
// real repo, which writes the file first and then syncs the index.

import { emit } from "@basket/ipc";
import * as ch from "../../shared/channels.ts";
import * as repo from "../pages.ts";
import { asBool, asNumber, asObject, asString, type Tool } from "./types.ts";

const resolveId = async (
  ctx: import("./types.ts").ToolContext,
  o: Record<string, unknown>,
): Promise<number | null> => {
  const id = asNumber(o.id);
  if (id !== null) return id;
  const title = asString(o.title);
  if (!title) return null;
  const page = repo.findByTitle(ctx.vault.db, title);
  return page ? page.id : null;
};

export const createPage: Tool = {
  name: "vault.create",
  description: "Create a new page in the vault. Returns its id and path.",
  usage: '{"title": "Untitled", "body": "# Hello\\n", "icon": "📝"}',
  run: async (ctx, args) => {
    const o = asObject(args);
    const title = asString(o.title) ?? "Untitled";
    const body = asString(o.body) ?? "";
    const icon = asString(o.icon) ?? "";
    const parentId = asNumber(o.parentId);
    const page = await repo.createPage(ctx.vault, {
      title,
      body,
      icon,
      parentId,
    });
    emit(ch.treeChanged, undefined);
    return { id: page.id, path: page.path, title: page.title };
  },
};

export const appendPage: Tool = {
  name: "vault.append",
  description: "Append text to the end of a page's body.",
  usage: '{"id": 12, "text": "\\n\\n- new bullet"}',
  run: async (ctx, args) => {
    const o = asObject(args);
    const id = await resolveId(ctx, o);
    if (id === null) return { error: "id or title is required" };
    const existing = repo.getPage(ctx.vault.db, id);
    if (!existing) return { error: `Page ${id} not found.` };
    const text = asString(o.text);
    if (text === null) return { error: "text is required" };
    const body = existing.body.endsWith("\n") ? existing.body + text : `${existing.body}\n${text}`;
    const page = await repo.updatePage(ctx.vault, { id, body });
    emit(ch.pageSaved, page);
    return { id: page.id, path: page.path };
  },
};

export const updatePage: Tool = {
  name: "vault.update",
  description: "Replace a page's body (and/or title / icon).",
  usage: '{"id": 12, "body": "…", "title": "new title", "icon": "🪶"}',
  run: async (ctx, args) => {
    const o = asObject(args);
    const id = await resolveId(ctx, o);
    if (id === null) return { error: "id or title is required" };
    const patch: Parameters<typeof repo.updatePage>[1] = { id };
    const body = asString(o.body);
    if (body !== null) (patch as { body?: string }).body = body;
    const newTitle = asString(o.newTitle) ?? asString(o.rename);
    if (newTitle !== null) (patch as { title?: string }).title = newTitle;
    const icon = asString(o.icon);
    if (icon !== null) (patch as { icon?: string }).icon = icon;
    const pinned = asBool(o.pinned);
    if (pinned !== null) (patch as { pinned?: boolean }).pinned = pinned;
    const archived = asBool(o.archived);
    if (archived !== null) (patch as { archived?: boolean }).archived = archived;
    const page = await repo.updatePage(ctx.vault, patch);
    emit(ch.pageSaved, page);
    return { id: page.id, path: page.path, title: page.title };
  },
};

export const openPage: Tool = {
  name: "vault.open",
  description: "Open a page in the editor for the user.",
  usage: '{"id": 12} or {"title": "Welcome"}',
  run: async (ctx, args) => {
    const o = asObject(args);
    const id = await resolveId(ctx, o);
    if (id === null) return { error: "id or title is required" };
    const page = repo.getPage(ctx.vault.db, id);
    if (!page) return { error: `Page ${id} not found.` };
    ctx.emitFocus(page.id);
    return { id: page.id, title: page.title, path: page.path };
  },
};

export const dailyNote: Tool = {
  name: "vault.daily",
  description: "Find or create the daily note for a date (defaults to today).",
  usage: '{"date": "2026-05-26"}',
  run: async (ctx, args) => {
    const date = asString(asObject(args).date) ?? new Date().toISOString().slice(0, 10);
    const page = await repo.resolveDaily(ctx.vault, date);
    emit(ch.treeChanged, undefined);
    return { id: page.id, title: page.title, path: page.path };
  },
};

export const recent: Tool = {
  name: "vault.recent",
  description: "Most recently updated pages (up to 20).",
  usage: "{}",
  run: async (ctx) =>
    ({
      pages: repo
        .recentPages(ctx.vault.db)
        .map((p) => ({ id: p.id, title: p.title, path: p.path })),
    }) as const,
};

export const pinned: Tool = {
  name: "vault.pinned",
  description: "Pinned pages.",
  usage: "{}",
  run: async (ctx) =>
    ({
      pages: repo
        .pinnedPages(ctx.vault.db)
        .map((p) => ({ id: p.id, title: p.title, path: p.path })),
    }) as const,
};

export const tools: readonly Tool[] = [
  createPage,
  appendPage,
  updatePage,
  openPage,
  dailyNote,
  recent,
  pinned,
];
