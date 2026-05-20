// The shared data contract between the host and the webview. Every shape
// that crosses IPC lives here so renaming a field is a compile error on
// both sides.

// A node in the file-backed vault: either a `.md` file (`kind: "file"` — a
// real page with a `body`) or a folder (`kind: "folder"` — empty `body`,
// holds children). `path` is the vault-relative path to the file/folder on
// disk; `id` is a stable in-session handle the webview keys everything on.
export type NodeKind = "file" | "folder";

export type Page = {
  readonly id: number;
  readonly path: string;
  readonly kind: NodeKind;
  readonly title: string;
  readonly body: string;
  readonly icon: string;
  readonly parentId: number | null;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly isDaily: boolean;
  readonly isTemplate: boolean;
  readonly sortKey: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

// Lightweight projection for trees, lists, and pickers — no body.
export type PageMeta = {
  readonly id: number;
  readonly path: string;
  readonly kind: NodeKind;
  readonly title: string;
  readonly icon: string;
  readonly parentId: number | null;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly isDaily: boolean;
  readonly isTemplate: boolean;
  readonly sortKey: number;
  readonly updatedAt: string;
};

export type TreeNode = PageMeta & { readonly children: readonly TreeNode[] };

// --- vault ----------------------------------------------------------------

export type VaultInfo = {
  readonly root: string; // absolute path to the open vault folder
  readonly name: string; // folder basename, shown in the UI
};

export type VaultEntry = {
  readonly root: string;
  readonly name: string;
  readonly lastOpened: string; // ISO timestamp
};

export type Backlink = {
  readonly id: number;
  readonly title: string;
  readonly icon: string;
  readonly snippet: string;
};

export type Backlinks = {
  readonly linked: readonly Backlink[];
  readonly unlinked: readonly Backlink[];
};

export type SearchHit = {
  readonly id: number;
  readonly title: string;
  readonly icon: string;
  readonly snippet: string;
};

export type TagCount = {
  readonly tag: string;
  readonly count: number;
};

export type GraphNode = {
  readonly id: number;
  readonly title: string;
  readonly icon: string;
  readonly degree: number;
};

export type GraphEdge = {
  readonly source: number;
  readonly target: number;
};

export type GraphData = {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
};

export type AppStats = {
  readonly pages: number;
  readonly words: number;
  readonly links: number;
  readonly tags: number;
};

// --- AI + settings --------------------------------------------------------

// Five presets over three wire protocols — see `shared/providers.ts` for
// the per-preset facts (protocol, defaults, whether a key is needed).
export type AiProvider = "anthropic" | "openai" | "ollama" | "ollama-cloud" | "openai-compatible";

export type AiConfig = {
  readonly provider: AiProvider;
  readonly model: string;
  readonly baseURL: string; // the provider's server endpoint — editable for every provider
  readonly hasKey: boolean; // whether the current provider has a usable key in the Keychain
  readonly semanticIndex: boolean; // keep an embedding index for semantic RAG
};

export type EmbedStatus = {
  readonly indexed: number;
  readonly total: number;
  readonly supported: boolean; // current provider exposes an embeddings API
};

export type ChatMessage = {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly sources?: readonly string[]; // page titles used as RAG context
};

export type AiResult = {
  readonly ok: boolean;
  readonly content: string;
  readonly error?: string;
};

// --- Stohr (cloud storage) ------------------------------------------------
// Narrative connects to a Stohr instance — self-hostable cloud storage with
// a federation layer. Auth is a bearer token: either a pasted `stohr_pat_…`
// personal access token, or the JWT from an email + password sign-in. The
// token lives in the OS Keychain; the server URL and a cached account
// snapshot live in the settings store.

export type StohrAccount = {
  readonly name: string;
  readonly email: string;
  readonly username: string;
  readonly isOwner: boolean;
};

export type StohrUsage = {
  readonly quotaBytes: number; // 0 = unlimited
  readonly usedBytes: number;
};

export type StohrStatus = {
  readonly connected: boolean;
  readonly baseURL: string;
  readonly account: StohrAccount | null; // cached — survives an offline open
  readonly usage: StohrUsage | null;
  readonly error: string | null; // why a stored connection failed to verify
};

// The outcome of a connect attempt. `mfaRequired` means the password was
// accepted but the account has 2FA — resubmit `mfaToken` with a code.
export type StohrConnectResult = {
  readonly ok: boolean;
  readonly mfaRequired: boolean;
  readonly mfaToken: string | null;
  readonly status: StohrStatus;
  readonly error: string | null;
};

// --- plugins --------------------------------------------------------------
// Narrative loads community plugins: a folder containing a
// `manifest.json`, a CommonJS `main.js`, and optional `styles.css` /
// `data.json`. The host owns the filesystem; the webview runs the code.

export type PluginManifest = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly minAppVersion?: string;
  readonly description: string;
  readonly author?: string;
  readonly authorUrl?: string;
  readonly fundingUrl?: string;
  readonly isDesktopOnly?: boolean;
};

// One row in the plugin manager — enough to list and toggle, no code.
export type InstalledPlugin = {
  readonly manifest: PluginManifest;
  readonly enabled: boolean;
  readonly hasStyles: boolean;
  readonly dir: string;
};

// Everything the webview needs to actually run a plugin.
export type PluginBundle = {
  readonly manifest: PluginManifest;
  readonly code: string;
  readonly css: string | null;
  readonly data: unknown; // parsed data.json, or null
};

// `requestUrl` is the plugin API's CORS-free fetch — it has to run on the host.
export type RequestUrlInput = {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly contentType?: string;
};

export type RequestUrlResult = {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly text: string;
  readonly base64: string; // body bytes, base64 — for arrayBuffer()
};
