// Every filesystem mutation the vault makes goes through here, so two things
// stay uniform: parent directories are created on demand, and each write is
// recorded as a "self-write" the watcher can ignore (otherwise Narrative's
// own saves would echo back through the watcher as external changes).

import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

// A self-write entry is either an exact `mtime` (a content write — the
// watcher matches the file's mtime to recognise its own echo, and any later
// edit with a different mtime is genuinely external) or a short time
// `window` for structural ops (mkdir / rename / rm) that have no single
// mtime to key on.
type SelfWrite = { readonly mtime: number } | { readonly until: number };
const selfWrites = new Map<string, SelfWrite>();
const SELF_WRITE_TTL = 1500;

export const markSelfWrite = (absPath: string, mtime?: number): void => {
  selfWrites.set(absPath, mtime !== undefined ? { mtime } : { until: Date.now() + SELF_WRITE_TTL });
};

// `currentMtime` is the file's mtime *now* (undefined if it no longer
// exists). For an mtime-keyed entry that's the precise test; for a windowed
// entry it falls back to the time check.
export const isSelfWrite = (absPath: string, currentMtime?: number): boolean => {
  const entry = selfWrites.get(absPath);
  if (!entry) return false;
  if ("mtime" in entry) {
    // File gone, or mtime moved on → it's an external change, not our echo.
    if (currentMtime === undefined || currentMtime !== entry.mtime) {
      selfWrites.delete(absPath);
      return false;
    }
    return true;
  }
  if (entry.until < Date.now()) {
    selfWrites.delete(absPath);
    return false;
  }
  return true;
};

export const pathExists = async (abs: string): Promise<boolean> => {
  try {
    await stat(abs);
    return true;
  } catch {
    return false;
  }
};

export const dirExists = async (abs: string): Promise<boolean> => {
  try {
    return (await stat(abs)).isDirectory();
  } catch {
    return false;
  }
};

export const mtimeOf = async (abs: string): Promise<number> => {
  try {
    return (await stat(abs)).mtimeMs;
  } catch {
    return 0;
  }
};

// Write a Markdown file, creating parent folders. Returns the new mtime.
export const writeMarkdown = async (
  root: string,
  relPath: string,
  content: string,
): Promise<number> => {
  const abs = join(root, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await Bun.write(abs, content);
  // Key the self-write on the resulting mtime — the watcher matches it
  // exactly, so an external edit (different mtime) is never mistaken for us.
  const mtime = await mtimeOf(abs);
  markSelfWrite(abs, mtime);
  return mtime;
};

export const makeFolder = async (root: string, relPath: string): Promise<void> => {
  const abs = join(root, relPath);
  markSelfWrite(abs);
  await mkdir(abs, { recursive: true });
};

export const removePath = async (root: string, relPath: string): Promise<void> => {
  const abs = join(root, relPath);
  markSelfWrite(abs);
  await rm(abs, { recursive: true, force: true });
};

export const movePath = async (root: string, fromRel: string, toRel: string): Promise<void> => {
  const fromAbs = join(root, fromRel);
  const toAbs = join(root, toRel);
  await mkdir(dirname(toAbs), { recursive: true });
  markSelfWrite(fromAbs);
  markSelfWrite(toAbs);
  await rename(fromAbs, toAbs);
};

// Write a pasted image into the vault's `attachments/` folder under a free
// name. Returns the vault-relative path to record in the page's Markdown.
// Attachments aren't `.md`, so the watcher ignores them — no self-write mark.
export const writeAttachment = async (
  root: string,
  name: string,
  bytes: Uint8Array,
): Promise<string> => {
  const extMatch = /\.[a-z0-9]+$/i.exec(name);
  const ext = extMatch ? extMatch[0].toLowerCase() : ".png";
  const stem = name.slice(0, name.length - (extMatch?.[0]?.length ?? 0));
  const base = stem.replace(/[\\/:*?"<>|]+/g, "-").trim() || "image";
  let rel = `attachments/${base}${ext}`;
  let n = 1;
  while (await pathExists(join(root, rel))) {
    rel = `attachments/${base} ${n}${ext}`;
    n += 1;
  }
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await Bun.write(abs, bytes);
  return rel;
};

// Turn a desired path into a free one — "Notes/Idea.md" -> "Notes/Idea 1.md"
// when taken. Works for both files (keeps the `.md`) and folders.
export const uniqueRelPath = async (root: string, relPath: string): Promise<string> => {
  const isMd = relPath.toLowerCase().endsWith(".md");
  const base = isMd ? relPath.slice(0, -3) : relPath;
  const ext = isMd ? ".md" : "";
  let candidate = relPath;
  let n = 1;
  while (await pathExists(join(root, candidate))) {
    candidate = `${base} ${n}${ext}`;
    n++;
  }
  return candidate;
};
