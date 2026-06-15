import { Buffer } from "node:buffer";
import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

export type VaultBackupResult = {
  readonly path: string | null;
  readonly files: number;
};

export type VaultRestoreResult = {
  readonly root: string | null;
  readonly files: number;
  readonly error: string | null;
};

type BackupFile = {
  readonly path: string;
  readonly data: string;
};

type BackupPayload = {
  readonly app: "bethink";
  readonly version: 1;
  readonly name: string;
  readonly createdAt: string;
  readonly files: readonly BackupFile[];
};

const SKIP = new Set([".DS_Store"]);

const isInside = (root: string, target: string): boolean =>
  target === root || target.startsWith(`${root}${sep}`);

const cleanRel = (path: string): string | null => {
  const rel = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.split("/").some((part) => part === ".." || part === "")) return null;
  return rel;
};

const listFiles = async (root: string, dir = root): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
};

export const createVaultBackup = async (
  root: string,
  outputPath: string,
): Promise<VaultBackupResult> => {
  const base = resolve(root);
  const files: BackupFile[] = [];
  for (const full of await listFiles(base)) {
    const rel = full.slice(base.length).replace(/^\/+/, "");
    if (!cleanRel(rel)) continue;
    const bytes = new Uint8Array(await Bun.file(full).arrayBuffer());
    files.push({ path: rel, data: Buffer.from(bytes).toString("base64") });
  }
  const payload: BackupPayload = {
    app: "bethink",
    version: 1,
    name: basename(base),
    createdAt: new Date().toISOString(),
    files,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, `${JSON.stringify(payload)}\n`);
  return { path: outputPath, files: files.length };
};

export const restoreVaultBackup = async (
  backupPath: string,
  destinationRoot: string,
): Promise<VaultRestoreResult> => {
  const raw = await Bun.file(backupPath)
    .json()
    .catch(() => null);
  if (!raw || typeof raw !== "object") {
    return { root: null, files: 0, error: "Backup file is not valid JSON." };
  }
  const payload = raw as Partial<BackupPayload>;
  if (payload.app !== "bethink" || payload.version !== 1 || !Array.isArray(payload.files)) {
    return { root: null, files: 0, error: "Backup file is not a Bethink backup." };
  }
  const selected = resolve(destinationRoot);
  const existing = await readdir(selected).catch(() => []);
  const target = existing.length === 0 ? selected : join(selected, `bethinkrestore${Date.now()}`);
  await mkdir(target, { recursive: true });
  let files = 0;
  for (const file of payload.files) {
    if (!file || typeof file.path !== "string" || typeof file.data !== "string") continue;
    const rel = cleanRel(file.path);
    if (!rel) continue;
    const full = resolve(target, rel);
    if (!isInside(target, full)) continue;
    await mkdir(dirname(full), { recursive: true });
    await Bun.write(full, Buffer.from(file.data, "base64"));
    files++;
  }
  const info = await stat(target).catch(() => null);
  if (!info?.isDirectory())
    return { root: null, files: 0, error: "Restore folder was not created." };
  return { root: target, files, error: null };
};
