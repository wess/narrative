import { Buffer } from "node:buffer";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Provider } from "@basket/ai";
import { defineConfig, ensurePaths, paths } from "@basket/config";
import type { DB } from "@basket/db";
import { openFile, openFolder, saveFile } from "@basket/dialog";
import { emit, handle } from "@basket/ipc";
import { applyMenu, onMenu } from "@basket/menu";
import { createStore } from "@basket/store";
import { mainWindow, setWindow } from "@basket/window";
import { version } from "../../package.json";
import * as ch from "../shared/channels.ts";
import { PROVIDERS } from "../shared/providers.ts";
import type {
  AgentDef,
  AgentImportResult,
  AiHealth,
  AiResult,
  ChannelDef,
  StohrSyncResult,
  VaultInfo,
} from "../shared/types.ts";
import {
  analyzeProject,
  buildKanbanPrompt,
  cancelProjectRun,
  changedProjectFiles,
  createAgent,
  createChannel,
  createCommand,
  createKanbanCard,
  createProject,
  createWorkflow,
  decideProjectWriteProposal,
  deleteAgent,
  deleteChannel,
  deleteCommand,
  deleteKanbanCard,
  deleteProject,
  deleteWorkflow,
  diffProjectFile,
  listAgents,
  listChannelMessages,
  listChannels,
  listCommands,
  listKanbanBoard,
  listProjectRuns,
  listProjects,
  listProjectWriteProposals,
  listWorkflowRuns,
  listWorkflows,
  moveKanbanCard,
  projectTree,
  readAgentSource,
  readChannelSource,
  readCommandSource,
  readProjectFile,
  recordChannelMessage,
  runAgent,
  runWorkflow,
  saveAgent,
  saveChannel,
  saveCommand,
  setProjectPermissions,
  suggestChannelForProject,
  updateKanbanCard,
  updateWorkflow,
} from "./agents/index.ts";
import {
  closeMemory,
  deleteMemory,
  listMemories,
  memoryContext,
  rememberTurn,
  setMemoryPinned,
} from "./agents/memory.ts";
import { listAgentRuns, recordAgentRun } from "./agents/timeline.ts";
import { buildProvider, SYSTEM_PROMPT } from "./ai.ts";
import { addCanvasNode, buildCanvasView, moveCanvasNode, removeCanvasNode } from "./canvas.ts";
import { captureWeb, listWebCaptures } from "./capture.ts";
import menu from "./menu.ts";
import * as repo from "./pages.ts";
import { createPluginStore, registerPluginHandlers } from "./plugins/index.ts";
import { seedSamplePlugin } from "./plugins/sample.ts";
import { buildBaseView } from "./properties.ts";
import { embeddingStatus, embedPage, reindexAll, retrieveContext } from "./rag.ts";
import * as rel from "./relations.ts";
import { runUnifiedSearch } from "./search.ts";
import { seedVault } from "./seed.ts";
import { createSettings } from "./settings.ts";
import { createStohr } from "./stohr/index.ts";
import { listToolDefs } from "./tools/index.ts";
import { createVaultBackup, restoreVaultBackup } from "./vault/backup.ts";
import { dirExists, writeAttachment } from "./vault/fileio.ts";
import { closeVault, currentVault, type OpenVault, openVault } from "./vault/index.ts";
import { loadRecents } from "./vault/recents.ts";
import { reconcilePaths } from "./vault/watch.ts";

const config = defineConfig({ app: { name: "Bethink", id: "io.wess.bethink" } });
const p = await ensurePaths(config.app);

const settings = createStore("settings", {
  app: config.app,
  defaults: { theme: "auto" },
});

const aiSettings = createSettings(settings, config.app.id ?? "io.wess.bethink");
const stohr = createStohr(settings, config.app.id ?? "io.wess.bethink");

