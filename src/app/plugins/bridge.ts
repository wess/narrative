// The vault adapter. Plugins think in terms of a folder of `.md`
// files; Bethink stores pages in SQLite, addressed by numeric id and
// arranged in a parent/child tree. The bridge maintains a two-way mapping
// between a page's *virtual path* (its title-chain through the hierarchy plus
// `.md`) and its id, rebuilds that index whenever the page tree changes, and
// diffs successive indexes into create / delete / rename signals the
// plugin API re-emits as `vault` events.
//
// A page that has children is *both* a file and a folder — e.g. a page
// "Projects" with sub-pages shows up as `Projects.md` next to a folder
// `Projects/`. That's the familiar "folder note" model and it's the only
// faithful way to project a Notion-style tree onto a file vault.

import { invoke, subscribe } from "@basket/ipc/client";
import * as ch from "../../shared/channels.ts";
import type { Page, PageMeta, TreeNode } from "../../shared/types.ts";
import { getState, subscribeStore } from "../state/store.ts";

export type VaultFileRecord = {
  readonly id: number;
  readonly path: string; // "Folder/Note.md"
  readonly name: string; // "Note.md"
  readonly basename: string; // "Note"
  readonly extension: string; // "md"
  readonly parentPath: string; // "Folder", or "" for the root
  readonly ctime: number;
  readonly mtime: number;
  readonly size: number;
  readonly meta: PageMeta;
};

export type VaultFolderRecord = {
  readonly path: string; // "" is the vault root
  readonly name: string;
  readonly parentPath: string | null; // null only for the root
  readonly id: number | null; // the page that *is* this folder (root: null)
  readonly childFiles: string[]; // lower-cased file paths
  readonly childFolders: string[]; // lower-cased folder paths
};

export type VaultIndex = {
  readonly files: readonly VaultFileRecord[];
  readonly fileByPath: ReadonlyMap<string, VaultFileRecord>;
  readonly fileById: ReadonlyMap<number, VaultFileRecord>;
  readonly folders: ReadonlyMap<string, VaultFolderRecord>;
};

export type VaultDiff = {
  readonly created: readonly VaultFileRecord[];
  readonly deleted: readonly VaultFileRecord[];
  readonly renamed: readonly { readonly record: VaultFileRecord; readonly oldPath: string }[];
};

export type BridgeListener = {
  onIndex?: (index: VaultIndex) => void;
  onDiff?: (diff: VaultDiff) => void;
  onModify?: (record: VaultFileRecord, page: Page) => void;
  onActiveFile?: (id: number | null) => void;
};

// The vault is file-backed now, so every tree node carries its real
// vault-relative `path` and `kind` — no path synthesis, no collision
// guessing. We just project the tree into the flat lookup maps the
// plugin API's `Vault` / `MetadataCache` want.
const buildIndex = (tree: readonly TreeNode[]): VaultIndex => {
  const files: VaultFileRecord[] = [];
  const fileByPath = new Map<string, VaultFileRecord>();
  const fileById = new Map<number, VaultFileRecord>();
  const folders = new Map<string, VaultFolderRecord>();

  const root: VaultFolderRecord = {
    path: "",
    name: "",
    parentPath: null,
    id: null,
    childFiles: [],
    childFolders: [],
  };
  folders.set("", root);

  const walk = (nodes: readonly TreeNode[], parentFolder: VaultFolderRecord): void => {
    for (const node of nodes) {
      const parentPath = parentFolder.path;
      if (node.kind === "folder") {
        const folder: VaultFolderRecord = {
          path: node.path,
          name: node.title,
          parentPath,
          id: node.id,
          childFiles: [],
          childFolders: [],
        };
        folders.set(node.path.toLowerCase(), folder);
        parentFolder.childFolders.push(node.path.toLowerCase());
        walk(node.children, folder);
      } else {
        const ts = Date.parse(node.updatedAt) || Date.now();
        const record: VaultFileRecord = {
          id: node.id,
          path: node.path,
          name: node.path.split("/").pop() ?? `${node.title}.md`,
          basename: node.title,
          extension: "md",
          parentPath,
          ctime: ts,
          mtime: ts,
          size: 0,
          meta: node,
        };
        files.push(record);
        fileByPath.set(node.path.toLowerCase(), record);
        fileById.set(node.id, record);
        parentFolder.childFiles.push(node.path.toLowerCase());
      }
    }
  };

  walk(tree, root);
  return { files, fileByPath, fileById, folders };
};

