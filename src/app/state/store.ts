import { useSyncExternalStore } from "react";
import type {
  AiConfig,
  AppStats,
  Backlink,
  Backlinks,
  ChatMessage,
  EmbedStatus,
  GraphData,
  Page,
  PageMeta,
  SearchHit,
  StohrStatus,
  TagCount,
  TreeNode,
  VaultEntry,
  VaultInfo,
} from "../../shared/types.ts";

export type View = "editor" | "graph" | "search" | "tags";
export type Theme = "light" | "dark" | "auto";
export type GraphMode = "global" | "local";

export type ChatState = {
  readonly messages: readonly ChatMessage[];
  readonly streaming: boolean;
  readonly requestId: string | null;
  readonly useContext: boolean;
  readonly useVault: boolean;
};

export type AppState = {
  // The open vault — a folder of Markdown files. `null` means no vault is
  // open and the app shows the vault picker.
  readonly vault: VaultInfo | null;
  readonly vaultRecents: readonly VaultEntry[];
  readonly tree: readonly TreeNode[];
  readonly pinned: readonly PageMeta[];
  readonly recents: readonly PageMeta[];
  readonly dailies: readonly PageMeta[];
  readonly templates: readonly PageMeta[];
  readonly tags: readonly TagCount[];
  readonly stats: AppStats | null;
  readonly expanded: readonly number[];
  // The tree node currently being renamed inline, if any.
  readonly renamingId: number | null;
  readonly activeId: number | null;
  readonly activePage: Page | null;
  readonly tabs: readonly number[];
  readonly splitId: number | null;
  readonly findOpen: boolean;
  readonly backlinks: Backlinks;
  readonly outgoing: readonly Backlink[];
  readonly history: readonly number[];
  readonly historyAt: number;
  readonly pendingScroll: string | null;
  readonly view: View;
  readonly search: { readonly query: string; readonly hits: readonly SearchHit[] };
  readonly tagFilter: { readonly tag: string | null; readonly pages: readonly PageMeta[] };
  readonly graph: GraphData | null;
  readonly graphMode: GraphMode;
  readonly theme: Theme;
  readonly paletteOpen: boolean;
  readonly sidebarCollapsed: boolean;
  readonly panelOpen: boolean;
  readonly loading: boolean;
  readonly settingsOpen: boolean;
  readonly aiOpen: boolean;
  readonly aiConfig: AiConfig | null;
  readonly embedStatus: EmbedStatus | null;
  readonly mcpConfig: { command: string; args: readonly string[] } | null;
  readonly stohr: StohrStatus | null;
  readonly chat: ChatState;
};

// --- persisted UI preferences (webview-local, no IPC needed) ---------------

const readPref = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(`narrative.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

export const writePref = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(`narrative.${key}`, JSON.stringify(value));
  } catch {
    // storage unavailable — preferences just won't persist
  }
};

const initial: AppState = {
  vault: null,
  vaultRecents: [],
  tree: [],
  pinned: [],
  recents: [],
  dailies: [],
  templates: [],
  tags: [],
  stats: null,
  expanded: readPref<number[]>("expanded", []),
  renamingId: null,
  activeId: null,
  activePage: null,
  tabs: [],
  splitId: null,
  findOpen: false,
  backlinks: { linked: [], unlinked: [] },
  outgoing: [],
  history: [],
  historyAt: -1,
  pendingScroll: null,
  view: "editor",
  search: { query: "", hits: [] },
  tagFilter: { tag: null, pages: [] },
  graph: null,
  graphMode: "global",
  theme: readPref<Theme>("theme", "auto"),
  paletteOpen: false,
  sidebarCollapsed: readPref<boolean>("sidebarCollapsed", false),
  panelOpen: readPref<boolean>("panelOpen", true),
  loading: false,
  settingsOpen: false,
  aiOpen: readPref<boolean>("aiOpen", false),
  aiConfig: null,
  embedStatus: null,
  mcpConfig: null,
  stohr: null,
  chat: {
    messages: [],
    streaming: false,
    requestId: null,
    useContext: true,
    useVault: readPref<boolean>("aiUseVault", false),
  },
};

let state: AppState = initial;
const listeners = new Set<() => void>();

export const getState = (): AppState => state;

export const setState = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void => {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Non-React subscription to the whole store — used by the plugin bridge to
// synthesise plugin `workspace` / `vault` events off state transitions.
export const subscribeStore = subscribe;

// Whole-state subscription. `getState` returns a stable reference between
// `setState` calls, so this is safe for `useSyncExternalStore`.
export const useApp = (): AppState => useSyncExternalStore(subscribe, getState, getState);
