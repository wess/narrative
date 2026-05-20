import { invoke } from "@basket/ipc/client";
import { toast } from "@basket/ui/toast";
import * as ch from "../../shared/channels.ts";
import type { AiProvider, ChatMessage, StohrConnectResult, VaultInfo } from "../../shared/types.ts";
import { copyText } from "../lib/clipboard.ts";
import { flattenTree } from "../lib/tree.ts";
import { getState, setState, type Theme, type View, writePref } from "./store.ts";

const ancestorsOf = (id: number): number[] => {
  const all = flattenTree(getState().tree);
  const byId = new Map(all.map((n) => [n.id, n]));
  const path: number[] = [];
  let current = byId.get(id);
  while (current?.parentId != null) {
    path.push(current.parentId);
    current = byId.get(current.parentId);
  }
  return path;
};

const refreshTree = async (): Promise<void> => {
  const [tree, pinned, recents, dailies, templates, tags, stats] = await Promise.all([
    invoke(ch.getTree, undefined),
    invoke(ch.pinnedPages, undefined),
    invoke(ch.recentPages, undefined),
    invoke(ch.dailyPages, undefined),
    invoke(ch.templatePages, undefined),
    invoke(ch.listTags, undefined),
    invoke(ch.appStats, undefined),
  ]);
  setState({ tree, pinned, recents, dailies, templates, tags, stats });
};

