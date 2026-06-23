import type { DB } from "@basket/db";
import type { SearchHit, SearchHitKind } from "../shared/types.ts";
import { openAgentStore } from "./agents/store.ts";
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

type StoredRow = {
  readonly id?: number;
  readonly slug?: string;
  readonly name?: string;
  readonly title?: string;
  readonly description?: string;
  readonly icon?: string;
  readonly path?: string;
  readonly url?: string;
  readonly pageId?: number;
  readonly pageTitle?: string;
  readonly content?: string;
  readonly error?: string;
  readonly notes?: string;
  readonly source?: string;
  readonly userPrompt?: string;
  readonly command?: string;
  readonly projectSlug?: string;
  readonly channelSlug?: string | null;
  readonly agentSlug?: string | null;
  readonly role?: string;
  readonly status?: string;
  readonly reason?: string;
  readonly reviewComment?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly systemPrompt?: string;
  readonly brief?: string;
  readonly stdout?: string;
  readonly stderr?: string;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const compact = (value: string): string => value.replace(/\s+/g, " ").trim();

const matches = (needle: string, values: readonly string[]): boolean =>
  values.some((value) => value.toLowerCase().includes(needle));

const markedSnippet = (raw: string, rawNeedle: string): string => {
  const value = compact(raw).slice(0, 240);
  if (!value) return "—";
  const needle = rawNeedle.toLowerCase();
  const at = value.toLowerCase().indexOf(needle);
  if (at < 0) return value.slice(0, 170);
  const start = Math.max(0, at - 60);
  const end = Math.min(value.length, at + rawNeedle.length + 90);
  return `${start > 0 ? "…" : ""}${value.slice(start, at)}«${value.slice(
    at,
    at + rawNeedle.length,
  )}»${value.slice(at + rawNeedle.length, end)}${end < value.length ? "…" : ""}`;
};

const makeStoredHits = (
  kind: SearchHitKind,
  icon: string,
  rawNeedle: string,
  rows: readonly StoredRow[],
  map: (row: StoredRow) => Omit<SearchHit, "kind" | "icon" | "snippet"> & {
    readonly text: readonly string[];
    readonly snippetFrom: string;
    readonly icon?: string;
  },
): SearchHit[] => {
  const needle = rawNeedle.toLowerCase();
  const hits: SearchHit[] = [];
  for (const row of rows) {
    const hit = map(row);
    if (!matches(needle, hit.text)) continue;
    hits.push({
      id: hit.id,
      kind,
      target: hit.target,
      title: hit.title,
      icon: hit.icon ?? icon,
      subtitle: hit.subtitle,
      snippet: markedSnippet(hit.snippetFrom || hit.text.join(" "), rawNeedle),
    });
  }
  return hits;
};

export const runUnifiedSearch = async (
  vaultRoot: string,
  db: DB,
  raw: string,
): Promise<SearchHit[]> => {
  const query = raw.trim();
  if (!query) return [];
  const hits: SearchHit[] = [];

  for (const hit of runSearch(db, query)) {
    const page = db.query<NodeRow>("SELECT * FROM nodes WHERE id = ? LIMIT 1", hit.id)[0];
    if (!page || page.archived || page.kind !== "file") continue;
    hits.push({
      id: page.id,
      kind: "page",
      target: String(page.id),
      title: page.title,
      icon: page.icon,
      subtitle: page.path,
      snippet: hit.snippet,
    });
  }

  const store = await openAgentStore(vaultRoot);
  hits.push(
    ...makeStoredHits(
      "agent",
      "🤖",
      query,
      store.query<StoredRow>(
        "SELECT slug, name, description, icon, provider, model, systemPrompt FROM agents ORDER BY updatedAt DESC LIMIT 200",
      ),
      (row) => ({
        id: 0,
        target: text(row.slug),
        title: text(row.name) || text(row.slug),
        subtitle: "Agent",
        text: [text(row.name), text(row.description), text(row.systemPrompt)],
        snippetFrom: text(row.description) || text(row.systemPrompt),
        icon: text(row.icon),
      }),
    ),
    ...makeStoredHits(
      "channel",
      "💬",
      query,
      store.query<StoredRow>(
        "SELECT slug, name, description, icon, brief FROM channels ORDER BY updatedAt DESC LIMIT 200",
      ),
      (row) => ({
        id: 0,
        target: text(row.slug),
        title: text(row.name) || text(row.slug),
        subtitle: "Channel",
        text: [text(row.name), text(row.description), text(row.brief)],
        snippetFrom: text(row.description) || text(row.brief),
        icon: text(row.icon),
      }),
    ),
    ...makeStoredHits(
      "project",
      "📁",
      query,
      store.query<StoredRow>(
        "SELECT slug, name, description, path, channelSlug FROM projects ORDER BY updatedAt DESC LIMIT 200",
      ),
      (row) => ({
        id: 0,
        target: text(row.slug),
        title: text(row.name) || text(row.slug),
        subtitle: text(row.path) || "Project",
        text: [text(row.name), text(row.description), text(row.path), text(row.channelSlug)],
        snippetFrom: text(row.description) || text(row.path),
      }),
    ),
    ...makeStoredHits(
      "memory",
      "🧠",
      query,
      store.query<StoredRow>(
        "SELECT id, content, source, channelSlug, agentSlug, updatedAt FROM memories ORDER BY pinned DESC, updatedAt DESC LIMIT 300",
      ),
      (row) => ({
        id: row.id ?? 0,
        target: String(row.id ?? 0),
        title: text(row.source) || "Memory",
        subtitle:
          [text(row.channelSlug), text(row.agentSlug)].filter(Boolean).join(" / ") || "Memory",
        text: [text(row.content), text(row.source), text(row.channelSlug), text(row.agentSlug)],
        snippetFrom: text(row.content),
      }),
    ),
    ...makeStoredHits(
      "capture",
      "🌐",
      query,
      store.query<StoredRow>(
        "SELECT id, url, title, pageId, pageTitle, notes, createdAt FROM webCaptures ORDER BY id DESC LIMIT 200",
      ),
      (row) => ({
        id: row.id ?? 0,
        target: String(row.pageId ?? 0),
        title: text(row.title) || text(row.pageTitle) || text(row.url),
        subtitle: text(row.url) || "Web capture",
        text: [text(row.title), text(row.pageTitle), text(row.url), text(row.notes)],
        snippetFrom: text(row.notes) || text(row.url),
      }),
    ),
    ...makeStoredHits(
      "run",
      "▶",
      query,
      store.query<StoredRow>(
        "SELECT id, agentSlug, channelSlug, userPrompt, content, error, status, createdAt FROM agentRuns ORDER BY id DESC LIMIT 200",
      ),
      (row) => ({
        id: row.id ?? 0,
        target: String(row.id ?? 0),
        title: text(row.userPrompt).slice(0, 80) || `Run ${row.id ?? ""}`,
        subtitle: [text(row.status), text(row.agentSlug), text(row.channelSlug)]
          .filter(Boolean)
          .join(" / "),
        text: [
          text(row.userPrompt),
          text(row.content),
          text(row.error),
          text(row.agentSlug),
          text(row.channelSlug),
        ],
        snippetFrom: text(row.content) || text(row.error) || text(row.userPrompt),
      }),
    ),
    ...makeStoredHits(
      "transcript",
      "💬",
      query,
      store.query<StoredRow>(
        "SELECT id, channelSlug, agentSlug, role, content, createdAt FROM channelMessages ORDER BY id DESC LIMIT 300",
      ),
      (row) => ({
        id: row.id ?? 0,
        target: text(row.channelSlug),
        title: text(row.channelSlug) || `Transcript ${row.id ?? ""}`,
        subtitle: [text(row.role), text(row.agentSlug)].filter(Boolean).join(" / ") || "Transcript",
        text: [text(row.content), text(row.channelSlug), text(row.agentSlug), text(row.role)],
        snippetFrom: text(row.content),
      }),
    ),
    ...makeStoredHits(
      "proposal",
      "✎",
      query,
      store.query<StoredRow>(
        "SELECT id, projectSlug, path, reason, reviewComment, content, status, updatedAt FROM projectWriteProposals ORDER BY id DESC LIMIT 200",
      ),
      (row) => ({
        id: row.id ?? 0,
        target: String(row.id ?? 0),
        title: text(row.path) || `Proposal ${row.id ?? ""}`,
        subtitle: [text(row.status), text(row.projectSlug)].filter(Boolean).join(" / "),
        text: [
          text(row.path),
          text(row.reason),
          text(row.reviewComment),
          text(row.content),
          text(row.projectSlug),
        ],
        snippetFrom: text(row.reviewComment) || text(row.reason) || text(row.content),
      }),
    ),
  );

  return hits.slice(0, 100);
};
