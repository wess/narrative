// The Stohr sync engine — a two-way reconcile of the vault folder with a
// folder tree on a Stohr account.
//
// The vault is always the source of truth on disk; Stohr is a mirror. Stohr
// has no delta/changes API, so a sync walks both sides in full and compares
// against `.narrative/stohr.json` — a per-vault map of `path -> { fileId,
// version, mtime, size }` recorded at the end of the previous sync. From that
// baseline every path falls into exactly one case: unchanged, changed on one
// side (push or pull), changed on both (conflict), or deleted on one side
// (propagate the delete).
//
// Downloads are written with a plain `Bun.write` (no self-write marker), so
// the vault watcher folds them into the index; the host also reconciles the
// touched paths directly, which covers platforms whose recursive watch misses
// nested files.

import type { Dirent } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OpenVault } from "../vault/types.ts";
import {
  type StohrFile,
  stohrCreateFolder,
  stohrDeleteFile,
  stohrDownloadFile,
  stohrListFiles,
  stohrListFolders,
  stohrUploadFile,
} from "./client.ts";

const STATE_FILE = join(".narrative", "stohr.json");

// Markdown plus the attachment types the editor can embed — everything that
// makes up the knowledge in a vault. Other files are left alone.
const SYNCABLE = new Set([".md", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf"]);

const MIME: Record<string, string> = {
  ".md": "text/markdown",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

const extOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

const mimeFor = (name: string): string => MIME[extOf(name)] ?? "application/octet-stream";

// `Projects/API.md` -> `Projects/API (stohr conflict).md`.
const conflictName = (rel: string): string => {
  const dot = rel.lastIndexOf(".");
  const stamp = new Date().toISOString().slice(0, 10);
  return dot < 0
    ? `${rel} (stohr conflict ${stamp})`
    : `${rel.slice(0, dot)} (stohr conflict ${stamp})${rel.slice(dot)}`;
};

// --- persisted sync state -------------------------------------------------

type FileEntry = { fileId: string; version: number; mtime: number; size: number };

type SyncState = {
  rootFolderId: string | null;
  files: Record<string, FileEntry>;
  folders: Record<string, string>; // vault-relative folder path -> Stohr folder id
};

const loadState = async (root: string): Promise<SyncState> => {
  try {
    const raw = (await Bun.file(join(root, STATE_FILE)).json()) as Partial<SyncState>;
    return {
      rootFolderId: raw.rootFolderId ?? null,
      files: raw.files ?? {},
      folders: raw.folders ?? {},
    };
  } catch {
    return { rootFolderId: null, files: {}, folders: {} };
  }
};

const saveState = async (root: string, state: SyncState): Promise<void> => {
  await mkdir(join(root, ".narrative"), { recursive: true });
  await Bun.write(join(root, STATE_FILE), JSON.stringify(state, null, 2));
};

// --- walking both sides ---------------------------------------------------

type LocalFile = { rel: string; mtime: number; size: number };

const walkLocal = async (root: string): Promise<LocalFile[]> => {
  const out: LocalFile[] = [];
  const walk = async (absDir: string, relDir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile() && SYNCABLE.has(extOf(entry.name))) {
        const s = await stat(abs).catch(() => null);
        if (s) out.push({ rel, mtime: Math.floor(s.mtimeMs), size: s.size });
      }
    }
  };
  await walk(root, "");
  return out;
};

type RemoteTree = { files: Map<string, StohrFile>; folders: Map<string, string> };

const walkRemote = async (
  baseURL: string,
  token: string,
  rootFolderId: string,
): Promise<RemoteTree> => {
  const files = new Map<string, StohrFile>();
  const folders = new Map<string, string>();
  const queue: { id: string; rel: string }[] = [{ id: rootFolderId, rel: "" }];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    for (const folder of await stohrListFolders(baseURL, token, node.id)) {
      const rel = node.rel ? `${node.rel}/${folder.name}` : folder.name;
      folders.set(rel, folder.id);
      queue.push({ id: folder.id, rel });
    }
    for (const file of await stohrListFiles(baseURL, token, node.id)) {
      const rel = node.rel ? `${node.rel}/${file.name}` : file.name;
      files.set(rel, file);
    }
  }
  return { files, folders };
};

// --- the sync -------------------------------------------------------------

export type SyncSummary = {
  pulled: number;
  pushed: number;
  deleted: number;
  conflicts: string[];
  // Vault-relative paths sync wrote or removed — handed to the index so the
  // sidebar reflects them even where the filesystem watcher can't.
  changedPaths: string[];
};

// Find — creating along the way — the Stohr folder id for a vault-relative
// directory, recording each id in `state.folders`.
const ensureRemoteFolder = async (
  baseURL: string,
  token: string,
  state: SyncState,
  rootId: string,
  relDir: string,
): Promise<string> => {
  if (relDir === "" || relDir === ".") return rootId;
  const cached = state.folders[relDir];
  if (cached) return cached;
  const parentRel = dirname(relDir) === "." ? "" : dirname(relDir);
  const parentId = await ensureRemoteFolder(baseURL, token, state, rootId, parentRel);
  const name = relDir.split("/").pop() ?? relDir;
  const siblings = await stohrListFolders(baseURL, token, parentId);
  const existing = siblings.find((f) => f.name === name);
  const id = existing ? existing.id : (await stohrCreateFolder(baseURL, token, name, parentId)).id;
  state.folders[relDir] = id;
  return id;
};

