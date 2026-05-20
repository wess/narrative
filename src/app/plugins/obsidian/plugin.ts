// `Plugin` — the class every plugin extends. It's a `Component`
// (so all the `register*` teardown applies) plus the contribution methods:
// `addCommand`, `addRibbonIcon`, `addSettingTab`, `registerView`,
// `registerMarkdownPostProcessor`, and `loadData` / `saveData`. Each
// contribution lands in the shared `registry`, tagged with the plugin's id,
// and is registered for cleanup so disabling the plugin removes it cleanly.

import { invoke } from "@basket/ipc/client";
import * as ch from "../../../shared/channels.ts";
import type { PluginManifest } from "../../../shared/types.ts";
import { type Command, registry } from "../registry.ts";
import type { App } from "./app.ts";
import { Component } from "./component.ts";
import { setIcon } from "./icons.ts";
import type { MarkdownPostProcessor, MarkdownPostProcessorContext } from "./markdown.ts";
import { PluginSettingTab, SettingTab } from "./setting.ts";
import type { View, WorkspaceLeaf } from "./workspace.ts";

let itemSeq = 0;

export class Plugin extends Component {
  app: App;
  manifest: PluginManifest;
  // The runtime stashes the loaded `data.json` here before `onload`.
  _loadedData: unknown = null;

  constructor(app: App, manifest: PluginManifest) {
    super();
    this.app = app;
    this.manifest = manifest;
  }

  private get id(): string {
    return this.manifest.id;
  }

  // --- commands -----------------------------------------------------------

  addCommand(command: Command): Command {
    const entry = registry.addCommand(this.id, command);
    this.register(() => registry.removeCommand(entry.id));
    return entry;
  }

  removeCommand(commandId: string): void {
    registry.removeCommand(commandId);
  }

  // --- ribbon + status bar ------------------------------------------------

  addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement {
    const id = `${this.id}:ribbon:${++itemSeq}`;
    const el = document.createElement("div");
    el.className = "narrative-ribbon-action";
    el.setAttribute("aria-label", title);
    el.title = title;
    setIcon(el, icon);
    el.addEventListener("click", callback);
    registry.addRibbonItem({ id, pluginId: this.id, title, el });
    this.register(() => registry.removeRibbonItem(id));
    return el;
  }

  addStatusBarItem(): HTMLElement {
    const id = `${this.id}:status:${++itemSeq}`;
    const el = document.createElement("div");
    el.className = "narrative-status-bar-item";
    registry.addStatusBarItem({ id, pluginId: this.id, el });
    this.register(() => registry.removeStatusBarItem(id));
    return el;
  }

  // --- settings -----------------------------------------------------------

  addSettingTab(settingTab: PluginSettingTab): void {
    const id = `${this.id}:settings`;
    registry.addSettingTab({
      id,
      pluginId: this.id,
      name: this.manifest.name,
      tab: settingTab,
    });
  }

  // --- views --------------------------------------------------------------

  registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => View): void {
    registry.addView({ pluginId: this.id, type, creator: viewCreator });
    this.register(() => this.app.workspace.detachLeavesOfType(type));
  }

  // We can't host arbitrary CodeMirror extensions over the block editor —
  // accept the registration so the plugin loads, but it's inert (v1 limit).
  registerEditorExtension(_extension: unknown): void {}

  registerEditorSuggest(_suggest: unknown): void {}

  registerExtensions(_extensions: string[], _viewType: string): void {}

  registerHoverLinkSource(_id: string, _info: unknown): void {}

  registerObsidianProtocolHandler(_action: string, _handler: (params: unknown) => unknown): void {}

  // --- markdown processors ------------------------------------------------

  registerMarkdownPostProcessor(
    processor: (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void | Promise<void>,
    sortOrder = 0,
  ): MarkdownPostProcessor {
    registry.addPostProcessor({ pluginId: this.id, sortOrder, fn: processor });
    // `registry.unregisterPlugin` does the bulk removal on unload; nothing
    // finer-grained needed here.
    return processor as MarkdownPostProcessor;
  }

  registerMarkdownCodeBlockProcessor(
    language: string,
    handler: (
      source: string,
      el: HTMLElement,
      ctx: MarkdownPostProcessorContext,
    ) => void | Promise<void>,
    _sortOrder?: number,
  ): void {
    registry.addCodeBlock({ pluginId: this.id, language, fn: handler });
  }

  // --- data persistence ---------------------------------------------------

  async loadData(): Promise<unknown> {
    if (this._loadedData !== null && this._loadedData !== undefined) return this._loadedData;
    const bundle = await invoke(ch.pluginRead, { id: this.id });
    this._loadedData = bundle?.data ?? null;
    return this._loadedData;
  }

  async saveData(data: unknown): Promise<void> {
    this._loadedData = data;
    await invoke(ch.pluginSaveData, { id: this.id, data });
  }

  // Lifecycle hooks the host may call on a plugin.
  onUserEnable(): void {}
  onExternalSettingsChange(): void {}
}

export { PluginSettingTab, SettingTab };
