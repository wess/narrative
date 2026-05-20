// The vault orchestrator — owns the single "currently open vault". A vault
// is a folder of Markdown files; opening one builds a fresh in-memory index
// (and, from Stage 3, starts a filesystem watcher); closing one tears both
// down. Switching vaults is just close-then-open.

import { buildIndex } from "./buildindex.ts";
import { flushSidecar } from "./sidecar.ts";
import type { OpenVault } from "./types.ts";
import { startWatcher } from "./watch.ts";

let current: OpenVault | null = null;

export const currentVault = (): OpenVault | null => current;

export const openVault = async (root: string): Promise<OpenVault> => {
  await closeVault();
  const vault = await buildIndex(root);
  vault.watcher = startWatcher(vault);
  current = vault;
  return vault;
};

export const closeVault = async (): Promise<void> => {
  if (!current) return;
  current.watcher?.close();
  await flushSidecar(); // don't lose a debounced pin/icon change
  current.db.close();
  current = null;
};

export type { OpenVault };