const diffIndexes = (prev: VaultIndex, next: VaultIndex): VaultDiff => {
  const created: VaultFileRecord[] = [];
  const deleted: VaultFileRecord[] = [];
  const renamed: { record: VaultFileRecord; oldPath: string }[] = [];

  for (const rec of next.files) {
    const before = prev.fileById.get(rec.id);
    if (!before) created.push(rec);
    else if (before.path !== rec.path) renamed.push({ record: rec, oldPath: before.path });
  }
  for (const rec of prev.files) {
    if (!next.fileById.has(rec.id)) deleted.push(rec);
  }
  return { created, deleted, renamed };
};

export type VaultBridge = {
  readonly index: () => VaultIndex;
  readonly subscribe: (listener: BridgeListener) => () => void;
  readonly activeFileId: () => number | null;
  readonly readPage: (id: number) => Promise<string>;
  readonly modifyPage: (id: number, body: string) => Promise<void>;
  readonly createPage: (path: string, body: string) => Promise<VaultFileRecord>;
  readonly createFolder: (path: string) => Promise<void>;
  readonly deletePage: (id: number) => Promise<void>;
  readonly renamePage: (id: number, newPath: string) => Promise<void>;
  readonly start: () => void;
};

const createBridge = (): VaultBridge => {
  let current = buildIndex(getState().tree);
  let activeId = getState().activeId;
  const listeners = new Set<BridgeListener>();
  let started = false;

  const emit = (fn: (l: BridgeListener) => void): void => {
    for (const l of listeners) {
      try {
        fn(l);
      } catch (e) {
        console.error("[narrative] vault bridge listener threw", e);
      }
    }
  };

  const refreshIndex = (): void => {
    const next = buildIndex(getState().tree);
    const diff = diffIndexes(current, next);
    current = next;
    emit((l) => l.onIndex?.(next));
    if (diff.created.length || diff.deleted.length || diff.renamed.length) {
      emit((l) => l.onDiff?.(diff));
    }
  };

  // Resolve a folder path to the id of the page that *is* that folder,
  // creating intermediate folder-pages as needed. "" resolves to the root
  // (parentId null).
  // Resolve a vault-relative folder path to its node id, creating any
  // missing folders along the way. "" resolves to the root (parentId null).
  const resolveFolderId = async (folderPath: string): Promise<number | null> => {
    if (!folderPath) return null;
    const existing = current.folders.get(folderPath.toLowerCase());
    if (existing && existing.id !== null) return existing.id;
    const segments = folderPath.split("/").filter(Boolean);
    let parentId: number | null = null;
    let accum = "";
    for (const seg of segments) {
      accum = accum ? `${accum}/${seg}` : seg;
      const folder = current.folders.get(accum.toLowerCase());
      if (folder && folder.id !== null) {
        parentId = folder.id;
        continue;
      }
      const created: Page = await invoke(ch.createFolder, { parentId, title: seg });
      parentId = created.id;
    }
    return parentId;
  };

  const readPage = async (id: number): Promise<string> => {
    const page = await invoke(ch.getPage, { id });
    return page?.body ?? "";
  };

  const modifyPage = async (id: number, body: string): Promise<void> => {
    await invoke(ch.updatePage, { id, body });
  };

  const createPage = async (path: string, body: string): Promise<VaultFileRecord> => {
    const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
    const slash = normalized.lastIndexOf("/");
    const folderPath = slash < 0 ? "" : normalized.slice(0, slash);
    const fileName = slash < 0 ? normalized : normalized.slice(slash + 1);
    const title = fileName.replace(/\.md$/i, "") || "Untitled";
    const parentId = await resolveFolderId(folderPath);
    const page = await invoke(ch.createPage, { title, parentId, body });
    if (!page) throw new Error(`vault.create: host refused to create "${path}"`);
    refreshIndex();
    const rec = current.fileById.get(page.id);
    if (rec) return rec;
    // The tree refresh races the IPC `treeChanged` event; build a record from
    // the host's reply (which carries the real on-disk `path`) so
    // `vault.create` always resolves to something usable.
    const ts = Date.parse(page.updatedAt) || Date.now();
    const parentDir = page.path.includes("/") ? page.path.slice(0, page.path.lastIndexOf("/")) : "";
    return {
      id: page.id,
      path: page.path,
      name: page.path.split("/").pop() ?? `${page.title}.md`,
      basename: page.title,
      extension: "md",
      parentPath: parentDir,
      ctime: ts,
      mtime: ts,
      size: body.length,
      meta: {
        id: page.id,
        path: page.path,
        kind: page.kind,
        title: page.title,
        icon: page.icon,
        parentId: page.parentId,
        pinned: page.pinned,
        archived: page.archived,
        isDaily: page.isDaily,
        isTemplate: page.isTemplate,
        sortKey: page.sortKey,
        updatedAt: page.updatedAt,
      },
    };
  };

  const createFolder = async (path: string): Promise<void> => {
    await resolveFolderId(path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
  };

  const deletePage = async (id: number): Promise<void> => {
    await invoke(ch.deletePage, { id });
  };

  const renamePage = async (id: number, newPath: string): Promise<void> => {
    const normalized = newPath.replace(/\\/g, "/").replace(/^\/+/, "");
    const slash = normalized.lastIndexOf("/");
    const folderPath = slash < 0 ? "" : normalized.slice(0, slash);
    const fileName = slash < 0 ? normalized : normalized.slice(slash + 1);
    const title = fileName.replace(/\.md$/i, "") || "Untitled";
    const current0 = current.fileById.get(id);
    const newParentId = await resolveFolderId(folderPath);

    if (current0 && current0.parentPath !== folderPath) {
      await invoke(ch.movePage, {
        id,
        parentId: newParentId,
        sortKey: current0.meta.sortKey,
      });
    }
    if (!current0 || current0.basename !== title) {
      await invoke(ch.updatePage, { id, title });
    }
  };

  let lastTree = getState().tree;

  const start = (): void => {
    if (started) return;
    started = true;

    subscribeStore(() => {
      const state = getState();
      // `tree` keeps a stable reference between `refreshTree` calls, so most
      // store updates (palette open, theme, …) skip the rebuild entirely.
      if (state.tree !== lastTree) {
        lastTree = state.tree;
        const next = buildIndex(state.tree);
        const diff = diffIndexes(current, next);
        current = next;
        emit((l) => l.onIndex?.(next));
        if (diff.created.length || diff.deleted.length || diff.renamed.length) {
          emit((l) => l.onDiff?.(diff));
        }
      }
      if (state.activeId !== activeId) {
        activeId = state.activeId;
        emit((l) => l.onActiveFile?.(activeId));
      }
    });

    subscribe(ch.pageSaved, (page: Page) => {
      const record = current.fileById.get(page.id);
      if (record) emit((l) => l.onModify?.(record, page));
      // A title change is structural — `treeChanged` will follow and the
      // store subscription above handles the rename diff.
    });
  };

  return {
    index: () => current,
    subscribe: (listener: BridgeListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    activeFileId: () => activeId,
    readPage,
    modifyPage,
    createPage,
    createFolder,
    deletePage,
    renamePage,
    start,
  };
};

let bridge: VaultBridge | null = null;

export const getBridge = (): VaultBridge => {
  if (!bridge) bridge = createBridge();
  return bridge;
};
