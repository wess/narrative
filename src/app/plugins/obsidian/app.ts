// `App` — the object every plugin gets handed and reaches everything else
// through (`this.app.vault`, `this.app.workspace`, …). We assemble it from the
// Vault / MetadataCache / Workspace shims and add the smaller surfaces:
// `fileManager`, `keymap`, and the `plugins` / `commands` registries. The
// plugin runtime fills in `plugins.enablePlugin` etc. after construction.

import { invoke } from "@basket/ipc/client";
import * as ch from "../../../shared/channels.ts";
import type { PluginManifest } from "../../../shared/types.ts";
import { actions } from "../../state/actions.ts";
import { getState } from "../../state/store.ts";
import type { Command } from "../registry.ts";
import { type RegisteredCommand, registry } from "../registry.ts";
import { Editor } from "./editor.ts";
import { Keymap, Scope } from "./keymap.ts";
import { MetadataCache } from "./metadata.ts";
import type { Plugin } from "./plugin.ts";
import { parseYaml, stringifyYaml } from "./util.ts";
import { type TAbstractFile, TFile, TFolder, Vault } from "./vault.ts";
import { Workspace } from "./workspace.ts";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

// `app.fileManager` — higher-level file operations grouped separately
// from the raw `Vault`.
class FileManager {
  constructor(private vault: Vault) {}

  // Read-modify-write a file's YAML frontmatter. The mutation is applied to a
  // plain object; we re-serialise and splice it back into the body.
  async processFrontMatter(
    file: TFile,
    fn: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void> {
    const body = await this.vault.read(file);
    const match = FRONTMATTER_RE.exec(body);
    const frontmatter = match ? parseYaml(match[1] ?? "") : {};
    fn(frontmatter);
    const rest = match ? body.slice(match[0].length) : body;
    const yaml = stringifyYaml(frontmatter).trimEnd();
    const next = `---\n${yaml}\n---\n${rest.startsWith("\n") ? rest : `\n${rest}`}`;
    await this.vault.modify(file, next);
  }

  generateMarkdownLink(file: TFile, _sourcePath: string, subpath?: string, alias?: string): string {
    const target = `${file.basename}${subpath ?? ""}`;
    return alias ? `[[${target}|${alias}]]` : `[[${target}]]`;
  }

  getNewFileParent(_sourcePath: string): TFolder {
    return this.vault.getRoot();
  }

  async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
    await this.vault.rename(file, newPath);
  }

  async trashFile(file: TAbstractFile): Promise<void> {
    await this.vault.trash(file);
  }

  getAvailablePathForAttachment(filename: string): Promise<string> {
    return Promise.resolve(filename);
  }
}

// `app.commands` — the command registry. Backed by the shared `registry`.
const buildCommands = () => {
  // Run a registered command, honouring the callback variants. Returns true
  // when the command actually ran.
  const execute = (cmd: RegisteredCommand, checking: boolean): boolean => {
    if (cmd.checkCallback) {
      const result = cmd.checkCallback(checking);
      if (checking) return result === true;
      return true;
    }
    if (cmd.editorCheckCallback || cmd.editorCallback) {
      const id = getState().activeId;
      if (id === null) return false;
      const editor = new Editor(getState().activePage?.body ?? "", (value) => {
        void actions.savePage({ id, body: value });
      });
      if (cmd.editorCheckCallback) {
        const result = cmd.editorCheckCallback(checking, editor);
        if (checking) return result === true;
        return true;
      }
      if (checking) return true;
      cmd.editorCallback?.(editor);
      return true;
    }
    if (checking) return true;
    cmd.callback?.();
    return true;
  };

  return {
    get commands(): Record<string, RegisteredCommand> {
      const out: Record<string, RegisteredCommand> = {};
      for (const cmd of registry.commands()) out[cmd.id] = cmd;
      return out;
    },
    executeCommandById(id: string): boolean {
      const cmd = registry.commands().find((c) => c.id === id);
      if (!cmd) return false;
      if (!execute(cmd, true)) return false;
      return execute(cmd, false);
    },
    listCommands(): RegisteredCommand[] {
      return [...registry.commands()];
    },
    findCommand(id: string): RegisteredCommand | undefined {
      return registry.commands().find((c) => c.id === id);
    },
    addCommand(command: Command): void {
      registry.addCommand("app", command);
    },
    removeCommand(id: string): void {
      registry.removeCommand(id);
    },
  };
};

export type PluginsApi = {
  plugins: Record<string, Plugin>;
  manifests: Record<string, PluginManifest>;
  enabledPlugins: Set<string>;
  getPlugin: (id: string) => Plugin | null;
  enablePlugin: (id: string) => Promise<void>;
  disablePlugin: (id: string) => Promise<void>;
};

export class App {
  vault: Vault;
  workspace: Workspace;
  metadataCache: MetadataCache;
  fileManager: FileManager;
  keymap = Keymap;
  scope: Scope;
  lastEvent: MouseEvent | KeyboardEvent | null = null;

  // Filled in by the plugin runtime once plugins start loading.
  plugins: PluginsApi;
  commands = buildCommands();
  internalPlugins = {
    plugins: {} as Record<string, unknown>,
    getEnabledPluginById: (_id: string) => null,
    getPluginById: (_id: string) => null,
  };
  setting = {
    open: (): void => actions.openSettings(),
    openTabById: (_id: string): void => actions.openSettings(),
    close: (): void => actions.closeSettings(),
  };

  constructor() {
    this.vault = new Vault();
    this.metadataCache = new MetadataCache(this.vault, parseYaml);
    this.workspace = new Workspace(this);
    this.fileManager = new FileManager(this.vault);
    this.scope = new Scope();
    this.plugins = {
      plugins: {},
      manifests: {},
      enabledPlugins: new Set<string>(),
      getPlugin: (id: string) => this.plugins.plugins[id] ?? null,
      enablePlugin: async (_id: string) => {},
      disablePlugin: async (_id: string) => {},
    };
  }

  // `app.loadLocalStorage` / `saveLocalStorage` — vault-scoped key/value.
  loadLocalStorage(key: string): string | null {
    return localStorage.getItem(`narrative-plugin-ls:${key}`);
  }

  saveLocalStorage(key: string, value: string | null): void {
    if (value === null) localStorage.removeItem(`narrative-plugin-ls:${key}`);
    else localStorage.setItem(`narrative-plugin-ls:${key}`, value);
  }

  // Some plugins read `app.appId`; give them something stable.
  get appId(): string {
    return "narrative";
  }

  // Resolve a daily-note style request — handy for plugins that mirror the
  // core daily-notes plugin.
  async getDailyNote(date: string): Promise<TFile | null> {
    const page = await invoke(ch.dailyNote, { date });
    return this.vault.getFiles().find((f) => f.id === page.id) ?? null;
  }
}

export { TFile, TFolder };
