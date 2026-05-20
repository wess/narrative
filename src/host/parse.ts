// Extract the structured signal — wiki links and tags — out of a page's
// markdown body. Both are rebuilt from scratch on every save, so these
// functions just need to be correct, not incremental.

export type ParsedLink = {
  readonly title: string; // the page-title portion (before any `#`)
  readonly anchor: string | null; // the `#heading` portion, if any
  readonly alias: string | null;
};

// Matches `[[Title]]`, `[[Title#Heading]]`, `[[Title|alias]]` and the
// embed form `![[Title]]` (the leading `!` is left for the block parser).
const LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const TAG_RE = /(?:^|[\s(>])#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/gu;
// Code spans and fences are not real prose — strip them before scanning tags.
const CODE_RE = /```[\s\S]*?```|`[^`\n]*`/g;

// Normalise a page title to a stable key used for link resolution.
export const linkKey = (title: string): string => title.trim().toLowerCase();

// Split a raw wiki-link target into its page title and optional heading anchor.
export const splitTarget = (raw: string): { title: string; anchor: string | null } => {
  const hash = raw.indexOf("#");
  if (hash < 0) return { title: raw.trim(), anchor: null };
  const anchor = raw.slice(hash + 1).trim();
  return { title: raw.slice(0, hash).trim(), anchor: anchor || null };
};

export const extractLinks = (body: string): ParsedLink[] => {
  const seen = new Map<string, ParsedLink>();
  for (const m of body.matchAll(LINK_RE)) {
    const { title, anchor } = splitTarget((m[1] ?? "").trim());
    if (!title) continue; // a same-page `[[#heading]]` link — no cross-page edge
    const key = linkKey(title);
    if (!seen.has(key)) {
      const alias = m[2]?.trim();
      seen.set(key, { title, anchor, alias: alias && alias.length > 0 ? alias : null });
    }
  }
  return [...seen.values()];
};

export const extractTags = (body: string): string[] => {
  const prose = body.replace(CODE_RE, " ");
  const seen = new Set<string>();
  for (const m of prose.matchAll(TAG_RE)) {
    const tag = (m[1] ?? "").toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen].sort();
};

// A short plain-text excerpt around the first occurrence of `needle`.
export const snippetAround = (body: string, needle: string, radius = 90): string => {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!needle) return flat.slice(0, radius * 2);
  const at = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return flat.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + needle.length + radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
};

export const wordCount = (body: string): number => {
  const words = body
    .replace(CODE_RE, " ")
    .replace(/[#*_>\-[\]()`!|]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
};
