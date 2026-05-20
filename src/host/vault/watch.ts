// The filesystem watcher. The vault is a folder of Markdown files, so edits
// can come from anywhere — another editor, git, a sync client. This
// watches the vault root recursively and folds external changes back into
// the in-memory index, then tells the webview to refresh.
//
// Two things keep it honest:
//  - a self-write guard (`isSelfWrite`) so Narrative's own saves don't echo;
//  - debounced batches, so a burst of events (a git checkout, a folder move)
//    is reconciled in one pass — which is also where renames are detected:
//    a vanished file whose content reappears under a new path is treated as
//    the same node moved, preserving its id. Moves it can't correlate fall
//    back to delete + create.

import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { emit } from "@basket/ipc";
import * as ch from "../../shared/channels.ts";
import type { Page } from "../../shared/types.ts";
import { applyRelocation, rowToPage } from "../pages.ts";
import { embeddingsTable, type NodeRow, nodesTable } from "../schema.ts";
import { inFolder } from "./buildindex.ts";
import { isSelfWrite } from "./fileio.ts";
import { reindexNode, unindexNode } from "./reindex.ts";
import { dropMeta, saveSidecar } from "./sidecar.ts";
import type { OpenVault } from "./types.ts";

const DEBOUNCE_MS = 200;

const isHidden = (relPath: string): boolean =>
  relPath.split("/").some((seg) => seg.startsWith(".") || seg === "node_modules");

const isMarkdown = (relPath: string): boolean => relPath.toLowerCase().endsWith(".md");

type DiskState = { rel: string; abs: string; exists: boolean; isDir: boolean; mtime: number };

