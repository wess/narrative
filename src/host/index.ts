import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Provider } from "@basket/ai";
import { defineConfig, ensurePaths, paths } from "@basket/config";
import type { DB } from "@basket/db";
import { openFolder, saveFile } from "@basket/dialog";
import { emit, handle } from "@basket/ipc";
import { applyMenu, onMenu } from "@basket/menu";
import { createStore } from "@basket/store";
import { mainWindow } from "@basket/window";
import * as ch from "../shared/channels.ts";
import { PROVIDERS } from "../shared/providers.ts";
import type { AiResult, SearchHit, VaultInfo } from "../shared/types.ts";
import { buildProvider, SYSTEM_PROMPT } from "./ai.ts";
import menu from "./menu.ts";
import * as repo from "./pages.ts";
import { createPluginStore, registerPluginHandlers } from "./plugins/index.ts";
import { seedSamplePlugin } from "./plugins/sample.ts";
import { embeddingStatus, embedPage, reindexAll, retrieveContext } from "./rag.ts";
import * as rel from "./relations.ts";
import { runSearch } from "./search.ts";
import { seedVault } from "./seed.ts";
import { createSettings } from "./settings.ts";
import { createStohr } from "./stohr/index.ts";
import { dirExists } from "./vault/fileio.ts";
import { closeVault, currentVault, type OpenVault, openVault } from "./vault/index.ts";
import { loadRecents } from "./vault/recents.ts";

const config = defineConfig({ app: { name: "Narrative", id: "io.wess.narrative" } });
const p = await ensurePaths(config.app);

const settings = createStore("settings", {
  app: config.app,
  defaults: { theme: "auto" },
});

const aiSettings = createSettings(settings, config.app.id ?? "io.wess.narrative");
const stohr = createStohr(settings, config.app.id ?? "io.wess.narrative");

// --- vault selection ------------------------------------------------------
// The vault is a folder of Markdown files. The recents list (a plain
// `vaults.json`) drives which folder opens on launch; the rest is the
// in-app / menu switcher.

const recents = await loadRecents(join(paths(config.app).config, "vaults.json"));
const defaultVaultRoot = join(p.data, "vault");

const folderIsEmpty = async (path: string): Promise<boolean> => {
  try {
    return (await readdir(path)).filter((n) => !n.startsWith(".")).length === 0;
  } catch {
    return true;
  }
};

// Open a vault folder, remember it, and (for runtime switches) tell the
// webview to reload. Returns null when the folder can't be opened.
const openByPath = async (root: string, announce: boolean): Promise<VaultInfo | null> => {
  try {
    const vault = await openVault(root);
    await recents.remember(vault.root, vault.name);
    const info: VaultInfo = { root: vault.root, name: vault.name };
    if (announce) emit(ch.vaultChanged, info);
    return info;
  } catch (e) {
    console.error(`[Narrative] failed to open vault: ${root}`, e);
    return null;
  }
};

// Pick the vault to open on launch: last-used if it still exists, else the
// first surviving recent, else (truly fresh) a freshly seeded default vault.
const startupRoot = recents.last();
if (startupRoot && (await dirExists(startupRoot))) {
  await openByPath(startupRoot, false);
} else if (recents.list().length === 0) {
  await mkdir(defaultVaultRoot, { recursive: true });
  await seedVault(defaultVaultRoot);
  await openByPath(defaultVaultRoot, false);
} else {
  for (const entry of recents.list()) {
    if (await dirExists(entry.root)) {
      await openByPath(entry.root, false);
      break;
    }
  }
}
// If nothing opened, `currentVault()` stays null and the webview shows the
// vault picker.

// --- plugins --------------------------------------------------------------
// Community plugins live in `{data}/plugins/<id>/` — they're app-global,
// shared across every vault. The built-in sample plugin is seeded
// (and enabled) once, before the store is built.
const pluginsRoot = join(p.data, "plugins");
await mkdir(pluginsRoot, { recursive: true });
await seedSamplePlugin(pluginsRoot, join(paths(config.app).config, "plugins.json"));
const pluginPrefs = createStore("plugins", { app: config.app });
const pluginStore = createPluginStore(pluginsRoot, pluginPrefs);

const win = mainWindow({
  defaults: { width: 1340, height: 860, title: config.app.name },
  store: settings,
  storeKey: "window",
});

applyMenu(menu);