// Reconcile the open vault with Stohr, then fold whatever changed on disk
// into the index. A no-op when no vault is open or Stohr isn't connected, so
// it's safe to fire on launch, on a vault switch, after connecting, and on a
// timer. Failures are reported, never thrown.
const runStohrSync = async (): Promise<StohrSyncResult> => {
  const v = currentVault();
  if (!v) {
    return {
      ok: false,
      pulled: 0,
      pushed: 0,
      deleted: 0,
      conflicts: [],
      error: "No vault is open.",
    };
  }
  const { result, changedPaths } = await stohr.sync(v);
  if (changedPaths.length > 0) await reconcilePaths(v, changedPaths);
  if (!result.ok && result.error && result.error !== "Not connected to Stohr.") {
    console.error(`[Bethink] Stohr sync failed: ${result.error}`);
  }
  return result;
};

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
    const previousRoot = currentVault()?.root;
    const vault = await openVault(root);
    if (previousRoot) closeMemory(previousRoot);
    await recents.remember(vault.root, vault.name);
    const info: VaultInfo = { root: vault.root, name: vault.name };
    if (announce) emit(ch.vaultChanged, info);
    // Pull in anything the connected Stohr account changed while this vault
    // was closed (and push anything that changed locally).
    void runStohrSync();
    return info;
  } catch (e) {
    console.error(`[Bethink] failed to open vault: ${root}`, e);
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

// Show the app version in the title bar, e.g. "Bethink v1.0.0". Overrides any
// restored title so it always reflects the running build. version is inlined
// from package.json at compile time.
setWindow({ title: `${config.app.name} v${version}` });

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

handle(ch.vaultBackup, () =>
  withVault(
    async (v) => {
      const path = await saveFile({
        title: "Back Up Vault",
        defaultName: `${v.name}bethinkbackup.json`,
        filters: [{ name: "Bethink Backup", extensions: ["json"] }],
      });
      if (!path) return { path: null, files: 0 };
      return createVaultBackup(v.root, path);
    },
    { path: null, files: 0 },
  ),
);

handle(ch.vaultRestore, async () => {
  const backup = await openFile({
    title: "Restore Bethink Backup",
    filters: [{ name: "Bethink Backup", extensions: ["json"] }],
  });
  if (!backup) return { root: null, files: 0, error: null };
  const folder = await openFolder({ title: "Choose Restore Folder" });
  if (!folder) return { root: null, files: 0, error: null };
  const result = await restoreVaultBackup(backup, folder);
  if (result.root) await openByPath(result.root, true);
  return result;
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
handle(ch.baseView, () =>
  withVault((vault) => buildBaseView(vault), {
    columns: [],
    rows: [],
    updatedAt: new Date().toISOString(),
  }),
);
handle(ch.canvasView, () =>
  withVault((vault) => buildCanvasView(vault), {
    nodes: [],
    edges: [],
    availableNodes: [],
    updatedAt: new Date().toISOString(),
  }),
);
handle(ch.canvasMove, ({ id, x, y }) =>
  withVault((vault) => moveCanvasNode(vault, id, x, y), {
    nodes: [],
    edges: [],
    availableNodes: [],
    updatedAt: new Date().toISOString(),
  }),
);
handle(ch.canvasAdd, ({ id }) =>
  withVault((vault) => addCanvasNode(vault, id), {
    nodes: [],
    edges: [],
    availableNodes: [],
    updatedAt: new Date().toISOString(),
  }),
);
handle(ch.canvasRemove, ({ id }) =>
  withVault((vault) => removeCanvasNode(vault, id), {
    nodes: [],
    edges: [],
    availableNodes: [],
    updatedAt: new Date().toISOString(),
  }),
);
handle(ch.webCapture, (input) => withVault((vault) => captureWeb(vault, input), null));
handle(ch.webCaptures, ({ limit }) =>
  withVault((vault) => listWebCaptures(vault.root, limit ?? 100), []),
);
handle(ch.agentRuns, ({ limit }) =>
  withVault((vault) => listAgentRuns(vault.root, limit ?? 50), []),
);
handle(ch.memoryList, ({ limit }) =>
  withVault((vault) => listMemories(vault.root, limit ?? 100), []),
);
handle(ch.memoryDelete, ({ id }) =>
  withVault(async (vault) => {
    await deleteMemory(vault.root, id);
    return listMemories(vault.root, 100);
  }, []),
);
handle(ch.memoryPin, ({ id, pinned }) =>
  withVault(async (vault) => {
    await setMemoryPinned(vault.root, id, pinned);
    return listMemories(vault.root, 100);
  }, []),
);
handle(ch.projectProposals, () => withVault((vault) => listProjectWriteProposals(vault.root), []));
handle(ch.projectProposalApprove, ({ id }) =>
  withVault((vault) => decideProjectWriteProposal(vault.root, id, true), []),
);
handle(ch.projectProposalReject, ({ id, comment }) =>
  withVault((vault) => decideProjectWriteProposal(vault.root, id, false, comment ?? ""), []),
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
  withVault((vault) => runUnifiedSearch(vault.root, vault.db, query), []),
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

// --- attachments ----------------------------------------------------------
// Pasted images become real files under the vault's `attachments/` folder.
// The webview can't load a vault path itself, so it reads bytes back here.

handle(ch.saveAttachment, ({ name, data }) =>
  withVault<{ path: string | null }>(
    async (v) => {
      const bytes = new Uint8Array(Buffer.from(data, "base64"));
      return { path: await writeAttachment(v.root, name, bytes) };
    },
    { path: null },
  ),
);

handle(ch.readAttachment, ({ path }) =>
  withVault<{ data: string; mime: string } | null>(async (v) => {
    // Confine reads to the vault — a path must never climb out of it.
    if (path.includes("..")) return null;
    const file = Bun.file(join(v.root, path));
    if (!(await file.exists())) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      data: Buffer.from(bytes).toString("base64"),
      mime: file.type || "application/octet-stream",
    };
  }, null),
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

handle(ch.stohrConnectToken, async ({ baseURL, token }) => {
  const result = await stohr.connectToken(baseURL, token);
  if (result.ok) void runStohrSync(); // first sync as soon as we're connected
  return result;
});

handle(ch.stohrConnectPassword, async ({ baseURL, identity, password }) => {
  const result = await stohr.connectPassword(baseURL, identity, password);
  if (result.ok) void runStohrSync();
  return result;
});

handle(ch.stohrConnectMfa, async ({ baseURL, mfaToken, code }) => {
  const result = await stohr.connectMfa(baseURL, mfaToken, code);
  if (result.ok) void runStohrSync();
  return result;
});

handle(ch.stohrDisconnect, () => stohr.disconnect());
handle(ch.stohrSync, () => runStohrSync());

// Keep a connected vault in step with Stohr in the background.
setInterval(() => void runStohrSync(), 2 * 60 * 1000);

// --- plugins --------------------------------------------------------------

registerPluginHandlers(pluginStore);

const readAiHealth = async (live = false): Promise<AiHealth> => {
  const config = await aiSettings.read();
  const preset = PROVIDERS[config.provider];
  const keyPresent = preset.usesKey ? Boolean(await aiSettings.getKey(config.provider)) : false;
  const configured =
    Boolean(config.baseURL) && Boolean(config.model) && (!preset.requiresKey || keyPresent);
  let chat: AiHealth["chat"] = {
    checked: false,
    ok: false,
    latencyMs: null,
    message: configured ? "Ready to test." : "Provider setup is incomplete.",
  };
  let embeddings = {
    supported: Boolean(preset.defaultEmbedModel),
    model: preset.defaultEmbedModel ?? null,
  };

  if (!live) {
    return {
      provider: config.provider,
      label: preset.label,
      protocol: preset.protocol,
      model: config.model,
      baseURL: config.baseURL,
      keyRequired: preset.requiresKey,
      keyPresent,
      configured,
      chat,
      embeddings,
    };
  }

  const started = Date.now();
  let provider: Provider | null = null;
  try {
    provider = await buildProvider(aiSettings);
  } catch (e) {
    chat = { checked: true, ok: false, latencyMs: null, message: (e as Error).message };
  }
  if (provider) {
    embeddings = {
      supported: Boolean(provider.embed),
      model: preset.defaultEmbedModel ?? null,
    };
    try {
      await provider.chat({
        messages: [{ role: "user", content: "Reply with the single word: ready" }],
        maxTokens: 16,
      });
      chat = {
        checked: true,
        ok: true,
        latencyMs: Date.now() - started,
        message: `Connected to ${preset.label}.`,
      };
    } catch (e) {
      chat = {
        checked: true,
        ok: false,
        latencyMs: Date.now() - started,
        message: (e as Error).message,
      };
    }
  }

  return {
    provider: config.provider,
    label: preset.label,
    protocol: preset.protocol,
    model: config.model,
    baseURL: config.baseURL,
    keyRequired: preset.requiresKey,
    keyPresent,
    configured,
    chat,
    embeddings,
  };
};

handle(ch.aiHealth, ({ live }) => readAiHealth(Boolean(live)));

handle(ch.testAi, async () => {
  const health = await readAiHealth(true);
  return { ok: health.chat.ok, message: health.chat.message };
});

// Tracks in-flight streams so the webview can cancel them.
const aborts = new Map<string, AbortController>();

handle(ch.aiCancel, ({ requestId }) => {
  aborts.get(requestId)?.abort();
  aborts.delete(requestId);
});

handle(
  ch.aiChat,
  async ({ requestId, messages, pageId, useVault, agentSlug, channelSlug }): Promise<AiResult> => {
    const vault = currentVault();

    // Resolve the requested agent up front so we can honour its `provider` /
    // `model` overrides when building the live provider for this turn.
    const agents = vault ? await listAgents(vault.root) : [];
    const agent = agentSlug ? (agents.find((a) => a.slug === agentSlug) ?? null) : null;
    const channels = vault ? await listChannels(vault.root) : [];
    const channel = channelSlug ? (channels.find((c) => c.slug === channelSlug) ?? null) : null;
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    let provider: Provider;
    try {
      provider = await buildProvider(aiSettings, {
        provider: agent?.provider ?? undefined,
        model: agent?.model ?? undefined,
      });
    } catch (e) {
      return { ok: false, content: "", error: (e as Error).message };
    }
    const runtimeSettings = await aiSettings.read();

    // Page context and RAG context are appended whether or not an agent is
    // chosen — the chat surface controls those toggles independently.
    let contextSystem = "";
    if (channel) {
      const members = channel.agents
        .map((slug) => agents.find((a) => a.slug === slug)?.name ?? slug)
        .join(", ");
      const projects = vault
        ? (await listProjects(vault.root)).filter((project) =>
            channel.projects.includes(project.slug),
          )
        : [];
      contextSystem += [
        `Active channel: ${channel.name}`,
        channel.description ? `Description: ${channel.description}` : "",
        channel.brief ? `Brief:\n${channel.brief}` : "",
        `Routing mode: ${channel.mode}`,
        members ? `Member agents: ${members}` : "",
        projects.length > 0
          ? `Linked projects:\n${projects.map((project) => `- ${project.name}: ${project.path}`).join("\n")}`
          : "",
        channel.context.length > 0 ? `Declared context: ${channel.context.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (pageId !== undefined && vault) {
      const page = repo.getPage(vault.db, pageId);
      if (page) {
        contextSystem += `The user is currently viewing this page:\n\n# ${page.title}\n\n${page.body}`;
      }
    }
    if (useVault && vault) {
      const query = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      if (query) {
        const { pages, mode } = await retrieveContext(vault.db, provider, query, 5);
        if (pages.length > 0) {
          emit(ch.aiSources, { requestId, mode, titles: pages.map((page) => page.title) });
          contextSystem += `${contextSystem ? "\n\n" : ""}Relevant pages from the user's knowledge base (${mode} retrieval):\n\n${pages
            .map((page) => `## ${page.title}\n\n${page.body}`)
            .join("\n\n---\n\n")}`;
        }
      }
    }
    if (vault) {
      const remembered = await memoryContext(vault.root, {
        channelSlug: channel?.slug,
        agentSlug: agent?.slug,
      });
      if (remembered) contextSystem += `${contextSystem ? "\n\n" : ""}${remembered}`;
    }

    const controller = new AbortController();
    aborts.set(requestId, controller);
    let full = "";
    const started = Date.now();
    try {
      // With an agent, run the streaming tool-call loop; without one, fall
      // back to the original plain-chat stream so the assistant still works
      // before the user has authored any agents.
      let result: AiResult;
      if (agent && vault) {
        result = await runAgent({
          provider,
          ctx: {
            vault,
            provider,
            requestId,
            projectWrite: runtimeSettings.projectWrite,
            emitFocus: (id) => emit(ch.focusPage, { id }),
          },
          agent,
          messages,
          contextSystem,
          signal: controller.signal,
        });
      } else {
        const system = contextSystem ? `${SYSTEM_PROMPT}\n\n${contextSystem}` : SYSTEM_PROMPT;
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
        result = { ok: true, content: full };
      }
      if (vault && channel && lastUser) {
        await recordChannelMessage(vault.root, {
          channelSlug: channel.slug,
          agentSlug: agent?.slug,
          role: "user",
          content: lastUser,
        });
        await recordChannelMessage(vault.root, {
          channelSlug: channel.slug,
          agentSlug: agent?.slug,
          role: "assistant",
          content: result.content || result.error || "",
          toolCalls: result.toolCalls,
        });
      }
      if (vault && lastUser && result.content.trim()) {
        await rememberTurn(vault.root, {
          channelSlug: channel?.slug,
          agentSlug: agent?.slug,
          user: lastUser,
          assistant: result.content,
        });
      }
      if (vault) {
        await recordAgentRun(vault.root, {
          requestId,
          agentSlug: agent?.slug,
          channelSlug: channel?.slug,
          userPrompt: lastUser,
          status:
            result.stopReason === "maxiterations" ? "maxiterations" : result.ok ? "ok" : "error",
          content: result.content,
          error: result.error,
          toolCalls: result.toolCalls,
          stopReason: result.stopReason,
          iterations: result.iterations,
          durationMs: Date.now() - started,
        });
      }
      return result;
    } catch (e) {
      emit(ch.aiChunk, { requestId, delta: "", done: true });
      if (vault && channel && lastUser) {
        await recordChannelMessage(vault.root, {
          channelSlug: channel.slug,
          agentSlug: agent?.slug,
          role: "user",
          content: lastUser,
        });
        await recordChannelMessage(vault.root, {
          channelSlug: channel.slug,
          agentSlug: agent?.slug,
          role: "assistant",
          content: full || (e as Error).message,
        });
      }
      if (vault) {
        await recordAgentRun(vault.root, {
          requestId,
          agentSlug: agent?.slug,
          channelSlug: channel?.slug,
          userPrompt: lastUser,
          status: controller.signal.aborted ? "cancelled" : "error",
          content: full,
          error: (e as Error).message,
          stopReason: controller.signal.aborted ? "cancelled" : "error",
          durationMs: Date.now() - started,
        });
      }
      return { ok: false, content: full, error: (e as Error).message };
    } finally {
      aborts.delete(requestId);
    }
  },
);

// --- agent IDE ------------------------------------------------------------
// Native agents, channels, and commands live in `.narrative/` inside the open vault —
// invisible to the page tree
// (scanner ignores dotfolders), but they travel with the vault.

handle(ch.agentList, () => withVault((v) => listAgents(v.root), []));
handle(ch.channelList, () => withVault((v) => listChannels(v.root), []));
handle(ch.channelMessages, ({ slug, limit }) =>
  withVault((v) => listChannelMessages(v.root, slug, limit ?? 60), []),
);
handle(ch.commandList, () => withVault((v) => listCommands(v.root), []));
handle(ch.toolList, () => listToolDefs());
handle(ch.projectList, () => withVault((v) => listProjects(v.root), []));

type AgentExportBundle = {
  readonly app: "bethink";
  readonly version: 1;
  readonly kind: "agent" | "channel";
  readonly exportedAt: string;
  readonly agents: readonly AgentDef[];
  readonly channels: readonly ChannelDef[];
};

const yamlValue = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const yamlList = (values: readonly string[]): string =>
  values.length > 0 ? values.map((value) => `  - ${value}`).join("\n") : "";

const agentExportSource = (agent: AgentDef): string =>
  `${[
    "---",
    `name: ${yamlValue(agent.name)}`,
    `description: ${yamlValue(agent.description)}`,
    `icon: ${yamlValue(agent.icon)}`,
    agent.provider ? `provider: ${agent.provider}` : "",
    agent.model ? `model: ${yamlValue(agent.model)}` : "",
    "tools:",
    yamlList(agent.tools),
    "---",
    agent.systemPrompt,
  ]
    .filter((line) => line !== "")
    .join("\n")
    .trimEnd()}\n`;

const channelExportSource = (
  channel: ChannelDef,
  agentSlugMap: ReadonlyMap<string, string> = new Map(),
): string => {
  const agents = channel.agents.map((slug) => agentSlugMap.get(slug) ?? slug);
  return `${[
    "---",
    `name: ${yamlValue(channel.name)}`,
    `description: ${yamlValue(channel.description)}`,
    `icon: ${yamlValue(channel.icon)}`,
    `mode: ${channel.mode}`,
    "agents:",
    yamlList(agents),
    "projects:",
    yamlList(channel.projects),
    "context:",
    yamlList(channel.context),
    "---",
    channel.brief,
  ]
    .filter((line) => line !== "")
    .join("\n")
    .trimEnd()}\n`;
};

const exportBundle = async (
  bundle: AgentExportBundle,
  defaultName: string,
): Promise<{ path: string | null }> => {
  const path = await saveFile({
    title: bundle.kind === "agent" ? "Export Agent" : "Export Channel",
    defaultName,
    filters: [{ name: "Bethink JSON", extensions: ["json"] }],
  });
  if (!path) return { path: null };
  await Bun.write(path, `${JSON.stringify(bundle, null, 2)}\n`);
  return { path };
};

const isAgentDef = (value: unknown): value is AgentDef => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AgentDef>;
  return (
    typeof item.slug === "string" &&
    typeof item.name === "string" &&
    typeof item.description === "string" &&
    typeof item.icon === "string" &&
    Array.isArray(item.tools) &&
    typeof item.systemPrompt === "string"
  );
};

const isChannelDef = (value: unknown): value is ChannelDef => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ChannelDef>;
  return (
    typeof item.slug === "string" &&
    typeof item.name === "string" &&
    typeof item.description === "string" &&
    typeof item.icon === "string" &&
    typeof item.mode === "string" &&
    Array.isArray(item.agents) &&
    Array.isArray(item.projects) &&
    Array.isArray(item.context) &&
    typeof item.brief === "string"
  );
};

const parseAgentBundle = (raw: unknown): Pick<AgentExportBundle, "agents" | "channels"> => {
  if (!raw || typeof raw !== "object") return { agents: [], channels: [] };
  const bundle = raw as { agents?: unknown; channels?: unknown };
  return {
    agents: Array.isArray(bundle.agents) ? bundle.agents.filter(isAgentDef) : [],
    channels: Array.isArray(bundle.channels) ? bundle.channels.filter(isChannelDef) : [],
  };
};

const importAgentBundle = async (vaultRoot: string): Promise<AgentImportResult> => {
  const path = await openFile({
    title: "Import Agents or Channels",
    filters: [{ name: "Bethink JSON", extensions: ["json"] }],
  });
  if (!path) return { importedAgents: 0, importedChannels: 0, skipped: 0 };
  const raw = await Bun.file(path)
    .json()
    .catch(() => null);
  const bundle = parseAgentBundle(raw);
  const slugMap = new Map<string, string>();
  let importedAgents = 0;
  let importedChannels = 0;

  for (const agent of bundle.agents) {
    const created = await createAgent(vaultRoot, agent.name);
    if (!created) continue;
    const saved = await saveAgent(vaultRoot, created.slug, agentExportSource(agent));
    if (saved) {
      slugMap.set(agent.slug, saved.slug);
      importedAgents++;
    }
  }

  for (const channel of bundle.channels) {
    const created = await createChannel(vaultRoot, channel.name);
    if (!created) continue;
    const saved = await saveChannel(vaultRoot, created.slug, channelExportSource(channel, slugMap));
    if (saved) importedChannels++;
  }

  return {
    importedAgents,
    importedChannels,
    skipped: bundle.agents.length + bundle.channels.length - importedAgents - importedChannels,
  };
};
handle(ch.projectTree, ({ slug }) => withVault((v) => projectTree(v.root, slug), null));
handle(ch.projectRead, ({ slug, path }) =>
  withVault((v) => readProjectFile(v.root, slug, path), null),
);
handle(ch.projectChanged, ({ slug }) => withVault((v) => changedProjectFiles(v.root, slug), []));
handle(ch.projectDiff, ({ slug, path }) =>
  withVault((v) => diffProjectFile(v.root, slug, path), null),
);
handle(ch.projectRuns, ({ slug }) => withVault((v) => listProjectRuns(v.root, slug), []));
handle(ch.projectRunCancel, ({ id, slug }) =>
  withVault(async (v) => {
    await cancelProjectRun(v.root, id);
    return listProjectRuns(v.root, slug);
  }, []),
);
handle(ch.projectAnalyze, ({ slug }) => withVault((v) => analyzeProject(v.root, slug), null));

handle(ch.projectPick, async () =>
  withVault(async (v) => {
    const path = await openFolder({ title: "Add Project Folder" });
    if (!path) return null;
    return createProject(v.root, path);
  }, null),
);

handle(ch.projectDelete, ({ slug }) =>
  withVault(async (v) => {
    await deleteProject(v.root, slug);
    emit(ch.agentsChanged, undefined);
  }, undefined),
);

handle(ch.projectPermissions, ({ slug, allowRead, allowWrite, allowRun }) =>
  withVault(async (v) => {
    const project = await setProjectPermissions(v.root, slug, { allowRead, allowWrite, allowRun });
    if (project) emit(ch.agentsChanged, undefined);
    return project;
  }, null),
);

handle(ch.projectSuggestChannel, ({ slug }) =>
  withVault(async (v) => {
    const result = await suggestChannelForProject(v.root, slug);
    if (result) emit(ch.agentsChanged, undefined);
    return result;
  }, null),
);

handle(ch.kanbanBoard, ({ projectSlug, channelSlug }) =>
  withVault((v) => listKanbanBoard(v.root, { projectSlug, channelSlug }), {
    projectSlug: projectSlug ?? null,
    channelSlug: channelSlug ?? null,
    columns: ["backlog", "ready", "doing", "review", "done"],
    cards: [],
  }),
);

handle(ch.kanbanCreate, (input) => withVault((v) => createKanbanCard(v.root, input), null));

handle(ch.kanbanUpdate, ({ id, ...patch }) =>
  withVault((v) => updateKanbanCard(v.root, id, patch), null),
);

handle(ch.kanbanMove, ({ id, status, sortKey }) =>
  withVault((v) => moveKanbanCard(v.root, id, status, sortKey), null),
);

handle(ch.kanbanDelete, ({ id }) =>
  withVault((v) => deleteKanbanCard(v.root, id), {
    projectSlug: null,
    channelSlug: null,
    columns: ["backlog", "ready", "doing", "review", "done"],
    cards: [],
  }),
);

handle(ch.kanbanPrompt, ({ id }) => withVault((v) => buildKanbanPrompt(v.root, id), null));

handle(ch.workflowList, () => withVault((v) => listWorkflows(v.root), []));

handle(ch.workflowCreate, (input) => withVault((v) => createWorkflow(v.root, input), null));

handle(ch.workflowUpdate, ({ slug, ...patch }) =>
  withVault((v) => updateWorkflow(v.root, slug, patch), null),
);

handle(ch.workflowDelete, ({ slug }) => withVault((v) => deleteWorkflow(v.root, slug), []));

handle(ch.workflowRun, ({ slug, triggerKind, input }) =>
  withVault((v) => runWorkflow(v.root, slug, triggerKind, input), null),
);

handle(ch.workflowRuns, ({ slug, limit }) =>
  withVault((v) => listWorkflowRuns(v.root, slug, limit), []),
);

handle(ch.agentCreate, ({ name }) =>
  withVault(async (v) => {
    const agent = await createAgent(v.root, name);
    if (agent) emit(ch.agentsChanged, undefined);
    return agent;
  }, null),
);

handle(ch.channelCreate, ({ name }) =>
  withVault(async (v) => {
    const channel = await createChannel(v.root, name);
    if (channel) emit(ch.agentsChanged, undefined);
    return channel;
  }, null),
);

handle(ch.commandCreate, ({ name }) =>
  withVault(async (v) => {
    const command = await createCommand(v.root, name);
    if (command) emit(ch.agentsChanged, undefined);
    return command;
  }, null),
);

handle(ch.agentExport, ({ slug }) =>
  withVault(
    async (v) => {
      const agent = (await listAgents(v.root)).find((item) => item.slug === slug);
      if (!agent) return { path: null };
      return exportBundle(
        {
          app: "bethink",
          version: 1,
          kind: "agent",
          exportedAt: new Date().toISOString(),
          agents: [agent],
          channels: [],
        },
        `${agent.slug}agent.json`,
      );
    },
    { path: null },
  ),
);

handle(ch.channelExport, ({ slug }) =>
  withVault(
    async (v) => {
      const channel = (await listChannels(v.root)).find((item) => item.slug === slug);
      if (!channel) return { path: null };
      const agents = (await listAgents(v.root)).filter((agent) =>
        channel.agents.includes(agent.slug),
      );
      return exportBundle(
        {
          app: "bethink",
          version: 1,
          kind: "channel",
          exportedAt: new Date().toISOString(),
          agents,
          channels: [channel],
        },
        `${channel.slug}channel.json`,
      );
    },
    { path: null },
  ),
);

handle(ch.agentImport, () =>
  withVault(
    async (v) => {
      const result = await importAgentBundle(v.root);
      if (result.importedAgents > 0 || result.importedChannels > 0)
        emit(ch.agentsChanged, undefined);
      return result;
    },
    { importedAgents: 0, importedChannels: 0, skipped: 0 },
  ),
);

handle(ch.agentSource, ({ slug }) => withVault((v) => readAgentSource(v.root, slug), null));

handle(ch.channelSource, ({ slug }) => withVault((v) => readChannelSource(v.root, slug), null));

handle(ch.commandSource, ({ slug }) => withVault((v) => readCommandSource(v.root, slug), null));

handle(ch.agentSave, ({ slug, body }) =>
  withVault(async (v) => {
    const agent = await saveAgent(v.root, slug, body);
    if (agent) emit(ch.agentsChanged, undefined);
    return agent;
  }, null),
);

handle(ch.channelSave, ({ slug, body }) =>
  withVault(async (v) => {
    const channel = await saveChannel(v.root, slug, body);
    if (channel) emit(ch.agentsChanged, undefined);
    return channel;
  }, null),
);

handle(ch.commandSave, ({ slug, body }) =>
  withVault(async (v) => {
    const command = await saveCommand(v.root, slug, body);
    if (command) emit(ch.agentsChanged, undefined);
    return command;
  }, null),
);

handle(ch.agentDelete, ({ slug }) =>
  withVault(async (v) => {
    await deleteAgent(v.root, slug);
    emit(ch.agentsChanged, undefined);
  }, undefined),
);

handle(ch.channelDelete, ({ slug }) =>
  withVault(async (v) => {
    await deleteChannel(v.root, slug);
    emit(ch.agentsChanged, undefined);
  }, undefined),
);

handle(ch.commandDelete, ({ slug }) =>
  withVault(async (v) => {
    await deleteCommand(v.root, slug);
    emit(ch.agentsChanged, undefined);
  }, undefined),
);

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
  const vault = currentVault();
  if (vault) closeMemory(vault.root);
  await closeVault();
  process.exit(0);
});

console.log(`[Bethink] ready — vault: ${currentVault()?.root ?? "(none — picker)"}`);
