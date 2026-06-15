import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, migrate } from "@basket/db";
import { afterEach, describe, expect, test } from "bun:test";
import { closeAgentStore } from "../src/host/agents/store.ts";
import { captureWeb, extractWebPage, listWebCaptures } from "../src/host/capture.ts";
import { getPage } from "../src/host/pages.ts";
import { tables } from "../src/host/schema.ts";
import { initSearch } from "../src/host/search.ts";
import { DEFAULT_CONFIG } from "../src/host/vault/config.ts";
import type { OpenVault } from "../src/host/vault/types.ts";

const roots: string[] = [];

const tempRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "bethinkcapture"));
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
  initSearch(db);
  return {
    root,
    name: "Vault",
    db,
    config: DEFAULT_CONFIG,
    sidecar: { meta: {} },
    watcher: null,
  };
};

describe("web capture", () => {
  test("extracts title, description, and readable text", () => {
    const extracted = extractWebPage(
      "<html><head><title>Article</title><meta name=\"description\" content=\"Summary\"></head><body><script>bad()</script><p>Hello <b>world</b></p></body></html>",
      "Fallback",
    );
    expect(extracted.title).toBe("Article");
    expect(extracted.description).toBe("Summary");
    expect(extracted.text).toContain("Hello world");
    expect(extracted.text).not.toContain("bad()");
  });

  test("captures a web page into a markdown page and sqlite record", async () => {
    const root = await tempRoot();
    const vault = vaultFor(root);
    const capture = await captureWeb(
      vault,
      { url: "example.com/article", notes: "Review later" },
      async () =>
        new Response(
          "<html><head><title>Captured Article</title></head><body><article>Useful text.</article></body></html>",
          { status: 200 },
        ),
    );

    expect(capture?.url).toBe("https://example.com/article");
    expect(capture?.title).toBe("Captured Article");
    const page = capture ? getPage(vault.db, capture.pageId) : null;
    expect(page?.body).toContain("source: \"https://example.com/article\"");
    expect(page?.body).toContain("Review later");
    expect(page?.body).toContain("Useful text.");
    const captures = await listWebCaptures(root);
    expect(captures).toHaveLength(1);
    expect(captures[0]?.pageId).toBe(capture?.pageId);
  });
});
