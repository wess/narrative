// Build the in-memory derived index for a vault folder: scan the folder,
// insert a row per node (resolving each `parentId` from the path hierarchy),
// layer the Narrative-local sidecar metadata on top, and reindex every
// file's links / tags / full-text. The result is a fully-formed `OpenVault`
// minus its watcher (Stage 3 attaches that). Rebuilt from scratch on every
// open — there is no on-disk index to go stale.

import { basename } from "node:path";
import { connect, migrate } from "@basket/db";
import { nodesTable, tables } from "../schema.ts";
import { initSearch } from "../search.ts";
import { loadConfig } from "./config.ts";
import { reindexNode } from "./reindex.ts";
import { scanVault } from "./scan.ts";
import { loadSidecar, metaFor } from "./sidecar.ts";
import type { OpenVault } from "./types.ts";

// True when `path` is the configured folder itself or sits inside it —
// drives the `isDaily` / `isTemplate` flags.
export const inFolder = (path: string, folder: string): boolean =>
  folder !== "" && (path === folder || path.startsWith(`${folder}/`));

export const buildIndex = async (root: string): Promise<OpenVault> => {
  const config = await loadConfig(root);
  const sidecar = await loadSidecar(root);

  const db = connect(":memory:");
  migrate(db, tables);
  initSearch(db);

  const scanned = await scanVault(root);
  // Shallow paths first so a node's parent folder is always inserted before
  // it, then alphabetically for stable ids.
  scanned.sort(
    (a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path),
  );

  const idByPath = new Map<string, number>();
  for (const node of scanned) {
    const slash = node.path.lastIndexOf("/");
    const parentPath = slash < 0 ? "" : node.path.slice(0, slash);
    const parentId = parentPath ? (idByPath.get(parentPath) ?? null) : null;
    const meta = metaFor(sidecar, node.path);

    const stamp = node.mtime || Date.now();
    const row = db.insert(nodesTable, {
      path: node.path,
      kind: node.kind,
      title: node.title,
      body: node.body,
      parentId,
      icon: meta.icon ?? "",
      pinned: meta.pinned ?? false,
      archived: meta.archived ?? false,
      isDaily: node.kind === "file" && inFolder(node.path, config.dailyFolder),
      isTemplate: Boolean(meta.isTemplate) || inFolder(node.path, config.templatesFolder),
      sortKey: meta.sortKey ?? 0,
      mtime: node.mtime,
      createdAt: new Date(node.birthtime || stamp).toISOString(),
      updatedAt: new Date(stamp).toISOString(),
    });
    idByPath.set(node.path, row.id);

    if (node.kind === "file") {
      reindexNode(db, { id: row.id, title: node.title, body: node.body });
    }
  }

  return {
    root,
    name: basename(root) || root,
    db,
    config,
    sidecar,
    watcher: null,
  };
};
