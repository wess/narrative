import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createHarnessScenario,
  listHarnessRuns,
  listHarnessScenarios,
  recordHarnessRun,
} from "../src/host/agents/harness.ts";
import { closeAgentStore } from "../src/host/agents/store.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "bethinkharness"));
  roots.push(dir);
  return dir;
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    closeAgentStore(root);
    await rm(root, { recursive: true, force: true });
  }
});

describe("agent harness", () => {
  test("stores scenarios and recorded loop results", async () => {
    const root = await tempRoot();
    const scenario = await createHarnessScenario(root, {
      name: "Loop budget",
      agentSlug: "builder",
      channelSlug: "project",
      prompt: "Implement the smallest useful change.",
      expected: "Stops with a clear summary.",
      tools: ["project.read", "project.propose"],
      maxIterations: 4,
    });

    expect(scenario).toMatchObject({
      slug: "loopbudget",
      agentSlug: "builder",
      maxIterations: 4,
    });
    expect((await listHarnessScenarios(root))[0]?.tools).toEqual(["project.read", "project.propose"]);

    const run = await recordHarnessRun(root, {
      scenarioSlug: "loopbudget",
      status: "fail",
      score: 0.25,
      notes: "Reached the loop cap.",
      stopReason: "maxiterations",
      iterations: 4,
    });

    expect(run).toMatchObject({ scenarioSlug: "loopbudget", stopReason: "maxiterations" });
    expect((await listHarnessRuns(root, "loopbudget"))[0]?.notes).toContain("loop cap");
  });
});
