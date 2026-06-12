import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "bun:test";
import { renderMarkdown } from "../src/app/lib/markdown.ts";
import { readChannelSource, saveChannel } from "../src/host/agents/channel.ts";
import { readAgentSource, saveAgent } from "../src/host/agents/load.ts";

let roots: string[] = [];

const tempVault = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "narrative-test-"));
  roots.push(root);
  return root;
};

afterEach(async () => {
  const current = roots;
  roots = [];
  await Promise.all(current.map((root) => rm(root, { recursive: true, force: true })));
});

describe("markdown: rendered URL safety", () => {
  test("blocks scriptable link schemes", () => {
    const html = renderMarkdown("[run](javascript:alert(1))");
    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
  });

  test("blocks scriptable image schemes", () => {
    const html = renderMarkdown("![x](javascript:alert(1))");
    expect(html).toContain('src="#"');
    expect(html).not.toContain("javascript:");
  });

  test("keeps safe external and attachment URLs", () => {
    expect(renderMarkdown("[site](https://example.com)")).toContain('href="https://example.com"');
    expect(renderMarkdown("![x](attachments/photo.png)")).toContain(
      'src="attachments/photo.png"',
    );
  });
});

describe("agents: source path safety", () => {
  test("rejects traversal slugs for reads and writes", async () => {
    const root = await tempVault();
    await mkdir(join(root, ".narrative", "agents"), { recursive: true });
    await Bun.write(join(root, ".narrative", "agents", "safe.md"), "---\nname: Safe\n---\nbody");

    expect(await readAgentSource(root, "../outside")).toBeNull();
    expect(await saveAgent(root, "../outside", "bad")).toBeNull();
    expect(await Bun.file(join(root, ".narrative", "outside.md")).exists()).toBe(false);
  });

  test("still reads valid generated slugs", async () => {
    const root = await tempVault();
    await mkdir(join(root, ".narrative", "agents"), { recursive: true });
    await Bun.write(join(root, ".narrative", "agents", "safe.md"), "---\nname: Safe\n---\nbody");

    const source = await readAgentSource(root, "safe");
    expect(source?.path).toBe(".narrative/narrative.sqlite#agents/safe");
    expect(source?.body).toContain('name: "Safe"');
  });
});

describe("channels: source path safety", () => {
  test("rejects traversal slugs for reads and writes", async () => {
    const root = await tempVault();
    await mkdir(join(root, ".narrative", "channels"), { recursive: true });
    await Bun.write(join(root, ".narrative", "channels", "safe.md"), "---\nname: Safe\n---\nbody");

    expect(await readChannelSource(root, "../outside")).toBeNull();
    expect(await saveChannel(root, "../outside", "bad")).toBeNull();
    expect(await Bun.file(join(root, ".narrative", "outside.md")).exists()).toBe(false);
  });
});
