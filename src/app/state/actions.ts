import { invoke } from "@basket/ipc/client";
import { toast } from "@basket/ui/toast";
import * as ch from "../../shared/channels.ts";
import type {
  AiProvider,
  ChatMessage,
  StohrConnectResult,
  StohrSyncResult,
  ToolCall,
  VaultInfo,
} from "../../shared/types.ts";
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

export type AgentSourceInput = {
  readonly name: string;
  readonly source: string;
  readonly activate?: boolean;
};

export type ChannelSourceInput = {
  readonly name: string;
  readonly source: string;
  readonly activate?: boolean;
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
    void actions.refreshAgents();
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

  // Reconcile the vault with Stohr. The host writes any pulled files to disk,
  // so the tree is refreshed once the sync returns.
  syncStohr: async (): Promise<StohrSyncResult> => {
    const result = await invoke(ch.stohrSync, undefined);
    if (result.ok) {
      await refreshTree();
      const moved = result.pulled + result.pushed + result.deleted;
      if (result.conflicts.length > 0) {
        toast.info(`Synced with ${result.conflicts.length} conflict(s) — see Settings → Stohr`);
      } else if (moved > 0) {
        toast.success(`Synced — ${result.pulled} in, ${result.pushed} out`);
      } else {
        toast.success("Already up to date");
      }
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  },

  // --- AI assistant ------------------------------------------------------

  toggleAi: (): void => {
    const aiOpen = !getState().aiOpen;
    writePref("aiOpen", aiOpen);
    setState({ aiOpen });
  },

  openAi: (): void => {
    writePref("aiOpen", true);
    setState({ aiOpen: true });
  },

  // --- agents + commands -------------------------------------------------

  refreshAgents: async (): Promise<void> => {
    const [agents, channels, projects, commands, toolDefs] = await Promise.all([
      invoke(ch.agentList, undefined),
      invoke(ch.channelList, undefined),
      invoke(ch.projectList, undefined),
      invoke(ch.commandList, undefined),
      invoke(ch.toolList, undefined),
    ]);
    setState((s) => {
      // If the active agent vanished, fall back to the plain assistant.
      const stillThere = s.chat.agentSlug ? agents.some((a) => a.slug === s.chat.agentSlug) : true;
      const agentSlug = stillThere ? s.chat.agentSlug : null;
      const channelStillThere = s.chat.channelSlug
        ? channels.some((c) => c.slug === s.chat.channelSlug)
        : true;
      const channelSlug = channelStillThere ? s.chat.channelSlug : null;
      const profileStillThere = s.agentProfileSlug
        ? agents.some((a) => a.slug === s.agentProfileSlug)
        : true;
      const channelProfileStillThere = s.channelProfileSlug
        ? channels.some((c) => c.slug === s.channelProfileSlug)
        : true;
      if (!stillThere) writePref("aiAgent", null);
      if (!channelStillThere) writePref("aiChannel", null);
      return {
        agents,
        channels,
        projects,
        commands,
        toolDefs,
        agentProfileSlug: profileStillThere ? s.agentProfileSlug : null,
        channelProfileSlug: channelProfileStillThere ? s.channelProfileSlug : null,
        chat: { ...s.chat, agentSlug, channelSlug },
      };
    });
  },

  setAgent: (agentSlug: string | null): void => {
    writePref("aiAgent", agentSlug);
    writePref("aiChannel", null);
    setState((s) => ({ chat: { ...s.chat, agentSlug, channelSlug: null } }));
  },

  setChannel: (channelSlug: string | null): void => {
    writePref("aiChannel", channelSlug);
    writePref("aiAgent", null);
    setState((s) => ({ chat: { ...s.chat, channelSlug, agentSlug: null } }));
  },

  openAgentWizard: (): void => setState({ agentWizardOpen: true }),
  closeAgentWizard: (): void => setState({ agentWizardOpen: false }),
  openAgentProfile: (slug: string): void => setState({ agentProfileSlug: slug }),
  closeAgentProfile: (): void => setState({ agentProfileSlug: null }),
  openChannelWizard: (): void => setState({ channelWizardOpen: true }),
  closeChannelWizard: (): void => setState({ channelWizardOpen: false }),
  openChannelProfile: (slug: string): void => setState({ channelProfileSlug: slug }),
  closeChannelProfile: (): void => setState({ channelProfileSlug: null }),

  addProject: async (): Promise<void> => {
    const project = await invoke(ch.projectPick, undefined);
    if (!project) return;
    await actions.refreshAgents();
    toast.success("Project added");
  },

  deleteProject: async (slug: string): Promise<void> => {
    await invoke(ch.projectDelete, { slug });
    await actions.refreshAgents();
    toast.success("Project removed");
  },

  suggestChannelForProject: async (slug: string): Promise<void> => {
    const result = await invoke(ch.projectSuggestChannel, { slug });
    if (!result) return;
    await actions.refreshAgents();
    actions.setChannel(result.channel.slug);
    actions.openAi();
    setState({ channelProfileSlug: result.channel.slug });
    toast.success("Channel suggested");
  },

  createAgentFile: async (name: string): Promise<void> => {
    const agent = await invoke(ch.agentCreate, { name });
    if (!agent) return;
    await actions.refreshAgents();
    await actions.openAgentEditor("agent", agent.slug);
    toast.success("Agent created");
  },

  createAgentFromSource: async ({
    name,
    source,
    activate = true,
  }: AgentSourceInput): Promise<void> => {
    const agent = await invoke(ch.agentCreate, { name });
    if (!agent) return;
    const saved = await invoke(ch.agentSave, { slug: agent.slug, body: source });
    await actions.refreshAgents();
    if (activate && saved) {
      actions.setAgent(saved.slug);
      writePref("aiOpen", true);
      setState({ aiOpen: true });
      setState({ agentProfileSlug: saved.slug });
    }
    setState({ agentWizardOpen: false });
    toast.success("Agent created");
  },

  createChannelFromSource: async ({
    name,
    source,
    activate = true,
  }: ChannelSourceInput): Promise<void> => {
    const channel = await invoke(ch.channelCreate, { name });
    if (!channel) return;
    const saved = await invoke(ch.channelSave, { slug: channel.slug, body: source });
    await actions.refreshAgents();
    if (activate && saved) {
      actions.setChannel(saved.slug);
      actions.openAi();
      setState({ channelProfileSlug: saved.slug });
    }
    setState({ channelWizardOpen: false });
    toast.success("Channel created");
  },

  createCommandFile: async (name: string): Promise<void> => {
    const command = await invoke(ch.commandCreate, { name });
    if (!command) return;
    await actions.refreshAgents();
    await actions.openAgentEditor("command", command.slug);
    toast.success("Command created");
  },

  openAgentEditor: async (kind: "agent" | "channel" | "command", slug: string): Promise<void> => {
    const source =
      kind === "agent"
        ? await invoke(ch.agentSource, { slug })
        : kind === "channel"
          ? await invoke(ch.channelSource, { slug })
          : await invoke(ch.commandSource, { slug });
    if (!source) return;
    setState({
      agentEditor: { open: true, kind, slug, path: source.path, body: source.body, dirty: false },
    });
  },

  closeAgentEditor: (): void => setState({ agentEditor: null }),

  updateAgentEditorBody: (body: string): void =>
    setState((s) =>
      s.agentEditor
        ? { agentEditor: { ...s.agentEditor, body, dirty: body !== s.agentEditor.body } }
        : {},
    ),

  saveAgentEditor: async (): Promise<void> => {
    const editor = getState().agentEditor;
    if (!editor || editor.slug === null) return;
    if (editor.kind === "agent") {
      await invoke(ch.agentSave, { slug: editor.slug, body: editor.body });
    } else if (editor.kind === "channel") {
      await invoke(ch.channelSave, { slug: editor.slug, body: editor.body });
    } else {
      await invoke(ch.commandSave, { slug: editor.slug, body: editor.body });
    }
    await actions.refreshAgents();
    setState((s) => (s.agentEditor ? { agentEditor: { ...s.agentEditor, dirty: false } } : {}));
    toast.success("Saved");
  },

  deleteAgentFile: async (kind: "agent" | "channel" | "command", slug: string): Promise<void> => {
    if (kind === "agent") await invoke(ch.agentDelete, { slug });
    else if (kind === "channel") await invoke(ch.channelDelete, { slug });
    else await invoke(ch.commandDelete, { slug });
    await actions.refreshAgents();
    setState((s) => (s.agentEditor && s.agentEditor.slug === slug ? { agentEditor: null } : {}));
    toast.success("Deleted");
  },

  setCommandPalette: (commandPaletteOpen: boolean): void => setState({ commandPaletteOpen }),

  // Run a command as a one-shot user turn. Uses the command's bound agent
  // (when set), otherwise sends the body as a plain user message.
  runCommand: async (slug: string): Promise<void> => {
    const { commands, chat } = getState();
    const command = commands.find((c) => c.slug === slug);
    if (!command) return;
    setState({ commandPaletteOpen: false });
    if (command.agent && command.agent !== chat.agentSlug) {
      actions.setAgent(command.agent);
    }
    await actions.sendChat(command.prompt);
  },

  // The host fires `aiToolCall` as a tool transitions pending → ok/error.
  applyAiToolCall: (requestId: string, call: ToolCall): void => {
    setState((s) => {
      if (s.chat.requestId !== requestId) return {};
      const msgs = s.chat.messages.slice();
      const lastIdx = msgs.length - 1;
      const last = msgs[lastIdx];
      if (!last || last.role !== "assistant") return {};
      const existing = last.toolCalls ?? [];
      const idx = existing.findIndex((c) => c.id === call.id);
      const toolCalls =
        idx >= 0 ? existing.map((c, i) => (i === idx ? call : c)) : [...existing, call];
      msgs[lastIdx] = { ...last, toolCalls };
      return { chat: { ...s.chat, messages: msgs } };
    });
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
        agentSlug: s.chat.agentSlug,
        channelSlug: s.chat.channelSlug,
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
      msgs[lastIdx] = { ...last, content: last.content + delta };
      return { chat: { ...s.chat, messages: msgs } };
    });
  },

  sendChat: async (text: string): Promise<void> => {
    const trimmed = text.trim();
    const { chat, activeId, channels, agents } = getState();
    if (!trimmed || chat.streaming) return;

    const channel = chat.channelSlug
      ? (channels.find((c) => c.slug === chat.channelSlug) ?? null)
      : null;
    const channelMembers = channel
      ? channel.agents.filter((slug) => agents.some((agent) => agent.slug === slug))
      : [];
    const agentSlugs =
      channel && channelMembers.length > 0
        ? channel.mode === "roundtable"
          ? channelMembers
          : channel.mode === "focus" || channel.mode === "manual"
            ? channelMembers.slice(0, 1)
            : channelMembers
        : [chat.agentSlug].filter((slug): slug is string => slug !== null);
    const responders = agentSlugs.length > 0 ? agentSlugs : [null];

    let transcript: ChatMessage[] = [...chat.messages, { role: "user", content: trimmed }];
    setState({ chat: { ...chat, messages: transcript, streaming: true, requestId: null } });

    for (const agentSlug of responders) {
      const requestId = `c${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setState((s) => ({
        chat: {
          ...s.chat,
          messages: [
            ...s.chat.messages,
            { role: "assistant", content: "", agentSlug: agentSlug ?? undefined },
          ],
          requestId,
        },
      }));

      const result = await invoke(ch.aiChat, {
        requestId,
        messages: transcript,
        pageId: chat.useContext && activeId !== null ? activeId : undefined,
        useVault: chat.useVault,
        agentSlug: agentSlug ?? undefined,
        channelSlug: channel?.slug,
      });

      let finalMessage: ChatMessage | null = null;
      setState((s) => {
        if (s.chat.requestId !== requestId) return {};
        const msgs = s.chat.messages.slice();
        const lastIdx = msgs.length - 1;
        const last = msgs[lastIdx];
        const streamed = last?.content ?? "";
        const content = result.ok
          ? result.content || streamed
          : streamed || `⚠️ ${result.error ?? "AI request failed"}`;
        const toolCalls = result.toolCalls ?? last?.toolCalls;
        finalMessage = {
          role: "assistant",
          content,
          ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
          ...(last?.agentSlug ? { agentSlug: last.agentSlug } : {}),
        };
        msgs[lastIdx] = finalMessage;
        return { chat: { ...s.chat, messages: msgs, requestId: null } };
      });

      if (finalMessage) transcript = [...transcript, finalMessage];
      if (!result.ok && !result.content) toast.error(result.error ?? "AI request failed");
    }

    setState((s) => ({ chat: { ...s.chat, streaming: false, requestId: null } }));
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
