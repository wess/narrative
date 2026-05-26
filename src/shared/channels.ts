import { defineChannel, defineEvent } from "@basket/ipc";
import type {
  AgentDef,
  AgentToolDef,
  AiConfig,
  AiProvider,
  AiResult,
  AppStats,
  Backlink,
  Backlinks,
  ChatMessage,
  CommandDef,
  EmbedStatus,
  GraphData,
  InstalledPlugin,
  Page,
  PageMeta,
  PluginBundle,
  RequestUrlInput,
  RequestUrlResult,
  SearchHit,
  StohrConnectResult,
  StohrStatus,
  StohrSyncResult,
  TagCount,
  ToolCall,
  TreeNode,
  VaultEntry,
  VaultInfo,
} from "./types.ts";

// --- request / response channels ------------------------------------------

export const getTree = defineChannel<void, TreeNode[]>("pages:tree");
export const getPage = defineChannel<{ id: number }, Page | null>("pages:get");

// --- vault ----------------------------------------------------------------
// The open vault is a folder of Markdown files. These manage which folder is
// open and the recent-vaults switcher.

export const vaultCurrent = defineChannel<void, VaultInfo | null>("vault:current");
export const vaultRecents = defineChannel<void, VaultEntry[]>("vault:recents");
export const vaultOpen = defineChannel<{ path: string }, VaultInfo | null>("vault:open");
export const vaultCreate = defineChannel<{ path: string }, VaultInfo | null>("vault:create");
export const vaultPick = defineChannel<{ mode: "open" | "create" }, VaultInfo | null>("vault:pick");
export const vaultForget = defineChannel<{ root: string }, VaultEntry[]>("vault:forget");
// The open vault changed — the webview reloads its whole tree/state.
export const vaultChanged = defineEvent<VaultInfo | null>("evt:vault");

// --- request / response channels (continued) ------------------------------

export const createFolder = defineChannel<{ parentId: number | null; title: string }, Page>(
  "pages:createfolder",
);

export const createPage = defineChannel<
  { title?: string; parentId?: number | null; body?: string; icon?: string },
  Page
>("pages:create");

export const updatePage = defineChannel<
  {
    id: number;
    title?: string;
    body?: string;
    icon?: string;
    parentId?: number | null;
    pinned?: boolean;
    archived?: boolean;
    isTemplate?: boolean;
    sortKey?: number;
  },
  Page
>("pages:update");

export const deletePage = defineChannel<{ id: number }, { id: number; removed: number[] }>(
  "pages:delete",
);
export const movePage = defineChannel<
  { id: number; parentId: number | null; sortKey: number },
  Page
>("pages:move");

export const pinnedPages = defineChannel<void, PageMeta[]>("pages:pinned");
export const recentPages = defineChannel<void, PageMeta[]>("pages:recent");
export const archivedPages = defineChannel<void, PageMeta[]>("pages:archived");
export const dailyPages = defineChannel<void, PageMeta[]>("pages:dailies");
export const templatePages = defineChannel<void, PageMeta[]>("pages:templates");

export const searchPages = defineChannel<{ query: string }, SearchHit[]>("pages:search");
export const getBacklinks = defineChannel<{ id: number }, Backlinks>("pages:backlinks");
export const getOutgoing = defineChannel<{ id: number }, Backlink[]>("pages:outgoing");
export const resolveLink = defineChannel<{ title: string }, Page>("pages:resolve");
export const pageByTitle = defineChannel<{ title: string }, Page | null>("pages:bytitle");
export const dailyNote = defineChannel<{ date: string }, Page>("pages:daily");
export const exportPage = defineChannel<{ id: number }, { path: string | null }>("pages:export");

// --- attachments ----------------------------------------------------------
// Pasted images are stored as real files under the vault's `attachments/`
// folder; the page Markdown keeps only the relative path. Binary crosses the
// JSON IPC as base64. `saveAttachment` writes one; `readAttachment` resolves
// a vault-relative attachment path back to bytes for display.
export const saveAttachment = defineChannel<
  { name: string; data: string },
  { path: string | null }
>("vault:saveattachment");
export const readAttachment = defineChannel<
  { path: string },
  { data: string; mime: string } | null
>("vault:readattachment");

export const listTags = defineChannel<void, TagCount[]>("tags:list");
export const tagPages = defineChannel<{ tag: string }, PageMeta[]>("tags:pages");

export const graphData = defineChannel<void, GraphData>("graph:data");
export const localGraph = defineChannel<{ id: number }, GraphData>("graph:local");
export const appStats = defineChannel<void, AppStats>("app:stats");

// --- settings + AI --------------------------------------------------------

export const getSettings = defineChannel<void, AiConfig>("settings:get");
export const setSettings = defineChannel<
  { provider?: AiProvider; model?: string; baseURL?: string },
  AiConfig
>("settings:set");
export const setAiKey = defineChannel<{ provider: AiProvider; apiKey: string }, AiConfig>(
  "settings:setkey",
);
export const clearAiKey = defineChannel<{ provider: AiProvider }, AiConfig>("settings:clearkey");
export const setSemanticIndex = defineChannel<{ enabled: boolean }, AiConfig>("settings:semantic");
export const testAi = defineChannel<void, { ok: boolean; message: string }>("ai:test");

// RAG / embedding index.
export const embedStatus = defineChannel<void, EmbedStatus>("ai:embedstatus");
export const reindexVault = defineChannel<void, { status: EmbedStatus; message: string }>(
  "ai:reindex",
);

// The MCP server's launch command, for the Settings snippet.
export const mcpConfig = defineChannel<void, { command: string; args: string[] }>("app:mcpconfig");