export const actions = {
  refreshTree,

  init: async (): Promise<void> => {
    const vault = await invoke(ch.vaultCurrent, undefined);
    if (!vault) {
      // No vault open — surface the picker; don't try to load a tree.
      const vaultRecents = await invoke(ch.vaultRecents, undefined);
      setState({ vault: null, vaultRecents, loading: false });
      return;
    }
    const vaultRecents = await invoke(ch.vaultRecents, undefined);
    setState({ vault, vaultRecents });
    await refreshTree();
    void actions.loadSettings();
    const { tree, activeId } = getState();
    // Open the first *file* — folders aren't editable pages.
    const firstFile = flattenTree(tree).find((n) => n.kind === "file");
    const target = activeId ?? firstFile?.id;
    if (target !== undefined) await actions.openPage(target);
  },

  // --- vault management --------------------------------------------------

  // Wipe per-vault state and re-initialise against the (new) open vault.
  afterVaultChange: async (vault: VaultInfo): Promise<void> => {
    setState({
      vault,
      tree: [],
      pinned: [],
      recents: [],
      dailies: [],
      templates: [],
      tags: [],
      stats: null,
      expanded: [],
      renamingId: null,
      activeId: null,
      activePage: null,
      tabs: [],
      splitId: null,
      history: [],
      historyAt: -1,
      backlinks: { linked: [], unlinked: [] },
      outgoing: [],
      view: "editor",
      search: { query: "", hits: [] },
      loading: false,
    });
    await actions.init();
  },

  // Re-sync after the host announces a vault change (menu / external switch).
  reloadVault: async (): Promise<void> => {
    const vault = await invoke(ch.vaultCurrent, undefined);
    if (vault) {
      await actions.afterVaultChange(vault);
    } else {
      const vaultRecents = await invoke(ch.vaultRecents, undefined);
      setState({ vault: null, vaultRecents, tree: [], activeId: null, activePage: null });
    }
  },

  openVault: async (path: string): Promise<void> => {
    const vault = await invoke(ch.vaultOpen, { path });
    if (vault) await actions.afterVaultChange(vault);
    else toast.error("Couldn't open that folder as a vault.");
  },

  // Open the OS folder picker on the host, then open / create the vault.
  pickVault: async (mode: "open" | "create"): Promise<void> => {
    const vault = await invoke(ch.vaultPick, { mode });
    if (vault) await actions.afterVaultChange(vault);
  },

  forgetVault: async (root: string): Promise<void> => {
    const vaultRecents = await invoke(ch.vaultForget, { root });
    setState({ vaultRecents });
  },

  openPage: async (id: number, opts?: { history?: boolean }): Promise<void> => {
    // Folders aren't editable pages — opening one just toggles it expanded.
    const node = flattenTree(getState().tree).find((n) => n.id === id);
    if (node?.kind === "folder") {
      actions.toggleExpanded(id);
      return;
    }
    // Record navigation history unless this open *is* a history move.
    if (opts?.history !== false) {
      setState((s) => {
        const trail = s.history.slice(0, s.historyAt + 1);
        if (trail[trail.length - 1] === id) return {};
        const history = [...trail, id].slice(-120);
        return { history, historyAt: history.length - 1 };
      });
    }
    setState((s) => ({
      tabs: s.tabs.includes(id) ? s.tabs : [...s.tabs, id].slice(-12),
    }));
    setState({ activeId: id, view: "editor", loading: true });
    const [page, backlinks, outgoing] = await Promise.all([
      invoke(ch.getPage, { id }),
      invoke(ch.getBacklinks, { id }),
      invoke(ch.getOutgoing, { id }),
    ]);
    if (!page) {
      setState({ loading: false, activePage: null });
      return;
    }
    // expand the tree down to the opened page
    const expanded = new Set(getState().expanded);
    for (const a of ancestorsOf(id)) expanded.add(a);
    const expandedArr = [...expanded];
    writePref("expanded", expandedArr);
    setState({ activePage: page, backlinks, outgoing, loading: false, expanded: expandedArr });
  },

  goBack: async (): Promise<void> => {
    const { history, historyAt } = getState();
    const target = historyAt > 0 ? history[historyAt - 1] : undefined;
    if (target === undefined) return;
    setState({ historyAt: historyAt - 1 });
    await actions.openPage(target, { history: false });
  },

  goForward: async (): Promise<void> => {
    const { history, historyAt } = getState();
    const target = historyAt < history.length - 1 ? history[historyAt + 1] : undefined;
    if (target === undefined) return;
    setState({ historyAt: historyAt + 1 });
    await actions.openPage(target, { history: false });
  },

  // Navigate a `[[Page#Heading]]` wiki link — open the page, then scroll.
  openWikilink: async (title: string, anchor: string | null): Promise<void> => {
    if (title) {
      const page = await invoke(ch.resolveLink, { title });
      if (page) {
        await refreshTree();
        await actions.openPage(page.id);
      }
    }
    if (anchor) setState({ pendingScroll: anchor });
  },

  consumeScroll: (): void => setState({ pendingScroll: null }),

  reloadBacklinks: async (id: number): Promise<void> => {
    const [backlinks, outgoing] = await Promise.all([
      invoke(ch.getBacklinks, { id }),
      invoke(ch.getOutgoing, { id }),
    ]);
    if (getState().activeId === id) setState({ backlinks, outgoing });
  },

  createPage: async (parentId: number | null = null): Promise<void> => {
    const page = await invoke(ch.createPage, { title: "Untitled", parentId });
    if (!page) return;
    await refreshTree();
    if (parentId !== null) {
      const expanded = new Set(getState().expanded).add(parentId);
      setState({ expanded: [...expanded] });
    }
    await actions.openPage(page.id);
  },

  // Create a real folder in the vault, expand it, and rename it inline.
  createFolder: async (parentId: number | null = null): Promise<void> => {
    const folder = await invoke(ch.createFolder, { parentId, title: "New Folder" });
    if (!folder) return;
    await refreshTree();
    const expanded = new Set(getState().expanded);
    if (parentId !== null) expanded.add(parentId);
    expanded.add(folder.id);
    setState({ expanded: [...expanded], renamingId: folder.id });
  },

  // --- inline rename -----------------------------------------------------

  startRename: (id: number): void => setState({ renamingId: id }),
  cancelRename: (): void => setState({ renamingId: null }),

  finishRename: async (id: number, title: string): Promise<void> => {
    setState({ renamingId: null });
    const trimmed = title.trim();
    if (!trimmed) return;
    await invoke(ch.updatePage, { id, title: trimmed });
    await refreshTree();
    if (getState().activeId === id) {
      const page = await invoke(ch.getPage, { id });
      if (page) setState({ activePage: page });
    }
  },

  createDaily: async (): Promise<void> => {
    const date = new Date().toISOString().slice(0, 10);
    const page = await invoke(ch.dailyNote, { date });
    if (!page) return;
    await refreshTree();
    await actions.openPage(page.id);
  },

  savePage: async (patch: {
    id: number;
    title?: string;
    body?: string;
    icon?: string;
    pinned?: boolean;
    archived?: boolean;
  }): Promise<void> => {
    const page = await invoke(ch.updatePage, patch);
    if (getState().activeId === page.id) setState({ activePage: page });
    const structural =
      patch.title !== undefined ||
      patch.pinned !== undefined ||
      patch.archived !== undefined ||
      patch.icon !== undefined;
    if (structural) await refreshTree();
    if (patch.body !== undefined) await actions.reloadBacklinks(page.id);
  },

  togglePin: async (id: number, pinned: boolean): Promise<void> => {
    await actions.savePage({ id, pinned });
    toast.success(pinned ? "Pinned" : "Unpinned");
  },

  archivePage: async (id: number, archived: boolean): Promise<void> => {
    await actions.savePage({ id, archived });
    if (archived && getState().activeId === id) {
      const next = getState().tree[0]?.id;
      if (next !== undefined) await actions.openPage(next);
      else setState({ activeId: null, activePage: null });
    }
    toast.success(archived ? "Moved to archive" : "Restored");
  },

  deletePage: async (id: number): Promise<void> => {
    const result = await invoke(ch.deletePage, { id });
    await refreshTree();
    if (result.removed.includes(getState().activeId ?? -1)) {
      const next = getState().tree[0]?.id;
      if (next !== undefined) await actions.openPage(next);
      else setState({ activeId: null, activePage: null });
    }
    toast.success("Page deleted");
  },

  movePage: async (id: number, parentId: number | null, sortKey: number): Promise<void> => {
    await invoke(ch.movePage, { id, parentId, sortKey });
    await refreshTree();
  },

  duplicatePage: async (id: number): Promise<void> => {
    const page = await invoke(ch.getPage, { id });
    if (!page || page.kind === "folder") return;
    const copy = await invoke(ch.createPage, {
      title: `${page.title || "Untitled"} (copy)`,
      parentId: page.parentId,
      body: page.body,
      icon: page.icon,
    });
    if (!copy) return;
    await refreshTree();
    await actions.openPage(copy.id);
    toast.success("Page duplicated");
  },

  copyLink: async (title: string): Promise<void> => {
    const ok = await copyText(`[[${title}]]`);
    if (ok) toast.success("Link copied", { description: `[[${title}]]` });
    else toast.error("Couldn't copy link");
  },

  copyMcpConfig: async (): Promise<void> => {
    const mcp = getState().mcpConfig;
    if (!mcp) return;
    const snippet = JSON.stringify(
      { mcpServers: { narrative: { command: mcp.command, args: mcp.args } } },
      null,
      2,
    );
    const ok = await copyText(snippet);
    if (ok) toast.success("MCP config copied");
    else toast.error("Couldn't copy");
  },

  resolveWikilink: async (title: string): Promise<void> => {
    const page = await invoke(ch.resolveLink, { title });
    if (!page) return;
    await refreshTree();
    await actions.openPage(page.id);
  },

  runSearch: async (query: string): Promise<void> => {
    const trimmed = query.trim();
    if (!trimmed) {
      setState({ search: { query, hits: [] } });
      return;
    }
    const hits = await invoke(ch.searchPages, { query: trimmed });
    setState({ search: { query, hits } });
  },

  openSearch: (): void => setState({ view: "search" }),

  openTag: async (tag: string): Promise<void> => {
    const pages = await invoke(ch.tagPages, { tag });
    setState({ view: "tags", tagFilter: { tag, pages } });
  },

  openGraph: async (): Promise<void> => {
    setState({ view: "graph", loading: true });
    const { graphMode, activeId } = getState();
    const graph =
      graphMode === "local" && activeId !== null
        ? await invoke(ch.localGraph, { id: activeId })
        : await invoke(ch.graphData, undefined);
    setState({ graph, loading: false });
  },

  setGraphMode: async (graphMode: "global" | "local"): Promise<void> => {
    setState({ graphMode });
    await actions.openGraph();
  },

  exportPageById: async (id: number): Promise<void> => {
    const { path } = await invoke(ch.exportPage, { id });
    if (path) toast.success("Exported", { description: path });
  },

  exportActive: async (): Promise<void> => {
    const id = getState().activeId;
    if (id === null) {
      toast.error("No page open");
      return;
    }
    await actions.exportPageById(id);
  },

  setView: (view: View): void => setState({ view }),

  cycleTheme: (): void => {
    const order: Theme[] = ["light", "dark", "auto"];
    const current = getState().theme;
    const next = order[(order.indexOf(current) + 1) % order.length] ?? "auto";
    writePref("theme", next);
    setState({ theme: next });
  },

  setTheme: (theme: Theme): void => {
    writePref("theme", theme);
    setState({ theme });
  },

  toggleExpanded: (id: number): void => {
    const expanded = new Set(getState().expanded);
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    const arr = [...expanded];
    writePref("expanded", arr);
    setState({ expanded: arr });
  },

  toggleSidebar: (): void => {
    const sidebarCollapsed = !getState().sidebarCollapsed;
    writePref("sidebarCollapsed", sidebarCollapsed);
    setState({ sidebarCollapsed });
  },

  togglePanel: (): void => {
    const panelOpen = !getState().panelOpen;
    writePref("panelOpen", panelOpen);
    setState({ panelOpen });
  },

  setPalette: (paletteOpen: boolean): void => setState({ paletteOpen }),

  // --- settings ----------------------------------------------------------

  loadSettings: async (): Promise<void> => {
    const [aiConfig, embedStatus, mcpConfig] = await Promise.all([
      invoke(ch.getSettings, undefined),
      invoke(ch.embedStatus, undefined),
      invoke(ch.mcpConfig, undefined),
    ]);
    setState({ aiConfig, embedStatus, mcpConfig });
  },

  setSemanticIndex: async (enabled: boolean): Promise<void> => {
    const aiConfig = await invoke(ch.setSemanticIndex, { enabled });
    setState({ aiConfig });
  },

  reindexVault: async (): Promise<void> => {
    toast.info("Indexing your vault…");
    const { status, message } = await invoke(ch.reindexVault, undefined);
    setState({ embedStatus: status });
    toast.success(message);
  },

  refreshEmbedStatus: async (): Promise<void> => {
    const embedStatus = await invoke(ch.embedStatus, undefined);
    setState({ embedStatus });
  },

  updateSettings: async (patch: {
    provider?: AiProvider;
    model?: string;
    baseURL?: string;
  }): Promise<void> => {
    const aiConfig = await invoke(ch.setSettings, patch);
    setState({ aiConfig });
  },

  setAiKey: async (provider: AiProvider, apiKey: string): Promise<void> => {
    const aiConfig = await invoke(ch.setAiKey, { provider, apiKey });
    setState({ aiConfig });
    toast.success(apiKey.trim() ? "API key saved" : "API key cleared");
  },

  clearAiKey: async (provider: AiProvider): Promise<void> => {
    const aiConfig = await invoke(ch.clearAiKey, { provider });
    setState({ aiConfig });
    toast.success("API key cleared");
  },

  testAi: (): Promise<{ ok: boolean; message: string }> => invoke(ch.testAi, undefined),

  openSettings: (): void => setState({ settingsOpen: true }),
  closeSettings: (): void => setState({ settingsOpen: false }),

  // --- Stohr connection --------------------------------------------------

  loadStohr: async (): Promise<void> => {
    const stohr = await invoke(ch.stohrStatus, undefined);
    setState({ stohr });
  },

  connectStohrToken: async (baseURL: string, token: string): Promise<StohrConnectResult> => {
    const result = await invoke(ch.stohrConnectToken, { baseURL, token });
    if (result.ok) {
      setState({ stohr: result.status });
      toast.success("Connected to Stohr");
    }
    return result;
  },

  connectStohrPassword: async (
    baseURL: string,
    identity: string,
    password: string,
  ): Promise<StohrConnectResult> => {
    const result = await invoke(ch.stohrConnectPassword, { baseURL, identity, password });
    if (result.ok) {
      setState({ stohr: result.status });
      toast.success("Connected to Stohr");
    }
    return result;
  },

  connectStohrMfa: async (
    baseURL: string,
    mfaToken: string,
    code: string,
  ): Promise<StohrConnectResult> => {
    const result = await invoke(ch.stohrConnectMfa, { baseURL, mfaToken, code });
    if (result.ok) {
      setState({ stohr: result.status });
      toast.success("Connected to Stohr");
    }
    return result;
  },

  disconnectStohr: async (): Promise<void> => {
    const stohr = await invoke(ch.stohrDisconnect, undefined);
    setState({ stohr });
    toast.success("Disconnected from Stohr");
  },

  // --- AI assistant ------------------------------------------------------

  toggleAi: (): void => {
    const aiOpen = !getState().aiOpen;
    writePref("aiOpen", aiOpen);
    setState({ aiOpen });
  },

  setAiContext: (useContext: boolean): void =>
    setState((s) => ({ chat: { ...s.chat, useContext } })),

  setAiVault: (useVault: boolean): void => {
    writePref("aiUseVault", useVault);
    setState((s) => ({ chat: { ...s.chat, useVault } }));
  },

  // The host emits `aiSources` once RAG retrieval finishes — tag the
  // in-flight assistant message with the pages it pulled in.
  applyAiSources: (requestId: string, titles: readonly string[]): void => {
    setState((s) => {
      if (s.chat.requestId !== requestId) return {};
      const msgs = s.chat.messages.slice();
      const lastIdx = msgs.length - 1;
      const last = msgs[lastIdx];
      if (!last || last.role !== "assistant") return {};
      msgs[lastIdx] = { ...last, sources: titles };
      return { chat: { ...s.chat, messages: msgs } };
    });
  },

  clearChat: (): void =>
    setState((s) => ({
      chat: {
        messages: [],
        streaming: false,
        requestId: null,
        useContext: s.chat.useContext,
        useVault: s.chat.useVault,
      },
    })),

  cancelChat: (): void => {
    const { requestId } = getState().chat;
    if (requestId) void invoke(ch.aiCancel, { requestId });
  },

  // Appends a streamed delta to the in-flight assistant message.
  applyAiChunk: (requestId: string, delta: string): void => {
    if (!delta) return;
    setState((s) => {
      if (s.chat.requestId !== requestId) return {};
      const msgs = s.chat.messages.slice();
      const lastIdx = msgs.length - 1;
      const last = msgs[lastIdx];
      if (!last || last.role !== "assistant") return {};
      msgs[lastIdx] = { role: "assistant", content: last.content + delta };
      return { chat: { ...s.chat, messages: msgs } };
    });
  },

  sendChat: async (text: string): Promise<void> => {
    const trimmed = text.trim();
    const { chat, activeId } = getState();
    if (!trimmed || chat.streaming) return;

    const convo: ChatMessage[] = [...chat.messages, { role: "user", content: trimmed }];
    const requestId = `c${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setState({
      chat: {
        ...chat,
        messages: [...convo, { role: "assistant", content: "" }],
        streaming: true,
        requestId,
      },
    });

    const result = await invoke(ch.aiChat, {
      requestId,
      messages: convo,
      pageId: chat.useContext && activeId !== null ? activeId : undefined,
      useVault: chat.useVault,
    });

    setState((s) => {
      if (s.chat.requestId !== requestId) return {};
      const msgs = s.chat.messages.slice();
      const lastIdx = msgs.length - 1;
      const streamed = msgs[lastIdx]?.content ?? "";
      const content = result.ok
        ? result.content || streamed
        : streamed || `⚠️ ${result.error ?? "AI request failed"}`;
      msgs[lastIdx] = { role: "assistant", content };
      return { chat: { ...s.chat, messages: msgs, streaming: false, requestId: null } };
    });

    if (!result.ok && !result.content) toast.error(result.error ?? "AI request failed");
  },

  summarizePage: async (id: number): Promise<void> => {
    toast.info("Summarising…");
    const result = await invoke(ch.aiSummarize, { pageId: id });
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't summarise the page");
      return;
    }
    writePref("aiOpen", true);
    setState((s) => ({
      aiOpen: true,
      chat: {
        ...s.chat,
        messages: [
          ...s.chat.messages,
          { role: "user", content: "Summarise this page." },
          { role: "assistant", content: result.content },
        ],
      },
    }));
  },

  // --- workspace: tabs, split, find, templates ---------------------------

  closeTab: (id: number): void => {
    const { tabs, activeId, splitId } = getState();
    const idx = tabs.indexOf(id);
    if (idx < 0) return;
    const next = tabs.filter((t) => t !== id);
    setState({ tabs: next, ...(splitId === id ? { splitId: null } : {}) });
    if (activeId === id) {
      const fallback = next[idx] ?? next[idx - 1] ?? next[next.length - 1];
      if (fallback !== undefined) void actions.openPage(fallback);
      else setState({ activeId: null, activePage: null });
    }
  },

  setSplit: (id: number | null): void => {
    setState((s) => ({ splitId: s.splitId === id ? null : id }));
  },

  openRandomPage: (): void => {
    const all = flattenTree(getState().tree).filter((n) => n.kind === "file");
    const pick = all[Math.floor(Math.random() * all.length)];
    if (pick) void actions.openPage(pick.id);
  },

  toggleFind: (): void => setState((s) => ({ findOpen: !s.findOpen })),
  closeFind: (): void => setState({ findOpen: false }),

  toggleTemplate: async (id: number, isTemplate: boolean): Promise<void> => {
    await invoke(ch.updatePage, { id, isTemplate });
    await refreshTree();
    toast.success(isTemplate ? "Saved as template" : "Removed from templates");
  },

  newFromTemplate: async (id: number): Promise<void> => {
    const page = await invoke(ch.getPage, { id });
    if (!page) return;
    const copy = await invoke(ch.createPage, {
      title: page.title,
      body: page.body,
      icon: page.icon,
    });
    if (!copy) return;
    await refreshTree();
    await actions.openPage(copy.id);
    toast.success("New page from template");
  },
};
