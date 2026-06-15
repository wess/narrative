// Full-text search and its query operators (`tag:`, `title:`, `content:`,
// `/regex/`) back both the search view and MCP. This drives the real search
// against a throwaway in-memory vault index.

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { connect, type DB, migrate } from "@basket/db";
import { describe, expect, test } from "bun:test";
import { closeAgentStore, openAgentStore } from "../src/host/agents/store.ts";
import { nodesTable, tables, tagsTable } from "../src/host/schema.ts";
import { indexPage, initSearch, runSearch, runUnifiedSearch } from "../src/host/search.ts";

type Seed = { path: string; title: string; body: string; tags?: string[]; archived?: boolean };

const makeVault = (pages: Seed[]): { db: DB; idOf: Record<string, number> } => {
  const db = connect(":memory:");
  migrate(db, tables);
  initSearch(db);
  const idOf: Record<string, number> = {};
  for (const p of pages) {
    const row = db.insert(nodesTable, {
      path: p.path,
      kind: "file",
      title: p.title,
      body: p.body,
      archived: p.archived ?? false,
    });
    idOf[p.title] = row.id;
    indexPage(db, row.id, p.title, p.body);
    for (const tag of p.tags ?? []) db.insert(tagsTable, { nodeId: row.id, tag });
  }
  return { db, idOf };
};

const found = (db: DB, query: string): number[] =>
  runSearch(db, query)
    .map((h) => h.id)
    .sort((a, b) => a - b);

describe("search: full-text", () => {
  test("a plain query matches words in the body", () => {
    const { db, idOf } = makeVault([
      { path: "a.md", title: "Alpha", body: "the quick brown fox" },
      { path: "b.md", title: "Beta", body: "a lazy sleeping dog" },
    ]);
    expect(found(db, "quick")).toEqual([idOf.Alpha]);
    expect(found(db, "dog")).toEqual([idOf.Beta]);
  });

  test("a query that matches nothing returns nothing", () => {
    const { db } = makeVault([{ path: "a.md", title: "Alpha", body: "hello world" }]);
    expect(found(db, "nonexistent")).toEqual([]);
  });
});

describe("search: operators", () => {
  const vault = () =>
    makeVault([
      { path: "fox.md", title: "Foxes", body: "quick brown fox", tags: ["animal", "wild"] },
      { path: "dog.md", title: "Dogs", body: "loyal companion", tags: ["animal/pet"] },
      { path: "car.md", title: "Cars", body: "fast machine", tags: ["object"] },
      { path: "old.md", title: "Archived Animal", body: "fox", tags: ["animal"], archived: true },
    ]);

  test("tag: matches a tag, and a parent tag matches nested ones", () => {
    const { db, idOf } = vault();
    expect(found(db, "tag:wild")).toEqual([idOf.Foxes]);
    // `animal` should also match the nested `animal/pet`.
    expect(found(db, "tag:animal")).toEqual([idOf.Foxes, idOf.Dogs].sort((a, b) => a - b));
  });

  test("title: matches words in the title", () => {
    const { db, idOf } = vault();
    expect(found(db, "title:cars")).toEqual([idOf.Cars]);
  });

  test("/regex/ matches the body", () => {
    const { db, idOf } = vault();
    expect(found(db, "/f.x/")).toEqual([idOf.Foxes]);
  });

  test("unsafe regex patterns are ignored instead of evaluated", () => {
    const { db } = makeVault([
      { path: "a.md", title: "Long", body: `${"a".repeat(500)}!` },
    ]);
    expect(found(db, "/(a+)+$/")).toEqual([]);
  });

  test("filtered operators exclude archived pages", () => {
    const { db, idOf } = vault();
    // "Archived Animal" is tagged `animal` but archived — it must not appear.
    expect(found(db, "tag:animal")).not.toContain(idOf["Archived Animal"]);
  });

  test("operators combine with plain text", () => {
    const { db, idOf } = vault();
    expect(found(db, "tag:animal brown")).toEqual([idOf.Foxes]);
  });
});

describe("search: unified", () => {
  test("finds pages and durable agent workspace records", async () => {
    const root = await mkdtemp(`${tmpdir()}/bethinksearch`);
    const { db } = makeVault([
      { path: "roadmap.md", title: "Roadmap", body: "The agent harness needs transcripts." },
    ]);
    const store = await openAgentStore(root);
    store.exec(
      `INSERT INTO agents (slug, name, description, icon, tools, systemPrompt)
        VALUES (?, ?, ?, ?, ?, ?)`,
      "planner",
      "Avery Planner",
      "Plans agent harness work.",
      "A",
      "[]",
      "Coordinate agent harness tasks.",
    );
    store.exec(
      `INSERT INTO channels (slug, name, description, icon, brief)
        VALUES (?, ?, ?, ?, ?)`,
      "buildroom",
      "Build Room",
      "Channel for harness development.",
      "C",
      "Discuss transcripts and approvals.",
    );
    store.exec(
      `INSERT INTO projects (slug, name, path, description)
        VALUES (?, ?, ?, ?)`,
      "harness",
      "Harness",
      root,
      "Agent harness project.",
    );
    store.exec(
      `INSERT INTO memories (scope, content, source)
        VALUES (?, ?, ?)`,
      "global",
      "Remember that transcripts matter for agent harness trust.",
      "chat",
    );
    store.exec(
      `INSERT INTO channelMessages (channelSlug, role, content)
        VALUES (?, ?, ?)`,
      "buildroom",
      "assistant",
      "Transcript entry about the agent harness.",
    );

    const hits = await runUnifiedSearch(root, db, "harness");
    closeAgentStore(root);

    expect(hits.map((hit) => hit.kind)).toContain("page");
    expect(hits.map((hit) => hit.kind)).toContain("agent");
    expect(hits.map((hit) => hit.kind)).toContain("channel");
    expect(hits.map((hit) => hit.kind)).toContain("project");
    expect(hits.map((hit) => hit.kind)).toContain("memory");
    expect(hits.map((hit) => hit.kind)).toContain("transcript");
  });
});