// Most handlers need the open vault. These helpers keep them terse and make
// "no vault open" a safe, explicit fallback rather than a thrown error.
const withDb = <T>(fn: (db: DB) => T, fallback: T): T => {
  const v = currentVault();
  return v ? fn(v.db) : fallback;
};
const withVault = async <T>(fn: (v: OpenVault) => T | Promise<T>, fallback: T): Promise<T> => {
  const v = currentVault();
  return v ? fn(v) : fallback;
};

// --- vault channels -------------------------------------------------------

handle(ch.vaultCurrent, () => {
  const v = currentVault();
  return v ? { root: v.root, name: v.name } : null;
});

handle(ch.vaultRecents, () => [...recents.list()]);

handle(ch.vaultOpen, ({ path }) => openByPath(path, true));

handle(ch.vaultCreate, async ({ path }) => {
  await mkdir(path, { recursive: true });
  if (await folderIsEmpty(path)) await seedVault(path);
  return openByPath(path, true);
});

handle(ch.vaultPick, async ({ mode }) => {
  const picked = await openFolder({
    title: mode === "create" ? "Choose a folder for the new vault" : "Open a vault folder",
  });
  if (!picked) return null;
  if (mode === "create" && (await folderIsEmpty(picked))) await seedVault(picked);
  return openByPath(picked, true);
});

handle(ch.vaultForget, async ({ root }) => {
  await recents.forget(root);
  return [...recents.list()];
});

// --- reads ----------------------------------------------------------------

handle(ch.getTree, () => withDb((db) => repo.buildTree(db), []));
handle(ch.getPage, ({ id }) => withDb((db) => repo.getPage(db, id), null));
handle(ch.pinnedPages, () => withDb((db) => repo.pinnedPages(db), []));
handle(ch.recentPages, () => withDb((db) => repo.recentPages(db), []));
handle(ch.archivedPages, () => withDb((db) => repo.archivedPages(db), []));
handle(ch.dailyPages, () => withDb((db) => repo.dailyPages(db), []));
handle(ch.templatePages, () => withDb((db) => repo.templatePages(db), []));
handle(ch.listTags, () => withDb((db) => rel.listTags(db), []));
handle(ch.tagPages, ({ tag }) => withDb((db) => rel.pagesWithTag(db, tag), []));
handle(ch.graphData, () => withDb((db) => rel.graphFor(db), { nodes: [], edges: [] }));
handle(ch.appStats, () =>
  withDb((db) => rel.statsFor(db), { pages: 0, words: 0, links: 0, tags: 0 }),
);

handle(ch.getBacklinks, ({ id }) =>
  withDb(
    (db) => {
      const page = repo.getPage(db, id);
      if (!page) return { linked: [], unlinked: [] };
      return rel.backlinksFor(db, id, page.title);
    },
    { linked: [], unlinked: [] },
  ),
);

handle(ch.getOutgoing, ({ id }) => withDb((db) => rel.outgoingFor(db, id), []));
handle(ch.pageByTitle, ({ title }) => withDb((db) => repo.findByTitle(db, title), null));
handle(ch.localGraph, ({ id }) =>
  withDb((db) => rel.localGraphFor(db, id), { nodes: [], edges: [] }),
);

handle(ch.searchPages, ({ query }) =>
  withDb((db) => {
    const hits: SearchHit[] = [];
    for (const hit of runSearch(db, query)) {
      const page = repo.getPage(db, hit.id);
      if (!page || page.archived) continue;
      hits.push({ id: page.id, title: page.title, icon: page.icon, snippet: hit.snippet });
    }
    return hits;
  }, []),
);

// --- mutations ------------------------------------------------------------

// Keep a file's embedding fresh — best-effort, never blocks the save.
const maybeEmbed = async (
  db: DB,
  page: { id: number; title: string; body: string },
): Promise<void> => {
  const cfg = await aiSettings.read();
  if (!cfg.semanticIndex) return;
  try {
    const provider = await buildProvider(aiSettings);
    await embedPage(db, provider, page);
  } catch {
    // embedding is an enhancement — a missing key or offline model is fine
  }
};

handle(ch.createPage, (input) =>
  withVault(async (v) => {
    const page = await repo.createPage(v, input);
    emit(ch.treeChanged, undefined);
    void maybeEmbed(v.db, page);
    return page;
  }, null),
);

handle(ch.createFolder, ({ parentId, title }) =>
  withVault(async (v) => {
    const folder = await repo.createFolder(v, parentId, title);
    emit(ch.treeChanged, undefined);
    return folder;
  }, null),
);

