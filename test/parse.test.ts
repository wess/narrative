// The host derives links, tags, and search snippets straight from a page's
// Markdown body. These pure functions back backlinks, the tag tree, and the
// graph — wrong output here quietly breaks all three.

import { describe, expect, test } from "bun:test";
import {
  extractLinks,
  extractTags,
  linkKey,
  snippetAround,
  splitTarget,
  wordCount,
} from "../src/host/parse.ts";

describe("parse: wiki links", () => {
  test("extracts plain links", () => {
    const links = extractLinks("see [[Page A]] and [[Page B]]");
    expect(links.map((l) => l.title)).toEqual(["Page A", "Page B"]);
  });

  test("splits a heading anchor off the title", () => {
    const [link] = extractLinks("jump to [[Page B#Heading]]");
    expect(link).toMatchObject({ title: "Page B", anchor: "Heading" });
  });

  test("captures a link alias", () => {
    const [link] = extractLinks("[[Real Title|shown text]]");
    expect(link).toMatchObject({ title: "Real Title", alias: "shown text" });
  });

  test("deduplicates links to the same page", () => {
    expect(extractLinks("[[A]] then [[A]] again")).toHaveLength(1);
  });

  test("ignores a same-page anchor-only link", () => {
    expect(extractLinks("[[#just-a-heading]]")).toHaveLength(0);
  });
});

describe("parse: tags", () => {
  test("extracts tags, lower-cased and sorted", () => {
    expect(extractTags("#Zebra and #apple")).toEqual(["apple", "zebra"]);
  });

  test("supports nested tags", () => {
    expect(extractTags("#project/narrative")).toEqual(["project/narrative"]);
  });

  test("does not treat code spans or fences as prose", () => {
    expect(extractTags("`#notatag` and ```\n#alsonot\n```")).toEqual([]);
  });

  test("deduplicates repeated tags", () => {
    expect(extractTags("#todo #todo #todo")).toEqual(["todo"]);
  });
});

describe("parse: helpers", () => {
  test("linkKey normalises whitespace and case", () => {
    expect(linkKey("  Hello World  ")).toBe("hello world");
  });

  test("splitTarget separates title and anchor", () => {
    expect(splitTarget("Page#Section")).toEqual({ title: "Page", anchor: "Section" });
    expect(splitTarget("Page")).toEqual({ title: "Page", anchor: null });
  });

  test("wordCount ignores markdown punctuation", () => {
    expect(wordCount("# Heading\n\n- one **two** three")).toBe(4);
  });

  test("snippetAround centres on the needle", () => {
    const snippet = snippetAround("the quick brown fox jumps", "brown", 5);
    expect(snippet).toContain("brown");
  });
});
