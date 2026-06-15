import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createWorkflow,
  deleteWorkflow,
  listWorkflowRuns,
  listWorkflows,
  runWorkflow,
  updateWorkflow,
} from "../src/host/agents/workflow.ts";
import { closeAgentStore } from "../src/host/agents/store.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "bethinkworkflow"));
  roots.push(dir);
  return dir;
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    closeAgentStore(root);
    await rm(root, { recursive: true, force: true });
  }
});

describe("workflows", () => {
  test("stores repeatable procedures, triggers, and run history", async () => {
    const root = await tempRoot();
    const workflow = await createWorkflow(root, {
      name: "Release loop",
      projectSlug: "app",
      channelSlug: "build",
      steps: [
        {
          id: "plan",
          kind: "agent",
          name: "Plan",
          config: { prompt: "Review the project." },
          x: 80,
          y: 100,
        },
        { id: "approve", kind: "approval", name: "Approve", config: {}, x: 300, y: 100 },
      ],
      triggers: [
        { id: "manual", kind: "manual", name: "Manual", config: {}, enabled: true },
        { id: "webhook", kind: "webhook", name: "Webhook", config: { path: "/release" }, enabled: true },
      ],
    });

    expect(workflow).toMatchObject({
      slug: "releaseloop",
      projectSlug: "app",
      channelSlug: "build",
    });
    expect((await listWorkflows(root))[0]?.triggers.map((item) => item.kind)).toEqual([
      "manual",
      "webhook",
    ]);

    const run = await runWorkflow(root, "releaseloop", "webhook", "{\"event\":\"release\"}");
    expect(run?.status).toBe("waiting");
    expect(run?.stepResults.map((item) => item.stepId)).toEqual(["plan", "approve"]);
    expect((await listWorkflowRuns(root, "releaseloop"))[0]?.triggerKind).toBe("webhook");

    const updated = await updateWorkflow(root, "releaseloop", { name: "Release readiness" });
    expect(updated?.name).toBe("Release readiness");

    expect(await deleteWorkflow(root, "releaseloop")).toEqual([]);
  });
});
