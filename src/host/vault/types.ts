// Shared shapes for the file-backed vault. The vault is a folder of Markdown
// files on disk; an `OpenVault` bundles the folder with its in-memory derived
// index, the small per-vault config, and the Bethink-local UI sidecar.

import type { DB } from "@basket/db";

export type VaultConfig = {
  readonly dailyFolder: string; // where `resolveDaily` writes, e.g. "Daily"
  readonly templatesFolder: string; // the templates folder, e.g. "Templates"
};

// Bethink-local per-node UI metadata. Persisted in `.narrative/ui.json`
// inside the vault so it travels with the vault but never touches the
// Markdown content. Keyed by vault-relative path.
export type NodeMeta = {
  pinned?: boolean;
  archived?: boolean;
  isTemplate?: boolean;
  icon?: string;
  sortKey?: number;
};

export type Sidecar = {
  meta: Record<string, NodeMeta>;
};

export type OpenVault = {
  readonly root: string; // absolute path to the vault folder
  readonly name: string; // folder basename
  readonly db: DB; // in-memory derived index, rebuilt on every open
  readonly config: VaultConfig;
  readonly sidecar: Sidecar; // mutable; flushed to disk by sidecar.ts
  watcher: { close: () => void } | null; // installed in Stage 3
};
