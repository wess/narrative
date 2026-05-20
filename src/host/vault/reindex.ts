// Rebuild the derived rows — links, tags, full-text — for a single file
// node. Folders have no body, so they're never reindexed. This is the one
// place `links` / `tags` / `pages_fts` get written, called both during the
// initial index build and after every file mutation.

import type { DB } from "@basket/db";
import { extractLinks, extractTags, linkKey } from "../parse.ts";
import { linksTable, tagsTable } from "../schema.ts";
import { indexPage, unindexPage } from "../search.ts";

export const reindexNode = (db: DB, node: { id: number; title: string; body: string }): void => {
  db.remove(linksTable, { sourceId: node.id });
  db.remove(tagsTable, { nodeId: node.id });
  for (const link of extractLinks(node.body)) {
    db.insert(linksTable, { sourceId: node.id, targetTitle: linkKey(link.title) });
  }
  for (const tag of extractTags(node.body)) {
    db.insert(tagsTable, { nodeId: node.id, tag });
  }
  indexPage(db, node.id, node.title, node.body);
};

export const unindexNode = (db: DB, id: number): void => {
  db.remove(linksTable, { sourceId: id });
  db.remove(tagsTable, { nodeId: id });
  unindexPage(db, id);
};
