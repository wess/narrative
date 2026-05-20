import type { DB } from "@basket/db";
import type {
  AppStats,
  Backlink,
  Backlinks,
  GraphData,
  GraphEdge,
  GraphNode,
  PageMeta,
  TagCount,
} from "../shared/types.ts";
import { rowToMeta } from "./pages.ts";
import { linkKey, snippetAround, wordCount } from "./parse.ts";
import type { NodeRow } from "./schema.ts";

type RefRow = { id: number; title: string; icon: string; body: string };

// Pages that point at `id` — both explicit `[[wiki links]]` and bare
// "unlinked mentions" of the page title in prose.
export const backlinksFor = (db: DB, id: number, title: string): Backlinks => {
  const key = linkKey(title);

  const linkedRows = db.query<RefRow>(
    `SELECT DISTINCT p.id, p.title, p.icon, p.body
     FROM links l
     JOIN nodes p ON p.id = l.sourceId
     WHERE l.targetTitle = ? AND p.kind = 'file' AND p.archived = 0 AND p.id != ?
     ORDER BY p.updatedAt DESC`,
    key,
    id,
  );
  const linkedIds = new Set(linkedRows.map((r) => r.id));

  const mentionRows = db.query<RefRow>(
    `SELECT p.id, p.title, p.icon, p.body
     FROM nodes p
     WHERE p.kind = 'file' AND p.archived = 0 AND p.id != ? AND instr(lower(p.body), ?) > 0
     ORDER BY p.updatedAt DESC`,
    id,
    key,
  );

  const toBacklink = (r: RefRow): Backlink => ({
    id: r.id,
    title: r.title,
    icon: r.icon,
    snippet: snippetAround(r.body, title),
  });

  return {
    linked: linkedRows.map(toBacklink),
    unlinked: mentionRows.filter((r) => !linkedIds.has(r.id)).map(toBacklink),
  };
};

// Pages that `id` links out to — the resolved targets of its wiki links.
export const outgoingFor = (db: DB, id: number): Backlink[] => {
  const rows = db.query<RefRow>(
    `SELECT DISTINCT p.id, p.title, p.icon, p.body
     FROM links l
     JOIN nodes p ON lower(p.title) = l.targetTitle
     WHERE l.sourceId = ? AND p.kind = 'file' AND p.archived = 0 AND p.id != ?
     ORDER BY p.title ASC`,
    id,
    id,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    icon: r.icon,
    snippet: snippetAround(r.body, ""),
  }));
};

// The whole non-archived knowledge graph: a node per page, an edge per
// resolved link. Self-links are dropped.
export const graphFor = (db: DB): GraphData => {
  const nodeRows = db.query<{ id: number; title: string; icon: string }>(
    "SELECT id, title, icon FROM nodes WHERE kind = 'file' AND archived = 0",
  );
  const edgeRows = db.query<GraphEdge>(
    `SELECT DISTINCT l.sourceId AS source, p.id AS target
     FROM links l
     JOIN nodes src ON src.id = l.sourceId
     JOIN nodes p ON lower(p.title) = l.targetTitle
     WHERE src.kind = 'file' AND p.kind = 'file' AND src.archived = 0 AND p.archived = 0 AND src.id != p.id`,
  );

  const degree = new Map<number, number>();
  const bump = (n: number) => degree.set(n, (degree.get(n) ?? 0) + 1);
  for (const e of edgeRows) {
    bump(e.source);
    bump(e.target);
  }

  const nodes: GraphNode[] = nodeRows.map((n) => ({
    id: n.id,
    title: n.title,
    icon: n.icon,
    degree: degree.get(n.id) ?? 0,
  }));

  return { nodes, edges: edgeRows };
};

// The neighbourhood of one page — every node within `depth` hops of `id`.
export const localGraphFor = (db: DB, id: number, depth = 2): GraphData => {
  const full = graphFor(db);
  const adjacency = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    const set = adjacency.get(a) ?? new Set<number>();
    set.add(b);
    adjacency.set(a, set);
  };
  for (const e of full.edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }

  const keep = new Set<number>([id]);
  let frontier = [id];
  for (let hop = 0; hop < depth; hop++) {
    const next: number[] = [];
    for (const node of frontier) {
      for (const neighbour of adjacency.get(node) ?? []) {
        if (!keep.has(neighbour)) {
          keep.add(neighbour);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }

  return {
    nodes: full.nodes.filter((n) => keep.has(n.id)),
    edges: full.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
};

export const listTags = (db: DB): TagCount[] =>
  db.query<TagCount>(
    `SELECT t.tag AS tag, COUNT(DISTINCT t.nodeId) AS count
     FROM tags t
     JOIN nodes p ON p.id = t.nodeId
     WHERE p.kind = 'file' AND p.archived = 0
     GROUP BY t.tag
     ORDER BY count DESC, t.tag ASC`,
  );

// Pages carrying `tag` or any nested tag beneath it (`tag/child`).
export const pagesWithTag = (db: DB, tag: string): PageMeta[] => {
  const key = tag.toLowerCase();
  return db
    .query<NodeRow>(
      `SELECT DISTINCT p.* FROM nodes p
       JOIN tags t ON t.nodeId = p.id
       WHERE (t.tag = ? OR t.tag LIKE ?) AND p.kind = 'file' AND p.archived = 0
       ORDER BY p.updatedAt DESC`,
      key,
      `${key}/%`,
    )
    .map(rowToMeta);
};

export const statsFor = (db: DB): AppStats => {
  const pageCount =
    db.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM nodes WHERE kind = 'file' AND archived = 0",
    )[0]?.n ?? 0;
  const linkCount =
    db.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM links l
       JOIN nodes p ON p.id = l.sourceId WHERE p.kind = 'file' AND p.archived = 0`,
    )[0]?.n ?? 0;
  const tagCount =
    db.query<{ n: number }>(
      `SELECT COUNT(DISTINCT t.tag) AS n FROM tags t
       JOIN nodes p ON p.id = t.nodeId WHERE p.kind = 'file' AND p.archived = 0`,
    )[0]?.n ?? 0;
  const bodies = db.query<{ body: string }>(
    "SELECT body FROM nodes WHERE kind = 'file' AND archived = 0",
  );
  const words = bodies.reduce((sum, r) => sum + wordCount(r.body), 0);

  return { pages: pageCount, words, links: linkCount, tags: tagCount };
};
