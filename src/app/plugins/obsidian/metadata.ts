// `MetadataCache` — the parsed-document index: headings, links,
// embeds, tags and frontmatter for every file. The API is synchronous,
// but Narrative's page bodies live behind async IPC, so the cache fills
// lazily: `getFileCache` returns what's warm and kicks off a fetch for what
// isn't, firing `changed` when a parse lands — the way a lazily-filled
// cache behaves while a vault is loading. Bodies that arrive via the bridge's
// `modify` signal (which carries the saved `Page`) refresh the cache for free.

import { invoke } from "@basket/ipc/client";
import * as ch from "../../../shared/channels.ts";
import { getBridge, type VaultBridge } from "../bridge.ts";
import { Events } from "./events.ts";
import { getLinkpath } from "./util.ts";
import type { TFile, Vault } from "./vault.ts";

export type Loc = { line: number; col: number; offset: number };
export type Pos = { start: Loc; end: Loc };

export type HeadingCache = { heading: string; level: number; position: Pos };
export type LinkCache = {
  link: string;
  original: string;
  displayText?: string;
  position: Pos;
};
export type EmbedCache = LinkCache;
export type TagCache = { tag: string; position: Pos };
export type FrontmatterCache = Record<string, unknown>;

export type CachedMetadata = {
  headings?: HeadingCache[];
  links?: LinkCache[];
  embeds?: EmbedCache[];
  tags?: TagCache[];
  frontmatter?: FrontmatterCache;
  frontmatterPosition?: Pos;
  sections?: { type: string; position: Pos }[];
};

const loc = (line: number, col: number, offset: number): Loc => ({ line, col, offset });