handle(ch.updatePage, (input) =>
  withVault(async (v) => {
    const page = await repo.updatePage(v, input);
    emit(ch.pageSaved, page);
    const structural =
      input.title !== undefined ||
      input.parentId !== undefined ||
      input.pinned !== undefined ||
      input.archived !== undefined ||
      input.icon !== undefined;
    if (structural) emit(ch.treeChanged, undefined);
    if (input.body !== undefined || input.title !== undefined) void maybeEmbed(v.db, page);
    return page;
  }, null),
);

handle(ch.deletePage, ({ id }) =>
  withVault(
    async (v) => {
      const result = await repo.deletePage(v, id);
      emit(ch.treeChanged, undefined);
      return result;
    },
    { id, removed: [] },
  ),
);

handle(ch.movePage, ({ id, parentId, sortKey }) =>
  withVault(async (v) => {
    const page = await repo.movePage(v, id, parentId, sortKey);
    emit(ch.treeChanged, undefined);
    return page;
  }, null),
);

handle(ch.resolveLink, ({ title }) =>
  withVault(async (v) => {
    const page = await repo.resolveByTitle(v, title);
    emit(ch.treeChanged, undefined);
    return page;
  }, null),
);

handle(ch.dailyNote, ({ date }) =>
  withVault(async (v) => {
    const page = await repo.resolveDaily(v, date);
    emit(ch.treeChanged, undefined);
    return page;
  }, null),
);

