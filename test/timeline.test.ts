import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { closeAgentStore } from "../src/host/agents/store.ts";
import { listAgentRuns, recordAgentRun } from "../src/host/agents/timeline.ts";
import {
  listChannelMessages,
  recordChannelMessage,
} from "../src/host/agents/transcript.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "bethinktimeline"));
  roots.push(dir);
  return dir;
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    closeAgentStore(root);
    await rm(root, { recursive: true, force: true });
  }
});

describe("channel transcripts", () => {
  test("records channel messages in chronological order", async () => {
    const root = await tempRoot();
    await recordChannelMessage(root, {
      channelSlug: "buildroom",
      role: "user",
      content: "What changed?",
    });
    await recordChannelMessage(root, {
      channelSlug: "buildroom",
      agentSlug: "builder",
      role: "assistant",
      content: "The tests are clean.",
      toolCalls: [{ id: "tool1", name: "project.run", args: {}, status: "ok" }],
    });

    const messages = await listChannelMessages(root, "buildroom");

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[1]?.agentSlug).toBe("builder");
    expect(messages[1]?.toolCalls[0]?.name).toBe("project.run");
  });
});

describe("agent run timeline", () => {
  test("records and lists durable agent runs with tool calls", async () => {
    const root = await tempRoot();
    await recordAgentRun(root, {
      requestId: "req1",
      agentSlug: "builder",
      channelSlug: "app",
      userPrompt: "Run tests",
      status: "ok",
      content: "Tests passed",
      toolCalls: [
        {
          id: "tool1",
          name: "project.run",
          args: { command: "bun test" },
          status: "ok",
          result: { exitCode: 0 },
        },
      ],
      durationMs: 42,
    });

    const runs = await listAgentRuns(root);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.agentSlug).toBe("builder");
    expect(runs[0]?.channelSlug).toBe("app");
    expect(runs[0]?.toolCalls[0]?.name).toBe("project.run");
  });
});
