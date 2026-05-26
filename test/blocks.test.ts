// The block editor round-trips a page between Markdown and an editable block
// model on every load and save. If that round-trip drifts it silently
// corrupts files — so it is the single most important thing to pin down.

import { describe, expect, test } from "bun:test";
import { type Block, parseBlocks, serializeBlocks } from "../src/app/lib/blocks.ts";

const roundTrip = (md: string): string => serializeBlocks(parseBlocks(md));

const SAMPLES: Record<string, string> = {
  headings: "# Title\n\n## Section\n\n### Sub",
  paragraph: "A plain paragraph of prose.",
  bulleted: "- one\n- two\n- three",
  numbered: "1. first\n2. second",
  todo: "- [ ] open\n- [x] done",
  nested: "- top\n  - child\n  - child two",
  quote: "> a quoted line",
  callout: "> [!warning] heed this",
  code: "```ts\nconst x = 1;\n```",
  math: "$$\nx^2 + y^2\n$$",
  divider: "before\n\n---\n\nafter",
  image: "![alt text](https://example.com/i.png)",
  embed: "![[Another Page]]",
  table: "| a | b |\n| --- | --- |\n| 1 | 2 |",
  frontmatter: "---\ntitle: Hi\ntags: a, b\n---\n\nbody text",
  mixed: "# Doc\n\nIntro.\n\n- a\n- b\n\n> [!tip] nice\n\n```\nplain code\n```",
};

describe("blocks: markdown round-trip", () => {
  test("serialize(parse(x)) is a fixed point for every sample", () => {
    for (const [name, md] of Object.entries(SAMPLES)) {
      const once = roundTrip(md);
      const twice = roundTrip(once);
      expect(twice, `"${name}" must round-trip stably`).toBe(once);
    }
  });

  test("empty input yields a single empty paragraph", () => {
    const blocks = parseBlocks("");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("paragraph");
    expect(blocks[0]?.text).toBe("");
  });
});

describe("blocks: parsing", () => {
  test("headings keep their level and text", () => {
    expect(parseBlocks("# Hello")[0]).toMatchObject({ type: "h1", text: "Hello" });
    expect(parseBlocks("## Hello")[0]).toMatchObject({ type: "h2", text: "Hello" });
    expect(parseBlocks("### Hello")[0]).toMatchObject({ type: "h3", text: "Hello" });
  });

  test("a checked to-do parses as checked, an open one does not", () => {
    expect(parseBlocks("- [x] done")[0]).toMatchObject({ type: "todo", checked: true });
    expect(parseBlocks("- [ ] open")[0]).toMatchObject({ type: "todo", checked: false });
  });

  test("a fenced block keeps its language and body", () => {
    const block = parseBlocks("```ts\nconst x = 1;\n```")[0];
    expect(block).toMatchObject({ type: "code", lang: "ts", text: "const x = 1;" });
  });

  test("a callout keeps its kind", () => {
    expect(parseBlocks("> [!warning] careful")[0]).toMatchObject({
      type: "callout",
      calloutKind: "warning",
    });
  });

  test("an unknown callout kind falls back to a quote", () => {
    expect(parseBlocks("> [!bogus] hmm")[0]?.type).toBe("quote");
  });

  test("front matter becomes a leading properties block", () => {
    const blocks = parseBlocks("---\ntitle: Hi\n---\n\nbody");
    expect(blocks[0]?.type).toBe("properties");
    expect(blocks[0]?.props).toEqual([{ key: "title", value: "Hi" }]);
    expect(blocks[1]).toMatchObject({ type: "paragraph", text: "body" });
  });

  test("a table parses its header and rows", () => {
    const block = parseBlocks("| a | b |\n| --- | --- |\n| 1 | 2 |")[0];
    expect(block?.type).toBe("table");
    expect(block?.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("nested list items keep an indent level", () => {
    const blocks = parseBlocks("- top\n  - child");
    expect(blocks[0]?.indent ?? 0).toBe(0);
    expect(blocks[1]?.indent).toBe(1);
  });
});

describe("blocks: serialising", () => {
  const block = (b: Partial<Block>): Block => ({ id: "x", type: "paragraph", text: "", ...b });

  test("headings serialise with the right number of hashes", () => {
    expect(serializeBlocks([block({ type: "h1", text: "Hi" })])).toBe("# Hi");
    expect(serializeBlocks([block({ type: "h3", text: "Hi" })])).toBe("### Hi");
  });

  test("a to-do serialises its checkbox state", () => {
    expect(serializeBlocks([block({ type: "todo", text: "x", checked: true })])).toBe("- [x] x");
    expect(serializeBlocks([block({ type: "todo", text: "x", checked: false })])).toBe("- [ ] x");
  });

  test("consecutive list items are not separated by a blank line", () => {
    const out = serializeBlocks([
      block({ type: "bulleted", text: "a" }),
      block({ type: "bulleted", text: "b" }),
    ]);
    expect(out).toBe("- a\n- b");
  });
});
