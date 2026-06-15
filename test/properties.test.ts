import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, migrate } from "@basket/db";
import { afterEach, describe, expect, test } from "bun:test";
import { createProject } from "../src/host/agents/project.ts";
import { closeAgentStore } from "../src/host/agents/store.ts";
import { buildBaseView } from "../src/host/properties.ts";
import { nodesTable, tables } from "../src/host/schema.ts";
import { DEFAULT_CONFIG } from "../src/host/vault/config.ts";
import type { OpenVault } from "../src/host/vault/types.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "bethinkproperties"));
  roots.push(dir);
  return dir;
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    closeAgentStore(root);
    await rm(root, { recursive: true, force: true });
  }
});

describe("properties", () => {
  test("builds a sqlite-backed base view from page frontmatter and native records", async () => {
    const root = await tempRoot();
    const db = connect(":memory:");
    migrate(db, tables);
    db.insert(nodesTable, {
      path: "Plan.md",
      kind: "file",
      title: "Plan",
      body: "---\nstatus: active\ntags: [project, ai]\n---\n\nBody",
      parentId: null,
      mtime: Date.now(),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    await createProject(root, root);
    const vault: OpenVault = {
      root,
      name: "Vault",
      db,
      config: DEFAULT_CONFIG,
      sidecar: { meta: {} },
      watcher: null,
    };

    const view = await buildBaseView(vault);

    const page = view.rows.find((row) => row.subjectType === "page" && row.subjectName === "Plan");
    expect(page?.values.status).toBe("active");
    expect(page?.values.tags).toBe("project, ai");
    expect(view.rows.some((row) => row.subjectType === "project")).toBe(true);
    expect(view.columns).toContain("name");
    expect(view.columns).toContain("path");
  });
});