// Offset -> line/col, using a precomputed table of line-start offsets.
const lineStarts = (text: string): number[] => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
};
const offsetToLoc = (starts: number[], offset: number): Loc => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return loc(lo, offset - (starts[lo] ?? 0), offset);
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/gm;
const WIKILINK_RE = /(!?)\[\[([^\]]+)\]\]/g;
const TAG_RE = /(?:^|[\s(>])#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/gu;

// Parse a page body into the `CachedMetadata` shape.
export const parseCache = (
  body: string,
  parseYaml: (s: string) => FrontmatterCache,
): CachedMetadata => {
  const starts = lineStarts(body);
  const cache: CachedMetadata = {
    headings: [],
    links: [],
    embeds: [],
    tags: [],
  };

  const fm = FRONTMATTER_RE.exec(body);
  if (fm && fm.index === 0) {
    cache.frontmatter = parseYaml(fm[1] ?? "");
    cache.frontmatterPosition = {
      start: loc(0, 0, 0),
      end: offsetToLoc(starts, fm[0].length),
    };
  }

  HEADING_RE.lastIndex = 0;
  for (const m of body.matchAll(HEADING_RE)) {
    const idx = m.index ?? 0;
    cache.headings?.push({
      heading: (m[2] ?? "").trim(),
      level: (m[1] ?? "#").length,
      position: { start: offsetToLoc(starts, idx), end: offsetToLoc(starts, idx + m[0].length) },
    });
  }

  WIKILINK_RE.lastIndex = 0;
  for (const m of body.matchAll(WIKILINK_RE)) {
    const idx = m.index ?? 0;
    const inner = m[2] ?? "";
    const [target, alias] = inner.split("|");
    const entry: LinkCache = {
      link: (target ?? inner).trim(),
      original: m[0],
      displayText: (alias ?? target ?? inner).trim(),
      position: { start: offsetToLoc(starts, idx), end: offsetToLoc(starts, idx + m[0].length) },
    };
    if (m[1] === "!") cache.embeds?.push(entry);
    else cache.links?.push(entry);
  }

  TAG_RE.lastIndex = 0;
  for (const m of body.matchAll(TAG_RE)) {
    const tag = m[1] ?? "";
    const idx = (m.index ?? 0) + m[0].indexOf("#");
    cache.tags?.push({
      tag: `#${tag}`,
      position: { start: offsetToLoc(starts, idx), end: offsetToLoc(starts, idx + tag.length + 1) },
    });
  }

  return cache;
};

export class MetadataCache extends Events {
  resolvedLinks: Record<string, Record<string, number>> = {};
  unresolvedLinks: Record<string, Record<string, number>> = {};

  private vault: Vault;
  private bridge: VaultBridge;
  private byId = new Map<number, CachedMetadata>();
  private inflight = new Set<number>();
  private yamlParse: (s: string) => FrontmatterCache;

  constructor(vault: Vault, yamlParse: (s: string) => FrontmatterCache, bridge?: VaultBridge) {
    super();
    this.vault = vault;
    this.bridge = bridge ?? getBridge();
    this.yamlParse = yamlParse;
    // A saved page arrives with its body — reparse without an extra fetch.
    this.bridge.subscribe({
      onModify: (rec, page) => {
        const cache = parseCache(page.body, this.yamlParse);
        this.byId.set(rec.id, cache);
        const file = this.vault.getFileByPath(rec.path);
        this.rebuildLinks();
        if (file) {
          this.trigger("changed", file, page.body, cache);
          this.trigger("resolve", file);
        }
      },
    });
  }

  getFileCache(file: TFile | null): CachedMetadata | null {
    if (!file) return null;
    const cached = this.byId.get(file.id);
    if (cached) return cached;
    void this.warm(file);
    return null;
  }

  getCache(path: string): CachedMetadata | null {
    return this.getFileCache(this.vault.getFileByPath(path));
  }

  // Lazily fetch a page body, parse it, and announce the result.
  private async warm(file: TFile): Promise<void> {
    if (this.inflight.has(file.id)) return;
    this.inflight.add(file.id);
    try {
      const page = await invoke(ch.getPage, { id: file.id });
      if (!page) return;
      const cache = parseCache(page.body, this.yamlParse);
      this.byId.set(file.id, cache);
      this.rebuildLinks();
      this.trigger("changed", file, page.body, cache);
      this.trigger("resolve", file);
    } catch {
      // a transient IPC failure — the next access retries
    } finally {
      this.inflight.delete(file.id);
    }
  }

  // Recompute resolved / unresolved link maps from every warm cache. Partial
  // by nature — only files whose cache has been touched contribute.
  private rebuildLinks(): void {
    const resolved: Record<string, Record<string, number>> = {};
    const unresolved: Record<string, Record<string, number>> = {};
    for (const [id, cache] of this.byId) {
      const file = this.vault.getFiles().find((f) => f.id === id);
      if (!file) continue;
      const res: Record<string, number> = {};
      const unres: Record<string, number> = {};
      for (const link of cache.links ?? []) {
        const dest = this.getFirstLinkpathDest(getLinkpath(link.link), file.path);
        if (dest) res[dest.path] = (res[dest.path] ?? 0) + 1;
        else unres[getLinkpath(link.link)] = (unres[getLinkpath(link.link)] ?? 0) + 1;
      }
      resolved[file.path] = res;
      unresolved[file.path] = unres;
    }
    this.resolvedLinks = resolved;
    this.unresolvedLinks = unresolved;
    this.trigger("resolved");
  }

  // Resolve a wiki-link target to a file. Narrative links by title, so we
  // match on basename (case-insensitive), preferring the same folder.
  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
    const want = linkpath.trim().toLowerCase();
    if (!want) return null;
    const files = this.vault.getFiles();
    const sourceFolder = sourcePath.includes("/")
      ? sourcePath.slice(0, sourcePath.lastIndexOf("/"))
      : "";
    let fallback: TFile | null = null;
    for (const file of files) {
      if (
        file.basename.toLowerCase() !== want &&
        file.path.toLowerCase() !== want &&
        file.path.toLowerCase() !== `${want}.md`
      ) {
        continue;
      }
      if (file.parent && file.parent.path === sourceFolder) return file;
      fallback ??= file;
    }
    return fallback;
  }

  fileToLinktext(file: TFile, _sourcePath: string, omitMdExtension = true): string {
    return omitMdExtension ? file.basename : file.name;
  }
}