// Streaming chat: the handler resolves with the final content and also
// emits `aiChunk` events tagged by requestId as deltas arrive. With
// `useVault`, the host retrieves relevant pages (RAG) and emits `aiSources`.
// When `agentSlug` is set, the host runs the agentic loop — the assistant
// can call tools via fenced blocks and the host emits `aiToolCall` events
// for each call.
export const aiChat = defineChannel<
  {
    requestId: string;
    messages: ChatMessage[];
    pageId?: number;
    useVault?: boolean;
    agentSlug?: string;
  },
  AiResult
>("ai:chat");
export const aiCancel = defineChannel<{ requestId: string }, void>("ai:cancel");
export const aiSummarize = defineChannel<{ pageId: number }, AiResult>("ai:summarize");
export const aiChunk = defineEvent<{ requestId: string; delta: string; done: boolean }>(
  "evt:aichunk",
);
export const aiSources = defineEvent<{ requestId: string; mode: string; titles: string[] }>(
  "evt:aisources",
);
// Emitted as a tool call moves through `pending -> ok/error`. The webview
// renders the latest snapshot keyed by `call.id` next to the assistant turn.
export const aiToolCall = defineEvent<{ requestId: string; call: ToolCall }>("evt:aitoolcall");

// --- agents + commands ----------------------------------------------------
// Native agent/command files live in `.narrative/agents/*.md` and
// `.narrative/commands/*.md` inside the open vault. The host parses
// frontmatter on demand.

export const agentList = defineChannel<void, AgentDef[]>("agents:list");
export const commandList = defineChannel<void, CommandDef[]>("commands:list");
export const toolList = defineChannel<void, AgentToolDef[]>("tools:list");
// Scaffolding helpers — create a starter file in `.narrative/agents/` or
// `.narrative/commands/` and return the freshly-loaded definition.
export const agentCreate = defineChannel<{ name: string }, AgentDef | null>("agents:create");
export const commandCreate = defineChannel<{ name: string }, CommandDef | null>("commands:create");
// Read / save the raw markdown source of an agent or command file so the
// webview can host an in-vault editor for them.
export const agentSource = defineChannel<{ slug: string }, { path: string; body: string } | null>(
  "agents:source",
);
export const agentSave = defineChannel<{ slug: string; body: string }, AgentDef | null>(
  "agents:save",
);
export const commandSource = defineChannel<{ slug: string }, { path: string; body: string } | null>(
  "commands:source",
);
export const commandSave = defineChannel<{ slug: string; body: string }, CommandDef | null>(
  "commands:save",
);
export const agentDelete = defineChannel<{ slug: string }, void>("agents:delete");
export const commandDelete = defineChannel<{ slug: string }, void>("commands:delete");
// Fired by the host whenever agents/commands change on disk so the picker /
// palette can refresh without polling.
export const agentsChanged = defineEvent<void>("evt:agentschanged");

// --- Stohr ----------------------------------------------------------------
// Connect Narrative to a Stohr instance (self-hostable cloud storage).

export const stohrStatus = defineChannel<void, StohrStatus>("stohr:status");
export const stohrConnectToken = defineChannel<
  { baseURL: string; token: string },
  StohrConnectResult
>("stohr:connecttoken");
export const stohrConnectPassword = defineChannel<
  { baseURL: string; identity: string; password: string },
  StohrConnectResult
>("stohr:connectpassword");
export const stohrConnectMfa = defineChannel<
  { baseURL: string; mfaToken: string; code: string },
  StohrConnectResult
>("stohr:connectmfa");
export const stohrDisconnect = defineChannel<void, StohrStatus>("stohr:disconnect");
// Two-way sync of the vault folder with the connected Stohr account.
export const stohrSync = defineChannel<void, StohrSyncResult>("stohr:sync");

// --- plugins --------------------------------------------------------------

// List installed plugins (manifest + enabled state) — rescans the dir.
export const pluginList = defineChannel<void, InstalledPlugin[]>("plugins:list");
// Fetch a plugin's code + css + saved data so the webview can run it.
export const pluginRead = defineChannel<{ id: string }, PluginBundle | null>("plugins:read");
// Flip the enabled flag for a plugin; returns the refreshed list.
export const pluginSetEnabled = defineChannel<{ id: string; enabled: boolean }, InstalledPlugin[]>(
  "plugins:setenabled",
);
// Persist a plugin's `data.json` (loadData / saveData).
export const pluginSaveData = defineChannel<{ id: string; data: unknown }, void>(
  "plugins:savedata",
);
// Remove a plugin's folder entirely.
export const pluginRemove = defineChannel<{ id: string }, InstalledPlugin[]>("plugins:remove");
// Copy a plugin folder the user picked into the managed plugins directory.
export const pluginInstall = defineChannel<void, { ok: boolean; message: string }>(
  "plugins:install",
);
// Reveal the plugins directory in the OS file manager.
export const pluginOpenDir = defineChannel<void, void>("plugins:opendir");
// `requestUrl` proxy — runs `fetch` on the host so plugins escape WKWebView CORS.
export const pluginRequestUrl = defineChannel<RequestUrlInput, RequestUrlResult>(
  "plugins:requesturl",
);

// --- host -> webview events ------------------------------------------------

// The page tree / pinned / tags / recents changed structurally — refetch.
export const treeChanged = defineEvent<void>("evt:tree");
// A page's content was saved (used to keep open editors / titles fresh).
export const pageSaved = defineEvent<Page>("evt:page");
// Ask the webview to navigate to a page.
export const focusPage = defineEvent<{ id: number }>("evt:focus");
// A native menu item fired a webview-side command (search, graph, theme…).
export const runCommand = defineEvent<string>("evt:command");
