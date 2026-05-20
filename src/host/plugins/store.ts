// The plugin manager's host-side state: which plugins are enabled (persisted
// in a JSON store) and the file
// operations behind install / remove / saveData.

import { cp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Store } from "@basket/store";
import type { InstalledPlugin, PluginBundle } from "../../shared/types.ts";
import { readBundle, scanPlugins } from "./scan.ts";

const ENABLED_KEY = "enabled";

export type PluginStore = {
  readonly root: string;
  readonly list: () => Promise<InstalledPlugin[]>;
  readonly read: (id: string) => Promise<PluginBundle | null>;
  readonly setEnabled: (id: string, enabled: boolean) => Promise<InstalledPlugin[]>;
  readonly saveData: (id: string, data: unknown) => Promise<void>;
  readonly remove: (id: string) => Promise<InstalledPlugin[]>;
  readonly install: (sourceDir: string) => Promise<{ ok: boolean; message: string }>;
};

export const createPluginStore = (root: string, store: Store): PluginStore => {
  const enabledList = (): string[] => {
    const raw = store.get<unknown>(ENABLED_KEY);
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  };

  const dirFor = async (id: string): Promise<string | null> => {
    const match = (await scanPlugins(root)).find((p) => p.manifest.id === id);
    return match ? match.dir : null;
  };

  const list = async (): Promise<InstalledPlugin[]> => {
    const enabled = new Set(enabledList());
    const scanned = await scanPlugins(root);
    return scanned.map((p) => ({
      manifest: p.manifest,
      dir: p.dir,
      hasStyles: p.hasStyles,
      enabled: enabled.has(p.manifest.id),
    }));
  };

  const read = async (id: string): Promise<PluginBundle | null> => {
    const match = (await scanPlugins(root)).find((p) => p.manifest.id === id);
    if (!match) return null;
    return readBundle(match.dir, match.manifest);
  };

  const setEnabled = async (id: string, enabled: boolean): Promise<InstalledPlugin[]> => {
    const current = new Set(enabledList());
    if (enabled) current.add(id);
    else current.delete(id);
    store.set(ENABLED_KEY, [...current]);
    return list();
  };

  const saveData = async (id: string, data: unknown): Promise<void> => {
    const dir = await dirFor(id);
    if (!dir) throw new Error(`plugin ${id} not found`);
    await Bun.write(join(dir, "data.json"), JSON.stringify(data, null, 2));
  };

  const remove = async (id: string): Promise<InstalledPlugin[]> => {
    const dir = await dirFor(id);
    if (dir) await rm(dir, { recursive: true, force: true });
    const current = new Set(enabledList());
    current.delete(id);
    store.set(ENABLED_KEY, [...current]);
    return list();
  };

  // Copy a plugin folder the user picked into the managed plugins directory.
  // Requires a `manifest.json` so we don't litter the dir with junk folders.
  const install = async (sourceDir: string): Promise<{ ok: boolean; message: string }> => {
    const manifest = Bun.file(join(sourceDir, "manifest.json"));
    if (!(await manifest.exists())) {
      return { ok: false, message: "That folder has no manifest.json — not a plugin." };
    }
    const dest = join(root, basename(sourceDir));
    try {
      await cp(sourceDir, dest, { recursive: true });
    } catch (e) {
      return { ok: false, message: `Couldn't copy the plugin: ${(e as Error).message}` };
    }
    return { ok: true, message: `Installed from ${basename(sourceDir)}.` };
  };

  return { root, list, read, setEnabled, saveData, remove, install };
};
