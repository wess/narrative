// Read community-plugin folders off disk. A plugin folder holds a
// `manifest.json` (required), a CommonJS `main.js` (required to run), and
// optional `styles.css` / `data.json`. We never execute anything here —
// the webview owns running plugin code; the host only ferries bytes.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { PluginBundle, PluginManifest } from "../../shared/types.ts";

export type ScannedPlugin = {
  readonly manifest: PluginManifest;
  readonly dir: string;
  readonly hasStyles: boolean;
};

// Read + lightly normalise a `manifest.json`. Returns null when the folder
// isn't a plugin: no manifest, unparseable JSON, or no `id`.
const readManifest = async (dir: string): Promise<PluginManifest | null> => {
  const file = Bun.file(join(dir, "manifest.json"));
  if (!(await file.exists())) return null;
  try {
    const raw = (await file.json()) as Partial<PluginManifest>;
    if (typeof raw.id !== "string" || raw.id.trim() === "") return null;
    return {
      id: raw.id,
      name: typeof raw.name === "string" ? raw.name : raw.id,
      version: typeof raw.version === "string" ? raw.version : "0.0.0",
      minAppVersion: typeof raw.minAppVersion === "string" ? raw.minAppVersion : undefined,
      description: typeof raw.description === "string" ? raw.description : "",
      author: typeof raw.author === "string" ? raw.author : undefined,
      authorUrl: typeof raw.authorUrl === "string" ? raw.authorUrl : undefined,
      fundingUrl: typeof raw.fundingUrl === "string" ? raw.fundingUrl : undefined,
      isDesktopOnly: raw.isDesktopOnly === true,
    };
  } catch {
    return null;
  }
};

// Every valid plugin folder under `root`, paired with its manifest.
export const scanPlugins = async (root: string): Promise<ScannedPlugin[]> => {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return []; // dir doesn't exist yet — nothing installed
  }
  const found: ScannedPlugin[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const dir = join(root, entry);
    const manifest = await readManifest(dir);
    if (!manifest) continue;
    found.push({
      manifest,
      dir,
      hasStyles: await Bun.file(join(dir, "styles.css")).exists(),
    });
  }
  return found;
};

// Read the runnable bundle (code + css + saved data) for one plugin folder.
export const readBundle = async (
  dir: string,
  manifest: PluginManifest,
): Promise<PluginBundle | null> => {
  const main = Bun.file(join(dir, "main.js"));
  if (!(await main.exists())) return null;
  const code = await main.text();

  const cssFile = Bun.file(join(dir, "styles.css"));
  const css = (await cssFile.exists()) ? await cssFile.text() : null;

  const dataFile = Bun.file(join(dir, "data.json"));
  let data: unknown = null;
  if (await dataFile.exists()) {
    try {
      data = await dataFile.json();
    } catch {
      data = null; // corrupt data.json — plugin starts fresh
    }
  }

  return { manifest, code, css, data };
};
