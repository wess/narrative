import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  buildKanbanPrompt,
  createKanbanCard,
  deleteKanbanCard,
  listKanbanBoard,
  moveKanbanCard,
  updateKanbanCard,
} from "../src/host/agents/kanban.ts";
import { closeAgentStore } from "../src/host/agents/store.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "bethinkkanban"));
  roots.push(dir);
  return dir;
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    closeAgentStore(root);
    await rm(root, { recursive: true, force: true });
  }
});

describe("kanban", () => {
  test("stores scoped cards and builds agent prompts", async () => {
    const root = await tempRoot();
    const card = await createKanbanCard(root, {
      projectSlug: "app",
      title: "Fix release blocker",
      description: "The content area should scroll.",
      priority: "high",
      agentSlug: "builder",
    });

    expect(card).toMatchObject({
      title: "Fix release blocker",
      status: "backlog",
      priority: "high",
      agentSlug: "builder",
    });

    const moved = card ? await moveKanbanCard(root, card.id, "doing") : null;
    expect(moved?.status).toBe("doing");

    const updated = moved
      ? await updateKanbanCard(root, moved.id, { title: "Fix scrolling", priority: "normal" })
      : null;
    expect(updated).toMatchObject({ title: "Fix scrolling", priority: "normal" });

    const board = await listKanbanBoard(root, { projectSlug: "app" });
    expect(board.cards.map((item) => item.title)).toEqual(["Fix scrolling"]);

    const prompt = updated ? await buildKanbanPrompt(root, updated.id) : null;
    expect(prompt?.agentSlug).toBe("builder");
    expect(prompt?.prompt).toContain("Fix scrolling");
    expect(prompt?.prompt).toContain("doing");

    const empty = updated ? await deleteKanbanCard(root, updated.id) : null;
    expect(empty?.cards).toEqual([]);
  });
});
