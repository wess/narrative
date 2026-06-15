// The plugin runtime — the conductor. It owns the single `App` instance,
// loads / unloads plugin code, isolates failures so one bad plugin can't take
// down the app, and exposes a `useSyncExternalStore` hook the React shell
// reads. Everything a plugin contributes flows through the shared `registry`;
// the runtime just drives the lifecycle around it.

import { invoke } from "@basket/ipc/client";
import { useSyncExternalStore } from "react";
import * as ch from "../../shared/channels.ts";
import type { InstalledPlugin, PluginBundle, PluginManifest } from "../../shared/types.ts";
import { getBridge } from "./bridge.ts";
import { installDomAugmentations } from "./dom.ts";
import { evaluatePlugin } from "./loader.ts";
import { App } from "./obsidian/app.ts";
import type { Plugin } from "./obsidian/plugin.ts";
import { registry } from "./registry.ts";

export type LoadStatus = { ok: boolean; error?: string };

export type PluginUiState = {
  readonly installed: readonly InstalledPlugin[];
  readonly status: Readonly<Record<string, LoadStatus>>;
  readonly ready: boolean;
};

type RuntimeInternal = {
  state: PluginUiState;
  app: App | null;
  loaded: Map<string, Plugin>;
  styles: Map<string, HTMLStyleElement>;
};

const internal: RuntimeInternal = {
  state: { installed: [], status: {}, ready: false },
  app: null,
  loaded: new Map(),
  styles: new Map(),
};

const listeners = new Set<() => void>();
const notify = (): void => {
  for (const l of listeners) l();
};
const setState = (patch: Partial<PluginUiState>): void => {
  internal.state = { ...internal.state, ...patch };
  notify();
};

const getApp = (): App => {
  if (!internal.app) internal.app = new App();
  return internal.app;
};

// --- load / unload a single plugin ---------------------------------------

const injectStyles = (id: string, css: string | null): void => {
  if (!css) return;
  const style = document.createElement("style");
  style.dataset.narrativePlugin = id;
  style.textContent = css;
  document.head.appendChild(style);
  internal.styles.set(id, style);
};

const removeStyles = (id: string): void => {
  internal.styles.get(id)?.remove();
  internal.styles.delete(id);
};

const setStatus = (id: string, status: LoadStatus): void => {
  setState({ status: { ...internal.state.status, [id]: status } });
};

const loadPlugin = async (id: string): Promise<void> => {
  if (internal.loaded.has(id)) return;
  const app = getApp();

  let bundle: PluginBundle | null;
  try {
    bundle = await invoke(ch.pluginRead, { id });
  } catch (e) {
    setStatus(id, { ok: false, error: `Couldn't read plugin: ${(e as Error).message}` });
    return;
  }
  if (!bundle) {
    setStatus(id, { ok: false, error: "Plugin has no main.js." });
    return;
  }

  injectStyles(id, bundle.css);

  let plugin: Plugin;
  try {
    const { exported } = evaluatePlugin(bundle.code, id);
    const PluginClass = exported as new (app: App, manifest: PluginManifest) => Plugin;
    if (typeof PluginClass !== "function") {
      throw new Error("main.js did not export a plugin class");
    }
    plugin = new PluginClass(app, bundle.manifest);
    plugin._loadedData = bundle.data;
  } catch (e) {
    removeStyles(id);
    setStatus(id, { ok: false, error: `Failed to evaluate: ${(e as Error).message}` });
    console.error(`[narrative] plugin "${id}" failed to evaluate`, e);
    return;
  }

  try {
    // Component bookkeeping: mark loaded so `register*` teardown is tracked,
    // then run the plugin's own `onload` (it may be async).
    plugin._loaded = true;
    await Promise.resolve(plugin.onload());
    internal.loaded.set(id, plugin);
    app.plugins.plugins[id] = plugin;
    app.plugins.manifests[id] = bundle.manifest;
    app.plugins.enabledPlugins.add(id);
    setStatus(id, { ok: true });
  } catch (e) {
    // `onload` threw — unwind whatever it managed to register.
    try {
      plugin.unload();
    } catch {
      // ignore secondary failures during cleanup
    }
    registry.unregisterPlugin(id);
    removeStyles(id);
    setStatus(id, { ok: false, error: `onload threw: ${(e as Error).message}` });
    console.error(`[narrative] plugin "${id}" onload threw`, e);
  }
};

const unloadPlugin = (id: string): void => {
  const plugin = internal.loaded.get(id);
  if (plugin) {
    try {
      plugin.unload();
    } catch (e) {
      console.error(`[narrative] plugin "${id}" unload threw`, e);
    }
  }
  registry.unregisterPlugin(id);
  removeStyles(id);
  internal.loaded.delete(id);
  const app = getApp();
  delete app.plugins.plugins[id];
  app.plugins.enabledPlugins.delete(id);
  const status = { ...internal.state.status };
  delete status[id];
  setState({ status });
};

// --- public surface -------------------------------------------------------

const refresh = async (): Promise<readonly InstalledPlugin[]> => {
  const installed = await invoke(ch.pluginList, undefined);
  setState({ installed });
  return installed;
};

const setEnabled = async (id: string, enabled: boolean): Promise<void> => {
  const installed = await invoke(ch.pluginSetEnabled, { id, enabled });
  setState({ installed });
  if (enabled) await loadPlugin(id);
  else unloadPlugin(id);
};

const start = async (): Promise<void> => {
  installDomAugmentations();
  const app = getApp();
  (window as { app?: unknown }).app = app;

  // Wire the plugin-management surface plugins reach through `app.plugins`.
  app.plugins.enablePlugin = (id: string) => setEnabled(id, true);
  app.plugins.disablePlugin = (id: string) => setEnabled(id, false);

  // Keep the workspace's notion of the active file in step with Bethink.
  getBridge().subscribe({
    onActiveFile: (id) => {
      const file = id === null ? null : (app.vault.getFiles().find((f) => f.id === id) ?? null);
      app.workspace.notifyActiveFile(file);
    },
  });
  getBridge().start();

  const installed = await refresh();
  for (const entry of installed) {
    app.plugins.manifests[entry.manifest.id] = entry.manifest;
    if (entry.enabled) await loadPlugin(entry.manifest.id);
  }
  setState({ ready: true });
};

// Called by the app shell once it has mounted — fires `workspace.onLayoutReady`.
const markLayoutReady = (): void => {
  getApp().workspace.markLayoutReady();
};

const installFromDialog = async (): Promise<{ ok: boolean; message: string }> => {
  const result = await invoke(ch.pluginInstall, undefined);
  if (result.ok) await refresh();
  return result;
};

const openPluginsDir = async (): Promise<void> => {
  await invoke(ch.pluginOpenDir, undefined);
};

const removePlugin = async (id: string): Promise<void> => {
  unloadPlugin(id);
  const installed = await invoke(ch.pluginRemove, { id });
  setState({ installed });
};

export const pluginRuntime = {
  start,
  refresh,
  setEnabled,
  removePlugin,
  installFromDialog,
  openPluginsDir,
  markLayoutReady,
  getApp,
  getPlugin: (id: string): Plugin | undefined => internal.loaded.get(id),
};

// --- React binding --------------------------------------------------------

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePlugins = (): PluginUiState =>
  useSyncExternalStore(
    subscribe,
    () => internal.state,
    () => internal.state,
  );
