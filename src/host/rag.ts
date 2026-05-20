import type { Provider } from "@basket/ai";
import type { DB } from "@basket/db";
import type { Page } from "../shared/types.ts";
import { getPage } from "./pages.ts";
import { embeddingsTable } from "./schema.ts";
import { searchKeywords } from "./search.ts";

// Embedding APIs have token limits — cap the text we send.
const EMBED_INPUT_LIMIT = 6000;

const embedText = (title: string, body: string): string =>
  `${title}\n\n${body}`.slice(0, EMBED_INPUT_LIMIT);

export const cosineSim = (a: readonly number[], b: readonly number[]): number => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

type SourceRow = { id: number; title: string; body: string };

// Store (or replace) the embedding for one page. No-op if the provider
// doesn't support embeddings (e.g. Anthropic).
export const embedPage = async (db: DB, provider: Provider, page: SourceRow): Promise<boolean> => {
  if (!provider.embed) return false;
  const res = await provider.embed({ input: embedText(page.title, page.body) });
  const vector = res.vectors[0];
  if (!vector) return false;
  db.remove(embeddingsTable, { nodeId: page.id });
  db.insert(embeddingsTable, {
    nodeId: page.id,
    model: res.model,
    vector: JSON.stringify(vector),
  });
  return true;
};

export const clearEmbeddings = (db: DB): void => {
  db.exec("DELETE FROM embeddings");
};

export type EmbedStatus = { indexed: number; total: number; supported: boolean };

export const embeddingStatus = (db: DB, provider: Provider | null): EmbedStatus => {
  const total =
    db.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM nodes WHERE kind = 'file' AND archived = 0",
    )[0]?.n ?? 0;
  const indexed = db.query<{ n: number }>("SELECT COUNT(*) AS n FROM embeddings")[0]?.n ?? 0;
  return { indexed, total, supported: Boolean(provider?.embed) };
};

// Re-embed every non-archived page in batches. Returns how many succeeded.
export const reindexAll = async (db: DB, provider: Provider): Promise<number> => {
  if (!provider.embed) return 0;
  clearEmbeddings(db);
  const pages = db.query<SourceRow>(
    "SELECT id, title, body FROM nodes WHERE kind = 'file' AND archived = 0",
  );
  let done = 0;
  const BATCH = 16;
  for (let i = 0; i < pages.length; i += BATCH) {
    const chunk = pages.slice(i, i + BATCH);
    const res = await provider.embed({ input: chunk.map((p) => embedText(p.title, p.body)) });
    chunk.forEach((page, idx) => {
      const vector = res.vectors[idx];
      if (!vector) return;
      db.insert(embeddingsTable, {
        nodeId: page.id,
        model: res.model,
        vector: JSON.stringify(vector),
      });
      done += 1;
    });
  }
  return done;
};

export type Retrieval = { pages: Page[]; mode: "semantic" | "keyword" };

// Find the pages most relevant to `query`: semantic cosine similarity when
// an embedding index exists and the provider supports it, otherwise a
// keyword full-text search. Either way RAG works for every provider.
export const retrieveContext = async (
  db: DB,
  provider: Provider,
  query: string,
  k = 5,
): Promise<Retrieval> => {
  const indexed = db.query<{ n: number }>("SELECT COUNT(*) AS n FROM embeddings")[0]?.n ?? 0;

  if (provider.embed && indexed > 0) {
    const res = await provider.embed({ input: query.slice(0, EMBED_INPUT_LIMIT) });
    const queryVector = res.vectors[0];
    if (queryVector) {
      const rows = db.query<{ nodeId: number; vector: string }>(
        "SELECT nodeId, vector FROM embeddings",
      );
      const ranked = rows
        .map((row) => {
          try {
            return { nodeId: row.nodeId, score: cosineSim(queryVector, JSON.parse(row.vector)) };
          } catch {
            return { nodeId: row.nodeId, score: 0 };
          }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
      const pages = ranked
        .map((r) => getPage(db, r.nodeId))
        .filter((p): p is Page => p !== null && !p.archived);
      return { pages, mode: "semantic" };
    }
  }

  const pages = searchKeywords(db, query)
    .slice(0, k)
    .map((hit) => getPage(db, hit.id))
    .filter((p): p is Page => p !== null && !p.archived);
  return { pages, mode: "keyword" };
};
