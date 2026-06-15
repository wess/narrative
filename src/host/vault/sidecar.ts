// The Bethink-local UI sidecar: `.narrative/ui.json` inside the vault. It
// holds the bits a plain Markdown file has no place for — pins, archive
// state, page icons, manual sort order — keyed by vault-relative path. It
// lives in the vault so it travels with it, but it's a dotfolder so other
// tools ignore it and it never pollutes the Markdown.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { NodeMeta, Sidecar } from "./types.ts";

const sidecarPath = (root: string): string => join(root, ".narrative", "ui.json");

export const loadSidecar = async (root: string): Promise<Sidecar> => {
  try {
    const raw = (await Bun.file(sidecarPath(root)).json()) as { meta?: Record<string, NodeMeta> };
    return { meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {} };
  } catch {
    return { meta: {} };
  }
};

// Writes are debounced — pins/icons/sort changes come in bursts.
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { root: string; sidecar: Sidecar } | null = null;

const flush = async (): Promise<void> => {
  if (!pending) return;
  const { root, sidecar } = pending;
  pending = null;
  flushTimer = null;
  try {
    await mkdir(join(root, ".narrative"), { recursive: true });
    await Bun.write(sidecarPath(root), JSON.stringify(sidecar, null, 2));
  } catch {
    // a write failure just means the UI metadata won't persist this session
  }
};

export const saveSidecar = (root: string, sidecar: Sidecar): void => {
  pending = { root, sidecar };
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 250);
};

// Force any pending sidecar write to disk now — called when a vault closes
// so a just-made pin/icon change can't be lost to the debounce window.
export const flushSidecar = async (): Promise<void> => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flush();
};

// --- helpers --------------------------------------------------------------

export const metaFor = (sidecar: Sidecar, path: string): NodeMeta => sidecar.meta[path] ?? {};

export const setMeta = (sidecar: Sidecar, path: string, patch: NodeMeta): void => {
  const next = { ...sidecar.meta[path], ...patch };
  // Drop keys that fell back to their default so the file stays tidy.
  for (const key of Object.keys(next) as (keyof NodeMeta)[]) {
    const value = next[key];
    if (value === undefined || value === false || value === "" || value === 0) delete next[key];
  }
  if (Object.keys(next).length === 0) delete sidecar.meta[path];
  else sidecar.meta[path] = next;
};

// Move metadata when a node is renamed or moved — `from`/`to` are paths.
// Folder moves carry every descendant entry along.
export const moveMeta = (sidecar: Sidecar, from: string, to: string): void => {
  const fromPrefix = `${from}/`;
  for (const key of Object.keys(sidecar.meta)) {
    if (key === from) {
      sidecar.meta[to] = sidecar.meta[key] as NodeMeta;
      delete sidecar.meta[key];
    } else if (key.startsWith(fromPrefix)) {
      sidecar.meta[`${to}/${key.slice(fromPrefix.length)}`] = sidecar.meta[key] as NodeMeta;
      delete sidecar.meta[key];
    }
  }
};

export const dropMeta = (sidecar: Sidecar, path: string): void => {
  const prefix = `${path}/`;
  for (const key of Object.keys(sidecar.meta)) {
    if (key === path || key.startsWith(prefix)) delete sidecar.meta[key];
  }
};
