import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, migrate } from "@basket/db";
import { afterEach, describe, expect, test } from "bun:test";
import { createProject } from "../src/host/agents/project.ts";
import { closeAgentStore } from "../src/host/agents/store.ts";
import { addCanvasNode, buildCanvasView, moveCanvasNode, removeCanvasNode } from "../src/host/canvas.ts";
import { nodesTable, tables } from "../src/host/schema.ts";
import { DEFAULT_CONFIG } from "../src/host/vault/config.ts";
import type { OpenVault } from "../src/host/vault/types.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "bethinkcanvas"));
  roots.push(dir);
  return dir;
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    closeAgentStore(root);
    await rm(root, { recursive: true, force: true });
  }
});

const vaultFor = (root: string): OpenVault => {
  const db = connect(":memory:");
  migrate(db, tables);
  db.insert(nodesTable, {
    path: "Map.md",
    kind: "file",
    title: "Map",
    body: "Canvas seed",
    parentId: null,
    mtime: Date.now(),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });
  return {
    root,
    name: "Vault",
    db,
    config: DEFAULT_CONFIG,
    sidecar: { meta: {} },
    watcher: null,
  };
};

describe("canvas", () => {
  test("seeds nodes from vault records and persists moved positions", async () => {
    const root = await tempRoot();
    await createProject(root, root);
    const vault = vaultFor(root);

    const view = await buildCanvasView(vault);
    const page = view.nodes.find((node) => node.subjectType === "page" && node.title === "Map");
    expect(page).toBeDefined();
    expect(view.nodes.some((node) => node.subjectType === "project")).toBe(true);

    const moved = page ? await moveCanvasNode(vault, page.id, 321, 234) : null;
    const movedPage = moved?.nodes.find((node) => node.id === page?.id);
    expect(movedPage?.x).toBe(321);
    expect(movedPage?.y).toBe(234);

    const hidden = page ? await removeCanvasNode(vault, page.id) : null;
    expect(hidden?.nodes.some((node) => node.id === page?.id)).toBe(false);
    expect(hidden?.availableNodes.some((node) => node.id === page?.id)).toBe(true);

    const restored = page ? await addCanvasNode(vault, page.id) : null;
    expect(restored?.nodes.some((node) => node.id === page?.id)).toBe(true);

    vault.db.exec("DELETE FROM nodes WHERE title = ?", "Map");
    const pruned = await buildCanvasView(vault);
    expect(pruned.nodes.some((node) => node.id === page?.id)).toBe(false);
  });
});
