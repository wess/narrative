import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "@basket/db";
import { afterEach, describe, expect, test } from "bun:test";
import { createProject, projectTree } from "../src/host/agents/project.ts";
import {
  analyzeProject,
  cancelProjectRun,
  decideProjectWriteProposal,
  listProjectRuns,
  listProjectWriteProposals,
  proposeProjectWrite,
  runProjectCommand,
  setProjectApprovedCommands,
  setProjectPermissions,
} from "../src/host/agents/project.ts";
import { closeAgentStore } from "../src/host/agents/store.ts";
import {
  changedProjectFilesTool,
  diffProjectFileTool,
  readProjectFile,
  recentProjectRuns,
  runProject,
  writeProjectFile,
} from "../src/host/tools/project.ts";
import type { ToolContext } from "../src/host/tools/types.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "narrativeproject"));
  roots.push(dir);
  return dir;
};

const context = (root: string, projectWrite: boolean): ToolContext => ({
  vault: { root, db: connect(":memory:") } as ToolContext["vault"],
  provider: null,
  requestId: "test",
  emitFocus: () => undefined,
  projectWrite,
});

afterEach(async () => {
  for (const root of roots.splice(0)) {
    closeAgentStore(root);
    await rm(root, { recursive: true, force: true });
  }
});

describe("projects", () => {
  test("builds a visible file tree for registered project folders", async () => {
    const root = await tempRoot();
    const folder = join(root, "app");
    await mkdir(join(folder, "src"), { recursive: true });
    await Bun.write(join(folder, "src", "index.ts"), "export const ok = true;\n");
    const project = await createProject(root, folder);

    const tree = project ? await projectTree(root, project.slug) : null;

    expect(tree?.name).toBe("app");
    expect(tree?.children.some((node) => node.name === "src" && node.kind === "folder")).toBe(
      true,
    );
  });

  test("blocks project writes until the settings gate is enabled", async () => {
    const root = await tempRoot();
    const folder = join(root, "app");
    await mkdir(folder, { recursive: true });
    const project = await createProject(root, folder);
    expect(project).not.toBeNull();
    await setProjectPermissions(root, project?.slug ?? "", { allowWrite: true });

    const blocked = await writeProjectFile.run(context(root, false), {
      project: project?.slug,
      path: "src/index.ts",
      content: "blocked",
    });
    expect(blocked).toEqual({ error: "Project folder writes are disabled in Settings." });

    const written = await writeProjectFile.run(context(root, true), {
      project: project?.slug,
      path: "src/index.ts",
      content: "allowed",
    });
    expect(written).toEqual({ error: "Project writes require confirm: true." });

    const confirmed = await writeProjectFile.run(context(root, true), {
      project: project?.slug,
      path: "src/index.ts",
      content: "allowed",
      confirm: true,
    });
    expect(confirmed).toEqual({ path: "src/index.ts", bytes: 7, snapshotId: null });

    const read = await readProjectFile.run(context(root, false), {
      project: project?.slug,
      path: "src/index.ts",
    });
    expect(read).toEqual({ path: "src/index.ts", content: "allowed" });
  });

  test("snapshots existing files and exposes changed-file diffs", async () => {
    const root = await tempRoot();
    const folder = join(root, "app");
    await mkdir(join(folder, "src"), { recursive: true });
    await Bun.write(join(folder, "src", "index.ts"), "old\n");
    const project = await createProject(root, folder);
    expect(project).not.toBeNull();
    await setProjectPermissions(root, project?.slug ?? "", { allowWrite: true });

    const written = await writeProjectFile.run(context(root, true), {
      project: project?.slug,
      path: "src/index.ts",
      content: "new\n",
      reason: "test change",
      confirm: true,
    });
    expect(written).toMatchObject({ path: "src/index.ts", bytes: 4 });
    expect(typeof (written as { snapshotId?: unknown }).snapshotId).toBe("number");

    const changed = await changedProjectFilesTool.run(context(root, false), {
      project: project?.slug,
    });
    expect(JSON.stringify(changed)).toContain("src/index.ts");

    const diff = await diffProjectFileTool.run(context(root, false), {
      project: project?.slug,
      path: "src/index.ts",
    });
    expect(JSON.stringify(diff)).toContain("-old");
    expect(JSON.stringify(diff)).toContain("+new");
  });

  test("runs project commands and stores run history", async () => {
    const root = await tempRoot();
    const folder = join(root, "app");
    await mkdir(folder, { recursive: true });
    await Bun.write(
      join(folder, "package.json"),
      JSON.stringify({ scripts: { test: "bun --version" } }),
    );
    await Bun.write(join(folder, "bun.lock"), "");
    const project = await createProject(root, folder);
    expect(project).not.toBeNull();
    expect(project?.approvedCommands).toContain("bun run test");
    await setProjectPermissions(root, project?.slug ?? "", { allowRun: true });

    const blocked = await runProject.run(context(root, false), {
      project: project?.slug,
      command: "bun run test",
    });
    expect(blocked).toEqual({ error: "Project command execution is disabled in Settings." });

    const result = await runProject.run(context(root, true), {
      project: project?.slug,
      command: "bun run test",
    });
    expect(result).toEqual({ error: "Project command execution requires confirm: true." });

    const confirmed = await runProject.run(context(root, true), {
      project: project?.slug,
      command: "bun run test",
      confirm: true,
    });
    expect((confirmed as { exitCode?: number }).exitCode).toBe(0);
    expect((confirmed as { stdout?: string }).stdout?.trim()).not.toBe("");

    const runs = await recentProjectRuns.run(context(root, false), { project: project?.slug });
    expect(JSON.stringify(runs)).toContain("bun run test");
  });

  test("rejects unapproved project commands even when run access is enabled", async () => {
    const root = await tempRoot();
    const folder = join(root, "app");
    await mkdir(folder, { recursive: true });
    const project = await createProject(root, folder);
    await setProjectPermissions(root, project?.slug ?? "", { allowRun: true });

    const blocked = await runProject.run(context(root, true), {
      project: project?.slug,
      command: "bun --version",
      confirm: true,
    });

    expect(blocked).toEqual({ error: "Project command is not approved for agent execution." });
  });

  test("queues proposed project writes for approval or rejection", async () => {
    const root = await tempRoot();
    const folder = join(root, "app");
    await mkdir(folder, { recursive: true });
    const project = await createProject(root, folder);
    expect(project).not.toBeNull();

    const proposal = await proposeProjectWrite(
      root,
      project?.slug ?? "",
      "src/index.ts",
      "approved",
      "test proposal",
    );
    expect(proposal).toMatchObject({ path: "src/index.ts", status: "pending" });
    const queued = await listProjectWriteProposals(root);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.diff).toContain("+++ proposal:");

    const rejected = await decideProjectWriteProposal(
      root,
      (proposal as { id: number }).id,
      false,
    );
    expect(rejected).toHaveLength(0);
    expect(await Bun.file(join(folder, "src", "index.ts")).exists()).toBe(false);

    const second = await proposeProjectWrite(
      root,
      project?.slug ?? "",
      "src/index.ts",
      "approved",
      "test approval",
    );
    await decideProjectWriteProposal(root, (second as { id: number }).id, true);
    expect(await Bun.file(join(folder, "src", "index.ts")).text()).toBe("approved");
  });

  test("enforces per-project read, write, and command permissions", async () => {
    const root = await tempRoot();
    const folder = join(root, "app");
    await mkdir(folder, { recursive: true });
    await Bun.write(join(folder, "README.md"), "hello");
    const project = await createProject(root, folder);
    expect(project?.allowRead).toBe(true);
    expect(project?.allowWrite).toBe(false);
    expect(project?.allowRun).toBe(false);

    const writeBlocked = await writeProjectFile.run(context(root, true), {
      project: project?.slug,
      path: "README.md",
      content: "changed",
      confirm: true,
    });
    expect(writeBlocked).toEqual({
      error: "Project write access is disabled for this project.",
    });

    const runBlocked = await runProject.run(context(root, true), {
      project: project?.slug,
      command: "bun --version",
      confirm: true,
    });
    expect(runBlocked).toEqual({
      error: "Project command execution is disabled for this project.",
    });

    await setProjectPermissions(root, project?.slug ?? "", {
      allowRead: false,
      allowWrite: true,
      allowRun: true,
    });
    expect(await projectTree(root, project?.slug ?? "")).toBeNull();
    const readBlocked = await readProjectFile.run(context(root, false), {
      project: project?.slug,
      path: "README.md",
    });
    expect(readBlocked).toEqual({
      error: "Project read access is disabled for this project.",
    });
  });

  test("analyzes project stack, scripts, and recommended commands", async () => {
    const root = await tempRoot();
    const folder = join(root, "app");
    await mkdir(folder, { recursive: true });
    await Bun.write(
      join(folder, "package.json"),
      JSON.stringify({
        scripts: {
          test: "bun test",
          check: "bunx tsc --noEmit",
          deploy: "deploy-now",
        },
        dependencies: { react: "latest" },
        devDependencies: { vite: "latest" },
      }),
    );
    await Bun.write(join(folder, "bun.lock"), "");
    await Bun.write(join(folder, "tsconfig.json"), "{}");
    const project = await createProject(root, folder);

    const analysis = project ? await analyzeProject(root, project.slug) : null;

    expect(analysis?.packageManager).toBe("bun");
    expect(analysis?.stack).toContain("React");
    expect(analysis?.stack).toContain("TypeScript");
    expect(analysis?.scripts.find((script) => script.name === "deploy")?.safe).toBe(false);
    expect(analysis?.recommendedCommands).toContain("bun run test");
    expect(analysis?.approvedCommands).toContain("bun run test");
  });

  test("shows running commands and can cancel them", async () => {
    const root = await tempRoot();
    const folder = join(root, "app");
    await mkdir(folder, { recursive: true });
    const project = await createProject(root, folder);
    expect(project).not.toBeNull();
    await setProjectApprovedCommands(root, project?.slug ?? "", [
      'bun -e "setTimeout(() => {}, 10000)"',
    ]);

    const pending = runProjectCommand(
      root,
      project?.slug ?? "",
      'bun -e "setTimeout(() => {}, 10000)"',
      "",
      20_000,
    );
    let running = (await listProjectRuns(root, project?.slug ?? ""))[0];
    for (let i = 0; i < 20 && !running; i++) {
      await Bun.sleep(10);
      running = (await listProjectRuns(root, project?.slug ?? ""))[0];
    }
    expect(running?.exitCode).toBeNull();
    expect(await cancelProjectRun(root, running?.id ?? -1)).toBe(true);

    const result = await pending;
    expect((result as { exitCode?: number | null }).exitCode).not.toBeNull();
  });
});