export const startWatcher = (vault: OpenVault): { close: () => void } => {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const rowByPath = (path: string): NodeRow | undefined =>
    vault.db.query<NodeRow>("SELECT * FROM nodes WHERE path = ? LIMIT 1", path)[0];

  const parentIdFor = (relPath: string): number | null => {
    const dir = dirname(relPath);
    if (dir === "." || dir === "") return null;
    return rowByPath(dir)?.id ?? null;
  };

  const readBody = (abs: string): Promise<string | null> =>
    Bun.file(abs)
      .text()
      .catch(() => null);

  const processBatch = async (): Promise<void> => {
    timer = null;
    if (closed) return;
    const rels = [...pending];
    pending.clear();

    // Snapshot what each touched path looks like on disk *now*, then drop the
    // ones that are Narrative's own writes echoing back (matched by mtime, so
    // an external edit moments later is still seen).
    const raw: DiskState[] = [];
    for (const rel of rels) {
      const abs = join(vault.root, rel);
      try {
        const s = await stat(abs);
        raw.push({ rel, abs, exists: true, isDir: s.isDirectory(), mtime: s.mtimeMs });
      } catch {
        raw.push({ rel, abs, exists: false, isDir: false, mtime: 0 });
      }
    }
    const changes = raw.filter((c) => !isSelfWrite(c.abs, c.exists ? c.mtime : undefined));
    if (changes.length === 0) return;

    const created: DiskState[] = [];
    const deleted: NodeRow[] = [];
    const savedPages: Page[] = [];
    let structural = false;

    // Pass 1 — deletes (collected) and in-place modifications (applied now).
    for (const c of changes) {
      const row = rowByPath(c.rel);
      if (!c.exists) {
        if (row) deleted.push(row);
        continue;
      }
      if (c.isDir) {
        if (!row) created.push(c);
        continue;
      }
      if (!isMarkdown(c.rel)) continue; // attachments aren't nodes
      if (!row) {
        created.push(c);
        continue;
      }
      const body = await readBody(c.abs);
      if (body === null || (body === row.body && c.mtime === row.mtime)) continue;
      const title = basename(c.rel).replace(/\.md$/i, "");
      vault.db.update(nodesTable, { id: row.id }, {
        body,
        title,
        mtime: c.mtime,
        updatedAt: new Date(c.mtime || Date.now()).toISOString(),
      } as Partial<NodeRow>);
      reindexNode(vault.db, { id: row.id, title, body });
      const fresh = rowByPath(c.rel);
      if (fresh) savedPages.push(rowToPage(fresh));
    }

    // Pass 2 — rename detection: a vanished file whose content turns up under
    // a freshly-created path is the same node moved. Preserve its id.
    const stillDeleted: NodeRow[] = [];
    for (const row of deleted) {
      let matched = -1;
      if (row.kind === "file") {
        for (let i = 0; i < created.length; i++) {
          const c = created[i];
          if (!c || c.isDir || !isMarkdown(c.rel)) continue;
          if ((await readBody(c.abs)) === row.body) {
            matched = i;
            break;
          }
        }
      }
      if (matched >= 0) {
        const target = created[matched];
        created.splice(matched, 1);
        if (target) {
          applyRelocation(vault, row, target.rel); // disk already moved
          structural = true;
        }
      } else {
        stillDeleted.push(row);
      }
    }

    // Pass 3 — genuine deletes, subtree and all.
    for (const row of stillDeleted) {
      const subtree =
        row.kind === "folder"
          ? [
              row,
              ...vault.db.query<NodeRow>("SELECT * FROM nodes WHERE path LIKE ?", `${row.path}/%`),
            ]
          : [row];
      for (const node of subtree) {
        vault.db.remove(nodesTable, { id: node.id });
        vault.db.remove(embeddingsTable, { nodeId: node.id });
        unindexNode(vault.db, node.id);
      }
      dropMeta(vault.sidecar, row.path);
      structural = true;
    }
    if (stillDeleted.length > 0) saveSidecar(vault.root, vault.sidecar);

    // Pass 4 — creates, shallow paths first so a parent folder always exists
    // before its children.
    created.sort((a, b) => a.rel.split("/").length - b.rel.split("/").length);
    for (const c of created) {
      if (rowByPath(c.rel)) continue; // a rename already claimed it
      const now = new Date(c.mtime || Date.now()).toISOString();
      const parentId = parentIdFor(c.rel);
      if (c.isDir) {
        vault.db.insert(nodesTable, {
          path: c.rel,
          kind: "folder",
          title: basename(c.rel),
          body: "",
          parentId,
          mtime: c.mtime,
          createdAt: now,
          updatedAt: now,
        });
        structural = true;
      } else if (isMarkdown(c.rel)) {
        const body = (await readBody(c.abs)) ?? "";
        const title = basename(c.rel).replace(/\.md$/i, "");
        const row = vault.db.insert(nodesTable, {
          path: c.rel,
          kind: "file",
          title,
          body,
          parentId,
          isDaily: inFolder(c.rel, vault.config.dailyFolder),
          isTemplate: inFolder(c.rel, vault.config.templatesFolder),
          mtime: c.mtime,
          createdAt: now,
          updatedAt: now,
        });
        reindexNode(vault.db, row);
        structural = true;
      }
    }

    // The index is already reconciled above; a failed `emit` (e.g. the
    // window isn't up yet) must not turn into an unhandled rejection.
    try {
      if (structural) emit(ch.treeChanged, undefined);
      for (const page of savedPages) emit(ch.pageSaved, page);
    } catch (e) {
      console.error("[Narrative] vault watcher could not notify the webview:", e);
    }
  };

  const onEvent = (_type: string, filename: string | Buffer | null): void => {
    if (closed || !filename) return;
    const rel = filename.toString().replace(/\\/g, "/");
    if (rel === "" || isHidden(rel)) return;
    // Self-write filtering happens in `processBatch`, where the file's
    // current mtime is known — that's what distinguishes our echo from a
    // genuine external edit to the same file.
    pending.add(rel);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void processBatch(), DEBOUNCE_MS);
  };

  let watcher: ReturnType<typeof watch> | null = null;
  try {
    // `recursive` is supported on macOS and Windows; on Linux only the root
    // dir is watched, so deep external edits there need a manual rescan.
    watcher = watch(vault.root, { recursive: true }, onEvent);
    watcher.on("error", (e) => console.error("[Narrative] vault watcher error:", e));
  } catch (e) {
    console.error("[Narrative] vault watcher unavailable:", (e as Error).message);
  }

  return {
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      watcher?.close();
    },
  };
};
