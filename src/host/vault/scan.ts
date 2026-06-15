// Walk a vault folder into a flat list of node descriptors — every
// subfolder and every `.md` file. Dotfolders (`.narrative`, `.git`, …) and
// non-Markdown files are skipped: attachments aren't pages, and Bethink's
// tree only shows folders and notes.

import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export type ScannedNode = {
  readonly path: string; // vault-relative, "/"-separated
  readonly kind: "file" | "folder";
  readonly title: string; // file basename without `.md`, or folder name
  readonly body: string; // file content; "" for folders
  readonly mtime: number;
  readonly birthtime: number;
};

const IGNORED_DIRS = new Set(["node_modules"]);

export const scanVault = async (root: string): Promise<ScannedNode[]> => {
  const out: ScannedNode[] = [];

  const walk = async (absDir: string, relDir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return; // unreadable directory — skip it rather than fail the whole scan
    }
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith(".")) continue; // dotfiles / dotfolders are not vault content
      const relPath = relDir ? `${relDir}/${name}` : name;
      const absPath = join(absDir, name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(name)) continue;
        const s = await stat(absPath).catch(() => null);
        out.push({
          path: relPath,
          kind: "folder",
          title: name,
          body: "",
          mtime: s?.mtimeMs ?? 0,
          birthtime: s?.birthtimeMs ?? 0,
        });
        await walk(absPath, relPath);
      } else if (entry.isFile() && name.toLowerCase().endsWith(".md")) {
        const s = await stat(absPath).catch(() => null);
        const body = await Bun.file(absPath)
          .text()
          .catch(() => "");
        out.push({
          path: relPath,
          kind: "file",
          title: name.slice(0, -3),
          body,
          mtime: s?.mtimeMs ?? 0,
          birthtime: s?.birthtimeMs ?? 0,
        });
      }
    }
  };

  await walk(root, "");
  return out;
};
