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

export type VaultBackupResult = {
  readonly path: string | null;
  readonly files: number;
};

export type VaultRestoreResult = {
  readonly root: string | null;
  readonly files: number;
  readonly error: string | null;
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

export type SearchHitKind =
  | "page"
  | "agent"
  | "channel"
  | "project"
  | "memory"
  | "capture"
  | "run"
  | "transcript"
  | "proposal";

export type SearchHit = {
  readonly id: number;
  readonly kind: SearchHitKind;
  readonly target: string;
  readonly title: string;
  readonly icon: string;
  readonly subtitle: string;
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
  readonly projectWrite: boolean; // allow agents to write registered project folders
};

export type EmbedStatus = {
  readonly indexed: number;
  readonly total: number;
  readonly supported: boolean; // current provider exposes an embeddings API
};

export type AiHealth = {
  readonly provider: AiProvider;
  readonly label: string;
  readonly protocol: string;
  readonly model: string;
  readonly baseURL: string;
  readonly keyRequired: boolean;
  readonly keyPresent: boolean;
  readonly configured: boolean;
  readonly chat: {
    readonly checked: boolean;
    readonly ok: boolean;
    readonly latencyMs: number | null;
    readonly message: string;
  };
  readonly embeddings: {
    readonly supported: boolean;
    readonly model: string | null;
  };
};

export type ChatMessage = {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly sources?: readonly string[]; // page titles used as RAG context
  readonly toolCalls?: readonly ToolCall[];
  readonly agentSlug?: string; // which agent produced/ran this turn
};

export type AiResult = {
  readonly ok: boolean;
  readonly content: string;
  readonly error?: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly stopReason?: AgentStopReason;
  readonly iterations?: number;
};

export type AgentStopReason = "complete" | "maxiterations" | "cancelled" | "error";
export type AgentRunStatus = "ok" | "error" | "cancelled" | "maxiterations";

export type AgentRun = {
  readonly id: number;
  readonly requestId: string;
  readonly agentSlug: string | null;
  readonly channelSlug: string | null;
  readonly userPrompt: string;
  readonly status: AgentRunStatus;
  readonly content: string;
  readonly error: string;
  readonly toolCalls: readonly ToolCall[];
  readonly stopReason: AgentStopReason;
  readonly iterations: number;
  readonly durationMs: number;
  readonly createdAt: string;
};

export type MemoryScope = "global" | "channel";

export type MemoryRecord = {
  readonly id: number;
  readonly scope: MemoryScope;
  readonly channelSlug: string | null;
  readonly agentSlug: string | null;
  readonly kind: string;
  readonly content: string;
  readonly source: string;
  readonly weight: number;
  readonly pinned: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

// --- agent IDE ------------------------------------------------------------
// Bethink is an Agent IDE: agents and commands live in the vault as plain
// Markdown files with frontmatter, the host parses them, and the chat runs
// a streaming loop that lets the model call vault tools via fenced blocks.

// A tool the host exposes for agents to call. The `schema` is a small JSON
// shape the model is asked to follow; we keep it as a string (TOML-ish hint)
// so the system prompt stays readable.
export type AgentToolDef = {
  readonly name: string; // e.g. "vault.search"
  readonly description: string; // one-liner
  readonly usage: string; // JSON shape hint shown in the system prompt
};

// A native Bethink agent — `.narrative/agents/<slug>.md` with frontmatter.
export type AgentDef = {
  readonly slug: string; // file name without extension
  readonly path: string; // vault-relative path to the source file
  readonly name: string; // display name (frontmatter `name`)
  readonly description: string;
  readonly icon: string; // single emoji/glyph for the picker
  readonly model: string | null; // overrides app default if set
  readonly provider: AiProvider | null; // overrides app default if set
  readonly tools: readonly string[]; // tool-name allowlist
  readonly systemPrompt: string; // body, after frontmatter
};

export type AgentImportResult = {
  readonly importedAgents: number;
  readonly importedChannels: number;
  readonly skipped: number;
};

// A reusable command — `.narrative/commands/<slug>.md`. Runs as a one-shot
// agent turn. If `agent` is set, that agent's tools/model/prompt apply;
// otherwise the command's own `tools`/`model` apply and the system prompt
// is the default.
export type CommandDef = {
  readonly slug: string;
  readonly path: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly agent: string | null; // slug of an agent, or null
  readonly tools: readonly string[];
  readonly model: string | null;
  readonly provider: AiProvider | null;
  readonly prompt: string; // body — sent as the user turn
};

export type ChannelMode = "roundtable" | "focus" | "manual";

// A project/task room — `.narrative/channels/<slug>.md` with frontmatter.
// Channels collect one or more agents behind a named working context.
export type ChannelDef = {
  readonly slug: string;
  readonly path: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly agents: readonly string[]; // agent slugs assigned to the channel
  readonly mode: ChannelMode; // how chat routes messages to members
  readonly context: readonly string[]; // linked page titles / folders, for later retrieval
  readonly projects: readonly string[]; // linked project slugs
  readonly brief: string; // body, after frontmatter
};

export type ChannelMessage = {
  readonly id: number;
  readonly channelSlug: string;
  readonly agentSlug: string | null;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly toolCalls: readonly ToolCall[];
  readonly createdAt: string;
};

export type ProjectDef = {
  readonly slug: string;
  readonly name: string;
  readonly path: string;
  readonly description: string;
  readonly channelSlug: string | null;
  readonly allowRead: boolean;
  readonly allowWrite: boolean;
  readonly allowRun: boolean;
  readonly approvedCommands: readonly string[];
};

export type ProjectFileNode = {
  readonly name: string;
  readonly path: string;
  readonly kind: "file" | "folder";
  readonly children: readonly ProjectFileNode[];
};

export type ProjectRun = {
  readonly id: number;
  readonly projectSlug: string;
  readonly command: string;
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly createdAt: string;
};

export type ProjectSnapshot = {
  readonly id: number;
  readonly projectSlug: string;
  readonly path: string;
  readonly content: string;
  readonly reason: string;
  readonly createdAt: string;
};

export type ProjectChangedFile = {
  readonly path: string;
  readonly latestSnapshotId: number;
  readonly changedAt: string;
};

export type ProjectDiff = {
  readonly path: string;
  readonly snapshotId: number;
  readonly diff: string;
};

export type ProjectFileContent = {
  readonly path: string;
  readonly content: string;
};

export type ProjectScript = {
  readonly name: string;
  readonly command: string;
  readonly safe: boolean;
};

export type ProjectAnalysis = {
  readonly projectSlug: string;
  readonly projectName: string;
  readonly stack: readonly string[];
  readonly packageManager: string | null;
  readonly scripts: readonly ProjectScript[];
  readonly recommendedCommands: readonly string[];
  readonly approvedCommands: readonly string[];
  readonly importantFiles: readonly string[];
  readonly warnings: readonly string[];
};

export type ProjectWriteProposalStatus = "pending" | "approved" | "rejected";

export type ProjectWriteProposal = {
  readonly id: number;
  readonly projectSlug: string;
  readonly path: string;
  readonly content: string;
  readonly diff: string | null;
  readonly reason: string;
  readonly reviewComment: string;
  readonly status: ProjectWriteProposalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type KanbanStatus = "backlog" | "ready" | "doing" | "review" | "done";
export type KanbanPriority = "low" | "normal" | "high";

export type KanbanCard = {
  readonly id: number;
  readonly projectSlug: string | null;
  readonly channelSlug: string | null;
  readonly title: string;
  readonly description: string;
  readonly status: KanbanStatus;
  readonly priority: KanbanPriority;
  readonly agentSlug: string | null;
  readonly pageId: number | null;
  readonly sortKey: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type KanbanBoard = {
  readonly projectSlug: string | null;
  readonly channelSlug: string | null;
  readonly columns: readonly KanbanStatus[];
  readonly cards: readonly KanbanCard[];
};

export type WorkflowStepKind =
  | "agent"
  | "search"
  | "createpage"
  | "proposefile"
  | "runcommand"
  | "approval"
  | "webhook";

export type WorkflowTriggerKind = "manual" | "schedule" | "webhook" | "integration";
export type WorkflowRunStatus = "queued" | "running" | "waiting" | "ok" | "error" | "cancelled";

export type WorkflowConfig = Readonly<Record<string, unknown>>;

export type WorkflowStep = {
  readonly id: string;
  readonly kind: WorkflowStepKind;
  readonly name: string;
  readonly config: WorkflowConfig;
  readonly x: number;
  readonly y: number;
};

export type WorkflowTrigger = {
  readonly id: string;
  readonly kind: WorkflowTriggerKind;
  readonly name: string;
  readonly config: WorkflowConfig;
  readonly enabled: boolean;
};

export type Workflow = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly projectSlug: string | null;
  readonly channelSlug: string | null;
  readonly steps: readonly WorkflowStep[];
  readonly triggers: readonly WorkflowTrigger[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type WorkflowStepResult = {
  readonly stepId: string;
  readonly status: WorkflowRunStatus;
  readonly output: string;
  readonly error: string;
  readonly durationMs: number;
};

export type WorkflowRun = {
  readonly id: number;
  readonly workflowSlug: string;
  readonly status: WorkflowRunStatus;
  readonly triggerKind: WorkflowTriggerKind;
  readonly input: string;
  readonly output: string;
  readonly error: string;
  readonly stepResults: readonly WorkflowStepResult[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type HarnessScenario = {
  readonly slug: string;
  readonly name: string;
  readonly agentSlug: string | null;
  readonly channelSlug: string | null;
  readonly prompt: string;
  readonly expected: string;
  readonly tools: readonly string[];
  readonly maxIterations: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type HarnessRunStatus = "pass" | "fail" | "error";

export type HarnessRun = {
  readonly id: number;
  readonly scenarioSlug: string;
  readonly agentRunId: number | null;
  readonly status: HarnessRunStatus;
  readonly score: number;
  readonly notes: string;
  readonly stopReason: AgentStopReason;
  readonly iterations: number;
  readonly createdAt: string;
};

export type PropertySubjectType = "page" | "project" | "agent" | "channel" | "workflow";

export type PropertyValue = {
  readonly subjectType: PropertySubjectType;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly key: string;
  readonly value: string;
  readonly source: string;
  readonly updatedAt: string;
};

export type BaseRow = {
  readonly subjectType: PropertySubjectType;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly values: Readonly<Record<string, string>>;
  readonly updatedAt: string;
};

export type BaseView = {
  readonly columns: readonly string[];
  readonly rows: readonly BaseRow[];
  readonly updatedAt: string;
};

export type CanvasNode = {
  readonly id: string;
  readonly subjectType: PropertySubjectType;
  readonly subjectId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type CanvasEdge = {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

export type CanvasView = {
  readonly nodes: readonly CanvasNode[];
  readonly edges: readonly CanvasEdge[];
  readonly availableNodes: readonly CanvasNode[];
  readonly updatedAt: string;
};

export type WebCaptureInput = {
  readonly url: string;
  readonly title?: string;
  readonly notes?: string;
};

export type WebCapture = {
  readonly id: number;
  readonly url: string;
  readonly title: string;
  readonly pageId: number;
  readonly pageTitle: string;
  readonly createdAt: string;
};

export type ToolCallStatus = "pending" | "ok" | "error";

// One tool invocation inside an assistant turn. Streamed to the webview as
// it transitions pending -> ok/error so the chat can render it live.
export type ToolCall = {
  readonly id: string;
  readonly name: string;
  readonly args: unknown;
  readonly status: ToolCallStatus;
  readonly result?: unknown;
  readonly error?: string;
};

// --- Stohr (cloud storage) ------------------------------------------------
// Bethink connects to a Stohr instance — self-hostable cloud storage with
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

// The outcome of a vault sync — a two-way reconcile of the vault folder with
// the connected Stohr account. `conflicts` lists vault-relative paths where
// both sides changed (the remote copy is kept beside the local one) or that
// failed to transfer.
export type StohrSyncResult = {
  readonly ok: boolean;
  readonly pulled: number; // files downloaded from Stohr
  readonly pushed: number; // files uploaded to Stohr
  readonly deleted: number; // files removed on one side to match the other
  readonly conflicts: readonly string[];
  readonly error: string | null;
};

// --- plugins --------------------------------------------------------------
// Bethink loads community plugins: a folder containing a
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
