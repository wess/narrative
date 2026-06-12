import type { DB } from "@basket/db";
import type { NodeRow } from "./schema.ts";

// Full-text search is an FTS5 virtual table kept in lock-step with the
// `pages` table by the page repository. Rows are keyed by `rowid = page.id`
// so re-indexing a single page is a delete + insert by id.

export const initSearch = (db: DB): void => {
  db.raw.exec(
    "CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(title, body, tokenize = 'unicode61')",
  );
};

export const indexPage = (db: DB, id: number, title: string, body: string): void => {
  db.raw.query("DELETE FROM pages_fts WHERE rowid = ?").run(id);
  db.raw.query("INSERT INTO pages_fts (rowid, title, body) VALUES (?, ?, ?)").run(id, title, body);
};

export const unindexPage = (db: DB, id: number): void => {
  db.raw.query("DELETE FROM pages_fts WHERE rowid = ?").run(id);
};

// Turn arbitrary user input into a safe FTS5 MATCH expression: every word
// becomes a quoted prefix term, so punctuation can never break the query.
const toMatchExpr = (raw: string): string =>
  raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `"${word.replace(/"/g, '""')}"*`)
    .join(" ");

export type FtsHit = { id: number; snippet: string };

const ftsQuery = (db: DB, expr: string): FtsHit[] => {
  if (!expr) return [];
  return db.raw
    .query(
      `SELECT rowid AS id,
              snippet(pages_fts, 1, '«', '»', '…', 14) AS snippet
       FROM pages_fts
       WHERE pages_fts MATCH ?
       ORDER BY rank
       LIMIT 60`,
    )
    .all(expr) as FtsHit[];
};

export const searchIndex = (db: DB, raw: string): FtsHit[] => ftsQuery(db, toMatchExpr(raw));

// Common words that add noise to a natural-language retrieval query.
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "and",
  "or",
  "but",
  "with",
  "as",
  "by",
  "do",
  "does",
  "did",
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "which",
  "i",
  "my",
  "me",
  "you",
  "your",
  "it",
  "this",
  "that",
  "can",
  "could",
  "should",
  "would",
  "about",
  "from",
  "into",
  "if",
  "so",
  "we",
  "our",
]);

// Lenient OR-matched FTS used for RAG retrieval — a natural-language
// question should surface a page even if it shares only a few key words.
export const searchKeywords = (db: DB, raw: string): FtsHit[] => {
  const words = raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}_/-]/gu, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const terms = words.length > 0 ? words : raw.split(/\s+/).filter(Boolean);
  const expr = terms.map((w) => `"${w.replace(/"/g, '""')}"*`).join(" OR ");
  return ftsQuery(db, expr);
};

// --- query operators ------------------------------------------------------
// Supports `tag:`, `title:` / `path:`, `content:`, and `/regex/` on top of
// plain full-text search. Everything else is treated as FTS text.

type ParsedQuery = {
  text: string;
  tags: string[];
  titles: string[];
  regex: RegExp | null;
};

const unsafeRegex = (source: string): boolean =>
  source.length > 160 ||
  /\([^)]*[+*][^)]*\)[+*{]/.test(source) ||
  /\([^)]*\{[^)]*\}[^)]*\)[+*{]/.test(source);

const parseQuery = (raw: string): ParsedQuery => {
  let rest = ` ${raw} `;
  const tags: string[] = [];
  const titles: string[] = [];
  let regex: RegExp | null = null;

  const reMatch = /\s\/(.+?)\/([a-z]*)\s/.exec(rest);
  if (reMatch) {
    try {
      const source = reMatch[1] ?? "";
      regex = unsafeRegex(source)
        ? null
        : new RegExp(source, (reMatch[2] ?? "").includes("i") ? "im" : "m");
    } catch {
      regex = null;
    }
    rest = rest.replace(reMatch[0], " ");
  }
  rest = rest.replace(/\stag:(\S+)/gi, (_m, t: string) => {
    tags.push(t.toLowerCase());
    return " ";
  });
  rest = rest.replace(/\s(?:title|path):(\S+)/gi, (_m, t: string) => {
    titles.push(t.toLowerCase());
    return " ";
  });
  rest = rest.replace(/\scontent:/gi, " ");
  return { text: rest.trim(), tags, titles, regex };
};

export const runSearch = (db: DB, raw: string): FtsHit[] => {
  const q = parseQuery(raw);
  const hasFilters = q.tags.length > 0 || q.titles.length > 0 || q.regex !== null;

  // Plain text query — straight FTS with ranked snippets.
  if (!hasFilters) return searchIndex(db, q.text);

  let pages = db.query<NodeRow>("SELECT * FROM nodes WHERE kind = 'file' AND archived = 0");

  if (q.text) {
    const ftsIds = new Set(searchIndex(db, q.text).map((h) => h.id));
    pages = pages.filter((p) => ftsIds.has(p.id));
  }
  for (const tag of q.tags) {
    const tagged = new Set(
      db
        .query<{ nodeId: number }>(
          "SELECT DISTINCT nodeId FROM tags WHERE tag = ? OR tag LIKE ?",
          tag,
          `${tag}/%`,
        )
        .map((r) => r.nodeId),
    );
    pages = pages.filter((p) => tagged.has(p.id));
  }
  for (const title of q.titles) {
    pages = pages.filter((p) => p.title.toLowerCase().includes(title));
  }
  if (q.regex) {
    const re = q.regex;
    pages = pages.filter((p) => re.test(p.body) || re.test(p.title));
  }

  return pages.slice(0, 60).map((p) => ({
    id: p.id,
    snippet: p.body.replace(/\s+/g, " ").trim().slice(0, 170) || "—",
  }));
};
