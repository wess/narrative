import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "bun:test";
import {
  closeMemory,
  deleteMemory,
  listChannelMemories,
  listGlobalMemories,
  listMemories,
  memoryContext,
  rememberTurn,
  setMemoryPinned,
} from "../src/host/agents/memory.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "narrativememory"));
  roots.push(root);
  return root;
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    closeMemory(root);
    await rm(root, { recursive: true, force: true });
  }
});

describe("agent memory", () => {
  test("records turns into global memory", async () => {
    const root = await tempRoot();
    await rememberTurn(root, {
      agentSlug: "mira",
      user: "Remember that I prefer terse specs.",
      assistant: "Noted.",
    });

    const global = await listGlobalMemories(root);
    expect(global).toHaveLength(1);
    expect(global[0]?.scope).toBe("global");
    expect(global[0]?.agentSlug).toBe("mira");
    expect(global[0]?.content).toContain("terse specs");
  });

  test("records channel turns into both global and channel memory", async () => {
    const root = await tempRoot();
    await rememberTurn(root, {
      channelSlug: "buildroom",
      agentSlug: "architect",
      user: "The project needs a loop runner.",
      assistant: "I will track that as a channel concern.",
    });

    const global = await listGlobalMemories(root);
    const channel = await listChannelMemories(root, "buildroom");
    const other = await listChannelMemories(root, "otherroom");

    expect(global).toHaveLength(1);
    expect(channel).toHaveLength(1);
    expect(other).toHaveLength(0);
    expect(global[0]?.content).toContain("Channel buildroom");
    expect(channel[0]?.content).not.toContain("Channel buildroom");
  });

  test("formats global and channel memory for model context", async () => {
    const root = await tempRoot();
    await rememberTurn(root, {
      user: "Global preference is short answers.",
      assistant: "Understood.",
    });
    await rememberTurn(root, {
      channelSlug: "research",
      user: "Channel goal is source review.",
      assistant: "I will keep reviews sourced.",
    });

    const context = await memoryContext(root, { channelSlug: "research" });

    expect(context).toContain("Global memory:");
    expect(context).toContain("Channel memory (research):");
    expect(context).toContain("short answers");
    expect(context).toContain("source review");
  });

  test("pins and deletes memories for user management", async () => {
    const root = await tempRoot();
    await rememberTurn(root, {
      user: "Keep this around.",
      assistant: "Stored.",
    });
    const [memory] = await listMemories(root);
    expect(memory?.pinned).toBe(false);

    await setMemoryPinned(root, memory?.id ?? -1, true);
    const [pinned] = await listMemories(root);
    expect(pinned?.pinned).toBe(true);

    await deleteMemory(root, pinned?.id ?? -1);
    expect(await listMemories(root)).toHaveLength(0);
  });
});
