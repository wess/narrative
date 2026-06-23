import { toast } from "@basket/ui/toast";
import {
  Bot,
  Cloud,
  FolderOpen,
  Info,
  Puzzle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PROVIDER_IDS, PROVIDERS } from "../../shared/providers.ts";
import type {
  AiConfig,
  AiHealth,
  AiProvider,
  AppStats,
  EmbedStatus,
  InstalledPlugin,
  StohrStatus,
  StohrSyncResult,
} from "../../shared/types.ts";
import { useRegistry } from "../plugins/registry.ts";
import { pluginRuntime, usePlugins } from "../plugins/runtime.ts";
import { actions } from "../state/actions.ts";
import { type Theme, useApp } from "../state/store.ts";

type Tab = "general" | "ai" | "stohr" | "about" | "plugins";

const THEME_LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", auto: "System" };

const TABS: { id: Tab; label: string; icon: typeof Info }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "ai", label: "AI", icon: Bot },
  { id: "stohr", label: "Stohr", icon: Cloud },
  { id: "plugins", label: "Plugins", icon: Puzzle },
  { id: "about", label: "About", icon: Info },
];

// Human-readable byte size — for Stohr storage usage.
const fmtBytes = (n: number): string => {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const GeneralTab = ({ theme }: { theme: Theme }) => (
  <div className="settings-section">
    <div className="settings-field">
      <span className="settings-label">Appearance</span>
      <div className="seg-control">
        {(["light", "dark", "auto"] as Theme[]).map((t) => (
          <button type="button" key={t} data-on={theme === t} onClick={() => actions.setTheme(t)}>
            {THEME_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
    <p className="settings-hint">System follows your macOS appearance setting automatically.</p>
    <div className="settings-field">
      <span className="settings-label">Notes folder backup</span>
      <div className="settings-field-row">
        <button type="button" className="settings-btn" onClick={() => void actions.backupVault()}>
          Back up notes
        </button>
        <button type="button" className="settings-btn" onClick={() => void actions.restoreVault()}>
          Restore backup
        </button>
      </div>
      <p className="settings-hint">
        Backups include pages, attachments, agents, channels, memory, project records, and local app
        data.
      </p>
    </div>
  </div>
);

const AiTab = ({
  config,
  health,
  embedStatus,
  mcpConfig,
}: {
  config: AiConfig | null;
  health: AiHealth | null;
  embedStatus: EmbedStatus | null;
  mcpConfig: { command: string; args: readonly string[] } | null;
}) => {
  const [model, setModel] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    setModel(config?.model ?? "");
    setBaseURL(config?.baseURL ?? "");
    setKeyInput("");
    setTest(null);
  }, [config]);

  if (!config) return <div className="settings-section">Loading…</div>;
  const provider = config.provider;
  const preset = PROVIDERS[provider];
  const usesLocal = provider === "ollama";

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    const result = await actions.checkAiHealth();
    setTest(result);
    setTesting(false);
  };

  const useLocal = () => {
    void actions.updateSettings({
      provider: "ollama",
      baseURL: PROVIDERS.ollama.defaultBaseURL,
      model: PROVIDERS.ollama.defaultModel,
    });
  };

  const useApiKey = () => {
    if (provider !== "ollama") return;
    void actions.updateSettings({
      provider: "openai",
      baseURL: PROVIDERS.openai.defaultBaseURL,
      model: PROVIDERS.openai.defaultModel,
    });
  };

  return (
    <div className="settings-section">
      <div className="settings-choice">
        <button type="button" data-on={usesLocal} onClick={useLocal}>
          <strong>Use local AI</strong>
          <span>Works with Ollama running on this computer.</span>
        </button>
        <button type="button" data-on={!usesLocal} onClick={useApiKey}>
          <strong>Use an API key</strong>
          <span>Connect a hosted provider and save the key in Keychain.</span>
        </button>
      </div>

      <p className="settings-hint">
        {usesLocal
          ? "Start Ollama on this computer, then check the assistant."
          : `Current provider: ${preset.label}. Save a key if this provider requires one.`}
      </p>

      {preset.usesKey ? (
        <div className="settings-field">
          <span className="settings-label">API key</span>
          {config.hasKey ? (
            <div className="settings-keyrow">
              <span className="settings-keyset">Saved in Keychain</span>
              <button
                type="button"
                className="settings-btn"
                onClick={() => void actions.clearAiKey(provider)}
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="settings-keyrow">
              <input
                className="settings-input"
                type="password"
                value={keyInput}
                placeholder={preset.keyPlaceholder}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button
                type="button"
                className="settings-btn settings-btn-accent"
                disabled={!keyInput.trim()}
                onClick={() => {
                  void actions.setAiKey(provider, keyInput);
                  setKeyInput("");
                }}
              >
                Save key
              </button>
            </div>
          )}
          {preset.keyHint ? <p className="settings-hint">{preset.keyHint}</p> : null}
        </div>
      ) : null}

      <div className="settings-field settings-field-row">
        <button type="button" className="settings-btn" disabled={testing} onClick={runTest}>
          {testing ? "Checking…" : "Check assistant"}
        </button>
        {test ? (
          <span className={test.ok ? "settings-test ok" : "settings-test err"}>{test.message}</span>
        ) : null}
      </div>

      {health ? (
        <div className="settings-health">
          <div data-ok={health.configured}>
            <span>Setup</span>
            <strong>{health.configured ? "Ready" : "Needs attention"}</strong>
          </div>
          <div data-ok={!health.keyRequired || health.keyPresent}>
            <span>API key</span>
            <strong>
              {health.keyRequired ? (health.keyPresent ? "Saved" : "Missing") : "Not required"}
            </strong>
          </div>
          <div data-ok={health.chat.checked ? health.chat.ok : health.configured}>
            <span>Chat</span>
            <strong>
              {health.chat.checked
                ? health.chat.ok
                  ? `OK${health.chat.latencyMs === null ? "" : ` · ${health.chat.latencyMs}ms`}`
                  : "Failed"
                : "Not checked"}
            </strong>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="settings-disclosure"
        data-open={advancedOpen}
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        Advanced AI settings
      </button>

      {advancedOpen ? (
        <div className="settings-advanced">
          <div className="settings-field">
            <span className="settings-label">Provider</span>
            <select
              className="settings-select"
              value={provider}
              onChange={(e) =>
                void actions.updateSettings({ provider: e.target.value as AiProvider })
              }
            >
              {PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {PROVIDERS[id].label}
                </option>
              ))}
            </select>
          </div>

          <div className="settings-field">
            <span className="settings-label">Server URL</span>
            <input
              className="settings-input"
              value={baseURL}
              placeholder={preset.defaultBaseURL || "https://your-server/v1"}
              onChange={(e) => setBaseURL(e.target.value)}
              onBlur={() => {
                if (baseURL !== config.baseURL) void actions.updateSettings({ baseURL });
              }}
            />
          </div>

          <div className="settings-field">
            <span className="settings-label">Model</span>
            <input
              className="settings-input"
              value={model}
              placeholder={preset.defaultModel || "model name"}
              onChange={(e) => setModel(e.target.value)}
              onBlur={() => {
                if (model.trim() && model !== config.model) void actions.updateSettings({ model });
              }}
            />
          </div>

          {health ? (
            <div className="settings-health">
              <div data-ok={health.configured}>
                <span>Setup</span>
                <strong>{health.configured ? "Ready" : "Needs attention"}</strong>
              </div>
              <div data-ok={!health.keyRequired || health.keyPresent}>
                <span>API key</span>
                <strong>
                  {health.keyRequired ? (health.keyPresent ? "Saved" : "Missing") : "Not required"}
                </strong>
              </div>
              <div data-ok={Boolean(health.baseURL)}>
                <span>Server</span>
                <strong>{health.baseURL || "Missing"}</strong>
              </div>
              <div data-ok={Boolean(health.model)}>
                <span>Model</span>
                <strong>{health.model || "Missing"}</strong>
              </div>
              <div data-ok={health.chat.checked ? health.chat.ok : health.configured}>
                <span>Chat</span>
                <strong>
                  {health.chat.checked
                    ? health.chat.ok
                      ? `OK${health.chat.latencyMs === null ? "" : ` · ${health.chat.latencyMs}ms`}`
                      : "Failed"
                    : "Not checked"}
                </strong>
              </div>
              <div data-ok={health.embeddings.supported}>
                <span>Embeddings</span>
                <strong>
                  {health.embeddings.supported ? health.embeddings.model || "Supported" : "No"}
                </strong>
              </div>
            </div>
          ) : null}

          <div className="settings-field">
            <span className="settings-label">Search all notes with AI</span>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={config.semanticIndex}
                onChange={(e) => void actions.setSemanticIndex(e.target.checked)}
              />
              <span>Build a semantic index so the assistant can search all notes by meaning</span>
            </label>
            <div className="settings-field-row">
              <button
                type="button"
                className="settings-btn"
                disabled={!embedStatus?.supported}
                onClick={() => void actions.reindexVault()}
              >
                Reindex notes
              </button>
              {embedStatus ? (
                <span className="settings-test">
                  {embedStatus.supported
                    ? `${embedStatus.indexed} / ${embedStatus.total} pages indexed`
                    : "No embeddings API for this provider — AI search uses keyword search."}
                </span>
              ) : null}
            </div>
          </div>

          <div className="settings-field">
            <span className="settings-label">Project folder access</span>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={config.projectWrite}
                onChange={(e) => void actions.setProjectWrite(e.target.checked)}
              />
              <span>Allow agents to edit files inside registered project folders</span>
            </label>
            <p className="settings-hint">
              Agents can always inspect registered project trees. File writes stay blocked until
              this is enabled.
            </p>
          </div>

          <p className="settings-hint">
            {preset.usesKey
              ? "Your API key is stored in the macOS Keychain, never in a plain file."
              : "Ollama runs entirely on your machine — start the server with `ollama serve`."}
            {" The assistant's “Search my notes” toggle retrieves relevant pages either way."}
          </p>

          <div className="settings-field">
            <span className="settings-label">MCP server</span>
            <p className="settings-hint">
              Let external AI apps search and read this notes folder. Add this to your MCP client
              config:
            </p>
            {mcpConfig ? (
              <pre className="settings-code">
                {JSON.stringify(
                  {
                    mcpServers: {
                      bethink: { command: mcpConfig.command, args: mcpConfig.args },
                    },
                  },
                  null,
                  2,
                )}
              </pre>
            ) : null}
            <button
              type="button"
              className="settings-btn"
              onClick={() => void actions.copyMcpConfig()}
            >
              Copy config
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

type StohrAuthMethod = "token" | "password";

// Connect Bethink to a Stohr instance — self-hostable cloud storage.
const StohrTab = ({ status }: { status: StohrStatus | null }) => {
  const [baseURL, setBaseURL] = useState("https://stohr.io/api");
  const [method, setMethod] = useState<StohrAuthMethod>("password");
  const [token, setToken] = useState("");
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<StohrSyncResult | null>(null);

  // Re-verify the stored connection each time the tab is opened.
  useEffect(() => {
    void actions.loadStohr();
  }, []);

  useEffect(() => {
    if (status?.baseURL) setBaseURL(status.baseURL);
    setError(status?.error ?? null);
  }, [status]);

  if (!status) return <div className="settings-section">Loading…</div>;

  if (status.connected && status.account) {
    const a = status.account;
    const u = status.usage;
    const pct = u && u.quotaBytes > 0 ? Math.min(100, (u.usedBytes / u.quotaBytes) * 100) : 0;
    return (
      <div className="settings-section">
        <div className="stohr-account">
          <Cloud size={20} />
          <div className="stohr-account-info">
            <strong>
              {a.name}
              {a.isOwner ? <span className="stohr-badge">owner</span> : null}
            </strong>
            <span>{a.email}</span>
            <span>{status.baseURL}</span>
          </div>
        </div>

        {u ? (
          <div className="settings-field">
            <span className="settings-label">Storage</span>
            {u.quotaBytes > 0 ? (
              <>
                <div className="stohr-bar">
                  <div className="stohr-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="settings-hint">
                  {fmtBytes(u.usedBytes)} of {fmtBytes(u.quotaBytes)} used
                </span>
              </>
            ) : (
              <span className="settings-hint">{fmtBytes(u.usedBytes)} used — unlimited quota</span>
            )}
          </div>
        ) : null}

        <div className="settings-field">
          <span className="settings-label">Notes sync</span>
          <div className="settings-field-row">
            <button
              type="button"
              className="settings-btn settings-btn-accent"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                setSyncResult(await actions.syncStohr());
                setSyncing(false);
              }}
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            {syncResult ? (
              <span className={syncResult.ok ? "settings-test ok" : "settings-test err"}>
                {syncResult.ok
                  ? `${syncResult.pulled} pulled · ${syncResult.pushed} pushed${
                      syncResult.deleted > 0 ? ` · ${syncResult.deleted} deleted` : ""
                    }`
                  : (syncResult.error ?? "Sync failed")}
              </span>
            ) : null}
          </div>
          {syncResult && syncResult.conflicts.length > 0 ? (
            <p className="settings-hint">
              Both sides changed these — the Stohr copy was saved beside the local one:{" "}
              {syncResult.conflicts.join(", ")}
            </p>
          ) : null}
        </div>

        <div className="settings-field settings-field-row">
          <button
            type="button"
            className="settings-btn"
            onClick={() => void actions.disconnectStohr()}
          >
            Disconnect
          </button>
        </div>

        <p className="settings-hint">
          Bethink keeps this notes folder's Markdown and attachments in two-way sync with your Stohr
          account — on launch, right after you connect, every couple of minutes, and whenever you
          press Sync now.
        </p>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    if (mfaToken) {
      const result = await actions.connectStohrMfa(baseURL, mfaToken, mfaCode.trim());
      if (result.ok) {
        setMfaToken(null);
        setMfaCode("");
        setPassword("");
      } else {
        setError(result.error ?? "Couldn't verify that code.");
      }
    } else if (method === "token") {
      const result = await actions.connectStohrToken(baseURL, token);
      if (result.ok) setToken("");
      else setError(result.error ?? "Couldn't connect with that token.");
    } else {
      const result = await actions.connectStohrPassword(baseURL, identity.trim(), password);
      if (result.mfaRequired && result.mfaToken) setMfaToken(result.mfaToken);
      else if (result.ok) setPassword("");
      else setError(result.error ?? "Couldn't sign in.");
    }
    setBusy(false);
  };

  const canSubmit = mfaToken
    ? mfaCode.trim().length > 0
    : method === "token"
      ? token.trim().length > 0
      : identity.trim().length > 0 && password.length > 0;

  return (
    <div className="settings-section">
      <div className="settings-field">
        <span className="settings-label">Server URL</span>
        <input
          className="settings-input"
          value={baseURL}
          placeholder="https://stohr.io/api"
          onChange={(e) => setBaseURL(e.target.value)}
        />
      </div>

      {mfaToken ? (
        <div className="settings-field">
          <span className="settings-label">Two-factor code</span>
          <input
            className="settings-input"
            value={mfaCode}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            onChange={(e) => setMfaCode(e.target.value)}
          />
          <p className="settings-hint">
            Enter the 6-digit code from your authenticator app, or a backup code.
          </p>
        </div>
      ) : (
        <>
          <div className="settings-field">
            <span className="settings-label">Sign in with</span>
            <div className="seg-control">
              <button
                type="button"
                data-on={method === "password"}
                onClick={() => setMethod("password")}
              >
                Email &amp; password
              </button>
              <button type="button" data-on={method === "token"} onClick={() => setMethod("token")}>
                Access token
              </button>
            </div>
          </div>

          {method === "token" ? (
            <div className="settings-field">
              <span className="settings-label">Access token</span>
              <input
                className="settings-input"
                type="password"
                value={token}
                placeholder="stohr_pat_…"
                onChange={(e) => setToken(e.target.value)}
              />
              <p className="settings-hint">
                Create a personal access token in Stohr → Settings → Apps.
              </p>
            </div>
          ) : (
            <>
              <div className="settings-field">
                <span className="settings-label">Email or username</span>
                <input
                  className="settings-input"
                  value={identity}
                  placeholder="you@example.com"
                  onChange={(e) => setIdentity(e.target.value)}
                />
              </div>
              <div className="settings-field">
                <span className="settings-label">Password</span>
                <input
                  className="settings-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmit && !busy) void submit();
                  }}
                />
              </div>
            </>
          )}
        </>
      )}

      <div className="settings-field settings-field-row">
        <button
          type="button"
          className="settings-btn settings-btn-accent"
          disabled={busy || !canSubmit}
          onClick={() => void submit()}
        >
          {busy ? "Connecting…" : mfaToken ? "Verify" : "Connect"}
        </button>
        {mfaToken ? (
          <button
            type="button"
            className="settings-btn"
            disabled={busy}
            onClick={() => {
              setMfaToken(null);
              setMfaCode("");
              setError(null);
            }}
          >
            Cancel
          </button>
        ) : null}
        {error ? <span className="settings-test err">{error}</span> : null}
      </div>

      <p className="settings-hint">
        Stohr is self-hostable cloud storage with a federation layer. Connect an account to keep
        this notes folder's files synced to it both ways. Your token is stored in the macOS
        Keychain, never in a plain file.
      </p>
    </div>
  );
};

const AboutTab = ({ stats }: { stats: AppStats | null }) => (
  <div className="settings-section settings-about">
    <div className="about-mark">◆</div>
    <h2>Bethink</h2>
    <p className="about-tag">A personal knowledge base</p>
    <p className="about-meta">Your notes, in plain Markdown — portable and yours</p>
    {stats ? (
      <div className="about-stats">
        <div>
          <strong>{stats.pages}</strong>
          <span>pages</span>
        </div>
        <div>
          <strong>{stats.words.toLocaleString()}</strong>
          <span>words</span>
        </div>
        <div>
          <strong>{stats.links}</strong>
          <span>links</span>
        </div>
        <div>
          <strong>{stats.tags}</strong>
          <span>tags</span>
        </div>
      </div>
    ) : null}
  </div>
);

// The community-plugins manager: install / enable / disable / remove.
const PluginsTab = () => {
  const { installed, status } = usePlugins();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const visible = term
    ? installed.filter((plugin) =>
        [
          plugin.manifest.name,
          plugin.manifest.description,
          plugin.manifest.author,
          plugin.manifest.id,
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(term)),
      )
    : installed;
  const enabled = installed.filter((plugin) => plugin.enabled).length;
  const failed = installed.filter((plugin) => status[plugin.manifest.id]?.ok === false).length;

  const toggle = async (plugin: InstalledPlugin) => {
    const next = !plugin.enabled;
    await pluginRuntime.setEnabled(plugin.manifest.id, next);
    if (next) {
      toast.info(`${plugin.manifest.name} enabled`, {
        description: "Community plugins can read and modify your notes and access the network.",
      });
    }
  };

  const install = async () => {
    setBusy(true);
    const result = await pluginRuntime.installFromDialog();
    setBusy(false);
    if (result.message) {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    }
  };

  const remove = async (plugin: InstalledPlugin) => {
    await pluginRuntime.removePlugin(plugin.manifest.id);
    toast.success(`${plugin.manifest.name} removed`);
  };

  return (
    <div className="settings-section">
      <p className="settings-hint">
        Bethink loads community plugins from its plugins folder. Plugins run with full access to
        your notes and the network — only enable ones you trust.
      </p>

      <div className="plugin-market-head">
        <div>
          <strong>{installed.length}</strong>
          <span>Installed</span>
        </div>
        <div>
          <strong>{enabled}</strong>
          <span>Enabled</span>
        </div>
        <div data-warn={failed > 0}>
          <strong>{failed}</strong>
          <span>Failed</span>
        </div>
      </div>

      <div className="settings-field settings-field-row">
        <button type="button" className="settings-btn" disabled={busy} onClick={install}>
          Install from folder…
        </button>
        <button
          type="button"
          className="settings-btn"
          onClick={() => void pluginRuntime.openPluginsDir()}
        >
          <FolderOpen size={14} /> Open plugins folder
        </button>
        <button type="button" className="settings-btn" onClick={() => void pluginRuntime.refresh()}>
          <RefreshCw size={14} /> Rescan
        </button>
      </div>

      <div className="plugin-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search installed plugins"
        />
      </div>

      {installed.length === 0 ? (
        <p className="settings-hint">
          No plugins installed yet. Drop a plugin folder (one with a <code>manifest.json</code> and{" "}
          <code>main.js</code>) into the plugins folder, then Rescan.
        </p>
      ) : visible.length === 0 ? (
        <p className="settings-hint">No plugins match this search.</p>
      ) : (
        <div className="plugin-list">
          {visible.map((plugin) => {
            const state = status[plugin.manifest.id];
            return (
              <div className="plugin-row" key={plugin.manifest.id} data-enabled={plugin.enabled}>
                <div className="plugin-row-info">
                  <div className="plugin-row-title">
                    <strong>{plugin.manifest.name}</strong>
                    <span className="plugin-row-version">v{plugin.manifest.version}</span>
                    <span className="plugin-row-version">
                      {plugin.hasStyles ? "CSS" : "No CSS"}
                    </span>
                    {state && !state.ok ? (
                      <span className="plugin-row-error" title={state.error}>
                        failed to load
                      </span>
                    ) : plugin.enabled ? (
                      <span className="plugin-row-ok">loaded</span>
                    ) : null}
                  </div>
                  {plugin.manifest.description ? (
                    <p className="plugin-row-desc">{plugin.manifest.description}</p>
                  ) : null}
                  {plugin.manifest.author ? (
                    <p className="plugin-row-author">by {plugin.manifest.author}</p>
                  ) : null}
                  <p className="plugin-row-author">{plugin.dir}</p>
                  {state && !state.ok && state.error ? (
                    <p className="plugin-row-error-detail">{state.error}</p>
                  ) : null}
                </div>
                <div className="plugin-row-actions">
                  <label className="settings-check">
                    <input
                      type="checkbox"
                      checked={plugin.enabled}
                      onChange={() => void toggle(plugin)}
                    />
                    <span>{plugin.enabled ? "Enabled" : "Disabled"}</span>
                  </label>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Remove plugin"
                    onClick={() => void remove(plugin)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Mounts a plugin's own `PluginSettingTab` — calls `display()` on show and
// `hide()` on teardown, the way the built-in settings tabs work.
const PluginSettingsHost = ({ entryId }: { entryId: string }) => {
  const registry = useRegistry();
  const entry = registry.settingTabs.find((s) => s.id === entryId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host || !entry) return;
    host.replaceChildren(entry.tab.containerEl);
    try {
      entry.tab.display();
    } catch (e) {
      console.error("[narrative] plugin settings display() threw", e);
    }
    return () => {
      try {
        entry.tab.hide();
      } catch {
        // ignore teardown failures
      }
    };
  }, [entry]);

  if (!entry) return <div className="settings-section">These plugin settings are unavailable.</div>;
  return <div className="settings-section" ref={ref} />;
};

export const Settings = () => {
  const {
    settingsOpen,
    settingsTab,
    theme,
    aiConfig,
    aiHealth,
    stats,
    embedStatus,
    mcpConfig,
    stohr,
  } = useApp();
  const registry = useRegistry();
  const tab = settingsTab;

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") actions.closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  if (!settingsOpen) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: click-outside-to-dismiss backdrop; Escape also closes the dialog for keyboard users
    <div
      className="settings-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) actions.closeSettings();
      }}
    >
      <div className="settings">
        <div className="settings-toolbar">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              className="settings-tab"
              data-on={tab === t.id}
              onClick={() => actions.setSettingsTab(t.id)}
            >
              <t.icon size={16} />
              <span>{t.label}</span>
            </button>
          ))}
          {registry.settingTabs.length > 0 ? <span className="settings-divider" /> : null}
          {registry.settingTabs.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className="settings-tab"
              data-on={tab === `pst:${entry.id}`}
              onClick={() => actions.setSettingsTab(`pst:${entry.id}`)}
            >
              <Puzzle size={16} />
              <span>{entry.name}</span>
            </button>
          ))}
          <span className="settings-spacer" />
          <button
            type="button"
            className="settings-close"
            title="Close"
            onClick={() => actions.closeSettings()}
          >
            <X size={15} />
          </button>
        </div>
        <div className="settings-body">
          {tab === "general" ? <GeneralTab theme={theme} /> : null}
          {tab === "ai" ? (
            <AiTab
              config={aiConfig}
              health={aiHealth}
              embedStatus={embedStatus}
              mcpConfig={mcpConfig}
            />
          ) : null}
          {tab === "stohr" ? <StohrTab status={stohr} /> : null}
          {tab === "plugins" ? <PluginsTab /> : null}
          {tab === "about" ? <AboutTab stats={stats} /> : null}
          {tab.startsWith("pst:") ? <PluginSettingsHost entryId={tab.slice(4)} /> : null}
        </div>
      </div>
    </div>
  );
};