handle(ch.exportPage, ({ id }) =>
  withVault(
    async (v) => {
      const page = repo.getPage(v.db, id);
      if (!page) return { path: null };
      const path = await saveFile({
        title: "Export Page",
        defaultName: `${page.title || "Untitled"}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!path) return { path: null };
      const header = page.icon ? `${page.icon} ` : "";
      await Bun.write(path, `# ${header}${page.title}\n\n${page.body}\n`);
      return { path };
    },
    { path: null },
  ),
);

// --- settings + AI --------------------------------------------------------

handle(ch.getSettings, () => aiSettings.read());
handle(ch.setSettings, (patch) => aiSettings.update(patch));
handle(ch.setAiKey, async ({ provider, apiKey }) => {
  await aiSettings.setKey(provider, apiKey);
  return aiSettings.read();
});
handle(ch.clearAiKey, async ({ provider }) => {
  await aiSettings.clearKey(provider);
  return aiSettings.read();
});
handle(ch.setSemanticIndex, ({ enabled }) => aiSettings.update({ semanticIndex: enabled }));

const providerOrNull = async (): Promise<Provider | null> => {
  try {
    return await buildProvider(aiSettings);
  } catch {
    return null;
  }
};

const NO_EMBED = { indexed: 0, total: 0, supported: false };

handle(ch.embedStatus, async () => {
  const v = currentVault();
  if (!v) return NO_EMBED;
  return embeddingStatus(v.db, await providerOrNull());
});

handle(ch.reindexVault, async () => {
  const v = currentVault();
  if (!v) return { status: NO_EMBED, message: "No vault is open." };
  let provider: Provider;
  try {
    provider = await buildProvider(aiSettings);
  } catch (e) {
    return { status: embeddingStatus(v.db, null), message: (e as Error).message };
  }
  if (!provider.embed) {
    return {
      status: embeddingStatus(v.db, provider),
      message: `${provider.name} has no embeddings API — RAG will use keyword search.`,
    };
  }
  const indexed = await reindexAll(v.db, provider);
  return { status: embeddingStatus(v.db, provider), message: `Indexed ${indexed} pages.` };
});

// The standalone MCP server lives next to the host entry point.
handle(ch.mcpConfig, () => ({
  command: "bun",
  args: [join(dirname(import.meta.dir), "mcp.ts")],
}));

// --- Stohr ----------------------------------------------------------------

handle(ch.stohrStatus, () => stohr.status());
handle(ch.stohrConnectToken, ({ baseURL, token }) => stohr.connectToken(baseURL, token));
handle(ch.stohrConnectPassword, ({ baseURL, identity, password }) =>
  stohr.connectPassword(baseURL, identity, password),
);
handle(ch.stohrConnectMfa, ({ baseURL, mfaToken, code }) =>
  stohr.connectMfa(baseURL, mfaToken, code),
);
handle(ch.stohrDisconnect, () => stohr.disconnect());

// --- plugins --------------------------------------------------------------

registerPluginHandlers(pluginStore);

handle(ch.testAi, async () => {
  const { provider: id } = await aiSettings.read();
  let provider: Provider;
  try {
    provider = await buildProvider(aiSettings);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  try {
    await provider.chat({
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      maxTokens: 16,
    });
    return { ok: true, message: `Connected to ${PROVIDERS[id].label}.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
});

// Tracks in-flight streams so the webview can cancel them.
const aborts = new Map<string, AbortController>();

handle(ch.aiCancel, ({ requestId }) => {
  aborts.get(requestId)?.abort();
  aborts.delete(requestId);
});

handle(ch.aiChat, async ({ requestId, messages, pageId, useVault }): Promise<AiResult> => {
  let provider: Provider;
  try {
    provider = await buildProvider(aiSettings);
  } catch (e) {
    return { ok: false, content: "", error: (e as Error).message };
  }

  const vault = currentVault();
  let system = SYSTEM_PROMPT;
  if (pageId !== undefined && vault) {
    const page = repo.getPage(vault.db, pageId);
    if (page) {
      system += `\n\nThe user is currently viewing this page:\n\n# ${page.title}\n\n${page.body}`;
    }
  }

  // RAG: pull the most relevant pages for the latest question into context.
  if (useVault && vault) {
    const query = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    if (query) {
      const { pages, mode } = await retrieveContext(vault.db, provider, query, 5);
      if (pages.length > 0) {
        emit(ch.aiSources, { requestId, mode, titles: pages.map((page) => page.title) });
        system += `\n\nRelevant pages from the user's knowledge base (${mode} retrieval):\n\n${pages
          .map((page) => `## ${page.title}\n\n${page.body}`)
          .join("\n\n---\n\n")}`;
      }
    }
  }

  const controller = new AbortController();
  aborts.set(requestId, controller);
  let full = "";
  try {
    for await (const chunk of provider.chatStream({
      messages,
      system,
      signal: controller.signal,
    })) {
      if (chunk.delta) {
        full += chunk.delta;
        emit(ch.aiChunk, { requestId, delta: chunk.delta, done: false });
      }
      if (chunk.done) break;
    }
    emit(ch.aiChunk, { requestId, delta: "", done: true });
    return { ok: true, content: full };
  } catch (e) {
    emit(ch.aiChunk, { requestId, delta: "", done: true });
    return { ok: false, content: full, error: (e as Error).message };
  } finally {
    aborts.delete(requestId);
  }
});

handle(ch.aiSummarize, async ({ pageId }): Promise<AiResult> => {
  const vault = currentVault();
  const page = vault ? repo.getPage(vault.db, pageId) : null;
  if (!page) return { ok: false, content: "", error: "Page not found." };
  let provider: Provider;
  try {
    provider = await buildProvider(aiSettings);
  } catch (e) {
    return { ok: false, content: "", error: (e as Error).message };
  }
  try {
    const res = await provider.chat({
      system: "Summarise the user's note in 2-4 plain sentences. No preamble, no markdown.",
      messages: [{ role: "user", content: `# ${page.title}\n\n${page.body}` }],
      maxTokens: 400,
    });
    return { ok: true, content: res.content.trim() };
  } catch (e) {
    return { ok: false, content: "", error: (e as Error).message };
  }
});

// --- native menu ----------------------------------------------------------

onMenu("page:new", async () => {
  const v = currentVault();
  if (!v) return;
  const page = await repo.createPage(v, { title: "Untitled" });
  emit(ch.treeChanged, undefined);
  emit(ch.focusPage, { id: page.id });
});

onMenu("daily:new", async () => {
  const v = currentVault();
  if (!v) return;
  const today = new Date().toISOString().slice(0, 10);
  const page = await repo.resolveDaily(v, today);
  emit(ch.treeChanged, undefined);
  emit(ch.focusPage, { id: page.id });
});

onMenu("page:export", () => emit(ch.runCommand, "export"));
onMenu("view:search", () => emit(ch.runCommand, "search"));
onMenu("view:graph", () => emit(ch.runCommand, "graph"));
onMenu("view:tags", () => emit(ch.runCommand, "tags"));
onMenu("view:palette", () => emit(ch.runCommand, "palette"));
onMenu("theme:toggle", () => emit(ch.runCommand, "theme"));
onMenu("app:settings", () => emit(ch.runCommand, "settings"));
onMenu("view:ai", () => emit(ch.runCommand, "ai"));
onMenu("vault:open", () => emit(ch.runCommand, "vault-open"));
onMenu("vault:create", () => emit(ch.runCommand, "vault-create"));
onMenu("vault:switch", () => emit(ch.runCommand, "vault-switch"));

onMenu("app:quit", async () => {
  win.save();
  await closeVault();
  process.exit(0);
});

console.log(`[Narrative] ready — vault: ${currentVault()?.root ?? "(none — picker)"}`);
