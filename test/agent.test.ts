import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Provider } from "@basket/ai";
import { connect } from "@basket/db";
import { afterEach, describe, expect, test } from "bun:test";
import { runAgent } from "../src/host/agents/run.ts";
import { closeAgentStore } from "../src/host/agents/store.ts";
import type { AgentDef } from "../src/shared/types.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "bethinkagent"));
  roots.push(dir);
  return dir;
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    closeAgentStore(root);
    await rm(root, { recursive: true, force: true });
  }
});

const agent = (tools: readonly string[]): AgentDef => ({
  slug: "tester",
  path: ".narrative/narrative.sqlite#agents/tester",
  name: "Tester",
  description: "",
  icon: "T",
  model: null,
  provider: null,
  tools,
  systemPrompt: "Test agent.",
});

const provider = (content: string): Provider => ({
  name: "fake",
  chat: async () => ({ content, model: "fake", raw: null }),
  chatStream: async function* () {
    yield { delta: content, done: false };
    yield { delta: "", done: true };
  },
});

describe("agent runtime", () => {
  test("empty tool allowlists do not grant every tool", async () => {
    const root = await tempRoot();
    const result = await runAgent({
      provider: provider('<tool name="vault.search">{"query":"x"}</tool>'),
      ctx: {
        vault: { root, db: connect(":memory:") } as never,
        provider: null,
        requestId: "req",
        projectWrite: false,
        emitFocus: () => undefined,
      },
      agent: agent([]),
      messages: [{ role: "user", content: "Search" }],
      contextSystem: "",
      signal: new AbortController().signal,
      maxTurns: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe("maxiterations");
    expect(result.toolCalls?.[0]?.status).toBe("error");
    expect(result.toolCalls?.[0]?.error).toContain("not available");
  });

  test("hitting the loop budget reports maxiterations", async () => {
    const root = await tempRoot();
    const result = await runAgent({
      provider: provider('<tool name="vault.search">{"query":"x"}</tool>'),
      ctx: {
        vault: { root, db: connect(":memory:") } as never,
        provider: null,
        requestId: "req",
        projectWrite: false,
        emitFocus: () => undefined,
      },
      agent: agent(["*"]),
      messages: [{ role: "user", content: "Search" }],
      contextSystem: "",
      signal: new AbortController().signal,
      maxTurns: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe("maxiterations");
    expect(result.iterations).toBe(1);
    expect(result.error).toContain("iteration limit");
  });
});
