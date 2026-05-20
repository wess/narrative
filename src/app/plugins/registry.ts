// The plugin registries. Everything a plugin contributes to Narrative's UI —
// commands, ribbon icons, status-bar items, settings tabs, custom views,
// markdown processors — lands here, tagged by plugin id, so disabling a
// plugin removes exactly its entries. A tiny subscribe/notify lets the React
// shell re-render when the registries change.

import { useSyncExternalStore } from "react";
import type { Editor } from "./obsidian/editor.ts";
import type { MarkdownPostProcessorContext } from "./obsidian/markdown.ts";
import type { PluginSettingTab } from "./obsidian/plugin.ts";
import type { View, WorkspaceLeaf } from "./obsidian/workspace.ts";

export type Hotkey = { readonly modifiers: string[]; readonly key: string };

// Mirrors the plugin `Command`. A command runs via exactly one of the
// callback shapes; the check variants gate availability on `checking`.
export type Command = {
  id: string;
  name: string;
  icon?: string;
  hotkeys?: Hotkey[];
  callback?: () => unknown;
  // biome-ignore lint/suspicious/noConfusingVoidType: matches the plugin Command API
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: Editor) => unknown;
  // biome-ignore lint/suspicious/noConfusingVoidType: matches the plugin Command API
  editorCheckCallback?: (checking: boolean, editor: Editor) => boolean | void;
};

export type RegisteredCommand = Command & { readonly pluginId: string };

export type RibbonItem = {
  readonly id: string;
  readonly pluginId: string;
  readonly title: string;
  readonly el: HTMLElement;
};

export type StatusBarItem = {
  readonly id: string;
  readonly pluginId: string;
  readonly el: HTMLElement;
};

export type SettingTabEntry = {
  readonly id: string;
  readonly pluginId: string;
  readonly name: string;
  readonly tab: PluginSettingTab;
};

export type ViewRegistration = {
  readonly pluginId: string;
  readonly type: string;
  readonly creator: (leaf: WorkspaceLeaf) => View;
};

export type MarkdownPostProcessor = {
  readonly pluginId: string;
  readonly sortOrder: number;
  readonly fn: (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void | Promise<void>;
};

export type CodeBlockProcessor = {
  readonly pluginId: string;
  readonly language: string;
  readonly fn: (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ) => void | Promise<void>;
};

type Registries = {
  commands: RegisteredCommand[];
  ribbon: RibbonItem[];
  statusBar: StatusBarItem[];
  settingTabs: SettingTabEntry[];
  views: ViewRegistration[];
  postProcessors: MarkdownPostProcessor[];
  codeBlocks: CodeBlockProcessor[];
};

const state: Registries = {
  commands: [],
  ribbon: [],
  statusBar: [],
  settingTabs: [],
  views: [],
  postProcessors: [],
  codeBlocks: [],
};

const listeners = new Set<() => void>();
let snapshotDirty = true;
let snapshot: Readonly<Registries> = state;

const notify = (): void => {
  snapshotDirty = true;
  for (const l of listeners) l();
};

export const subscribeRegistry = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// A stable, frozen view for `useSyncExternalStore` — only re-created when a
// mutation actually happened.
export const getRegistrySnapshot = (): Readonly<Registries> => {
  if (snapshotDirty) {
    snapshot = {
      commands: [...state.commands],
      ribbon: [...state.ribbon],
      statusBar: [...state.statusBar],
      settingTabs: [...state.settingTabs],
      views: [...state.views],
      postProcessors: [...state.postProcessors],
      codeBlocks: [...state.codeBlocks],
    };
    snapshotDirty = false;
  }
  return snapshot;
};

// --- mutations ------------------------------------------------------------

export const registry = {
  addCommand(pluginId: string, command: Command): RegisteredCommand {
    const entry: RegisteredCommand = { ...command, pluginId };
    // Re-registering the same id replaces the old entry.
    const idx = state.commands.findIndex((c) => c.id === entry.id);
    if (idx > -1) state.commands[idx] = entry;
    else state.commands.push(entry);
    notify();
    return entry;
  },
  removeCommand(id: string): void {
    const idx = state.commands.findIndex((c) => c.id === id);
    if (idx > -1) {
      state.commands.splice(idx, 1);
      notify();
    }
  },
  addRibbonItem(item: RibbonItem): void {
    state.ribbon.push(item);
    notify();
  },
  removeRibbonItem(id: string): void {
    const idx = state.ribbon.findIndex((r) => r.id === id);
    if (idx > -1) {
      state.ribbon[idx]?.el.remove();
      state.ribbon.splice(idx, 1);
      notify();
    }
  },
  addStatusBarItem(item: StatusBarItem): void {
    state.statusBar.push(item);
    notify();
  },
  removeStatusBarItem(id: string): void {
    const idx = state.statusBar.findIndex((s) => s.id === id);
    if (idx > -1) {
      state.statusBar[idx]?.el.remove();
      state.statusBar.splice(idx, 1);
      notify();
    }
  },
  addSettingTab(entry: SettingTabEntry): void {
    state.settingTabs.push(entry);
    notify();
  },
  addView(reg: ViewRegistration): void {
    if (state.views.some((v) => v.type === reg.type)) {
      throw new Error(`view type "${reg.type}" is already registered`);
    }
    state.views.push(reg);
    notify();
  },
  addPostProcessor(proc: MarkdownPostProcessor): void {
    state.postProcessors.push(proc);
    state.postProcessors.sort((a, b) => a.sortOrder - b.sortOrder);
    notify();
  },
  addCodeBlock(proc: CodeBlockProcessor): void {
    state.codeBlocks.push(proc);
    notify();
  },

  // Tear down every entry a plugin contributed — the heart of "disable".
  unregisterPlugin(pluginId: string): void {
    state.commands = state.commands.filter((c) => c.pluginId !== pluginId);
    for (const item of state.ribbon) if (item.pluginId === pluginId) item.el.remove();
    state.ribbon = state.ribbon.filter((r) => r.pluginId !== pluginId);
    for (const item of state.statusBar) if (item.pluginId === pluginId) item.el.remove();
    state.statusBar = state.statusBar.filter((s) => s.pluginId !== pluginId);
    state.settingTabs = state.settingTabs.filter((s) => s.pluginId !== pluginId);
    state.views = state.views.filter((v) => v.pluginId !== pluginId);
    state.postProcessors = state.postProcessors.filter((p) => p.pluginId !== pluginId);
    state.codeBlocks = state.codeBlocks.filter((c) => c.pluginId !== pluginId);
    notify();
  },

  // --- reads (non-React callers) -----------------------------------------
  commands: (): readonly RegisteredCommand[] => state.commands,
  views: (): readonly ViewRegistration[] => state.views,
  viewCreator: (type: string): ViewRegistration | undefined =>
    state.views.find((v) => v.type === type),
  postProcessors: (): readonly MarkdownPostProcessor[] => state.postProcessors,
  codeBlock: (language: string): CodeBlockProcessor | undefined =>
    state.codeBlocks.find((c) => c.language === language),
};

// React binding — components re-render when any registry changes.
export const useRegistry = (): Readonly<Registries> =>
  useSyncExternalStore(subscribeRegistry, getRegistrySnapshot, getRegistrySnapshot);
