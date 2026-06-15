import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { createVaultBackup, restoreVaultBackup } from "../src/host/vault/backup.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "bethinkbackup"));
  roots.push(dir);
  return dir;
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("vault backup", () => {
  test("backs up and restores vault files", async () => {
    const root = await tempRoot();
    await mkdir(join(root, ".narrative"), { recursive: true });
    await Bun.write(join(root, "Notes.md"), "# Notes\n");
    await Bun.write(join(root, ".narrative", "narrative.sqlite"), "sqlite bytes");
    const backup = join(await tempRoot(), "vault.json");

    const created = await createVaultBackup(root, backup);
    const destination = await tempRoot();
    const restored = await restoreVaultBackup(backup, destination);

    expect(created.files).toBe(2);
    expect(restored.error).toBeNull();
    expect(restored.files).toBe(2);
    expect(await Bun.file(join(restored.root ?? "", "Notes.md")).text()).toBe("# Notes\n");
    expect(await Bun.file(join(restored.root ?? "", ".narrative", "narrative.sqlite")).text()).toBe(
      "sqlite bytes",
    );
  });
});