// The vault's own folder on Stohr — created once, then remembered.
const ensureRootFolder = async (
  baseURL: string,
  token: string,
  state: SyncState,
  vaultName: string,
): Promise<string> => {
  if (state.rootFolderId) return state.rootFolderId;
  const top = await stohrListFolders(baseURL, token, null);
  const existing = top.find((f) => f.name === vaultName);
  const id = existing ? existing.id : (await stohrCreateFolder(baseURL, token, vaultName, null)).id;
  state.rootFolderId = id;
  return id;
};

export const syncVault = async (
  vault: OpenVault,
  baseURL: string,
  token: string,
): Promise<SyncSummary> => {
  const root = vault.root;
  const state = await loadState(root);
  const summary: SyncSummary = {
    pulled: 0,
    pushed: 0,
    deleted: 0,
    conflicts: [],
    changedPaths: [],
  };

  const rootId = await ensureRootFolder(baseURL, token, state, vault.name);
  const remote = await walkRemote(baseURL, token, rootId);
  // Seed the folder cache from the remote walk so uploads rarely re-list.
  for (const [rel, id] of remote.folders) state.folders[rel] = id;

  const local = new Map((await walkLocal(root)).map((f) => [f.rel, f]));

  // Write a remote file's bytes to `asPath` (the file's own path, or a
  // conflict sibling). Only a same-path write updates the recorded baseline.
  const download = async (rel: string, file: StohrFile, asPath: string): Promise<void> => {
    const bytes = await stohrDownloadFile(baseURL, token, file.id);
    const abs = join(root, asPath);
    await mkdir(dirname(abs), { recursive: true });
    await Bun.write(abs, bytes);
    summary.changedPaths.push(asPath);
    if (asPath === rel) {
      const s = await stat(abs);
      state.files[rel] = {
        fileId: file.id,
        version: file.version,
        mtime: Math.floor(s.mtimeMs),
        size: s.size,
      };
    }
  };

  const upload = async (rel: string): Promise<void> => {
    const abs = join(root, rel);
    const bytes = await Bun.file(abs).arrayBuffer();
    const folderId = await ensureRemoteFolder(
      baseURL,
      token,
      state,
      rootId,
      dirname(rel) === "." ? "" : dirname(rel),
    );
    const name = rel.split("/").pop() ?? rel;
    const uploaded = await stohrUploadFile(baseURL, token, folderId, name, bytes, mimeFor(name));
    const s = await stat(abs);
    state.files[rel] = {
      fileId: uploaded.id,
      version: uploaded.version,
      mtime: Math.floor(s.mtimeMs),
      size: s.size,
    };
  };

  const paths = new Set<string>([
    ...local.keys(),
    ...remote.files.keys(),
    ...Object.keys(state.files),
  ]);

  for (const rel of paths) {
    const lf = local.get(rel);
    const rf = remote.files.get(rel);
    const st = state.files[rel];
    try {
      if (lf && rf && st) {
        const localChanged = lf.mtime !== st.mtime || lf.size !== st.size;
        const remoteChanged = rf.version !== st.version;
        if (localChanged && remoteChanged) {
          // Both moved — keep the local copy, park the remote one beside it.
          await download(rel, rf, conflictName(rel));
          await upload(rel);
          summary.conflicts.push(rel);
          summary.pushed += 1;
        } else if (localChanged) {
          await upload(rel);
          summary.pushed += 1;
        } else if (remoteChanged) {
          await download(rel, rf, rel);
          summary.pulled += 1;
        }
      } else if (lf && rf && !st) {
        // First time both sides have this path. Same size → assume identical
        // and just adopt the baseline; otherwise treat it as a conflict.
        if (lf.size === rf.size) {
          state.files[rel] = { fileId: rf.id, version: rf.version, mtime: lf.mtime, size: lf.size };
        } else {
          await download(rel, rf, conflictName(rel));
          await upload(rel);
          summary.conflicts.push(rel);
          summary.pushed += 1;
        }
      } else if (lf && !rf && st) {
        // Synced before, now gone from Stohr → propagate the delete locally.
        await rm(join(root, rel), { force: true });
        delete state.files[rel];
        summary.changedPaths.push(rel);
        summary.deleted += 1;
      } else if (lf && !rf && !st) {
        await upload(rel);
        summary.pushed += 1;
      } else if (!lf && rf && st) {
        // Synced before, now gone locally → propagate the delete to Stohr.
        await stohrDeleteFile(baseURL, token, rf.id);
        delete state.files[rel];
        summary.deleted += 1;
      } else if (!lf && rf && !st) {
        await download(rel, rf, rel);
        summary.pulled += 1;
      } else {
        // Gone from both sides — just drop the stale baseline entry.
        delete state.files[rel];
      }
    } catch (e) {
      summary.conflicts.push(`${rel} — ${(e as Error).message}`);
    }
  }

  await saveState(root, state);
  return summary;
};
