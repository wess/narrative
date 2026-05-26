// Tiny frontmatter parser. Agents and commands are plain Markdown with a
// minimal YAML-shaped header — we only need scalar strings, inline arrays
// (`[a, b, c]`), and block arrays (lines beginning with `- `). Bringing in a
// full YAML library would dwarf the use case.

export type Frontmatter = Record<string, string | string[]>;

export type ParsedSource = {
  readonly fm: Frontmatter;
  readonly body: string;
};

const stripQuotes = (raw: string): string => {
  const t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
};

const parseInlineArray = (raw: string): string[] => {
  const t = raw.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return [];
  return t
    .slice(1, -1)
    .split(",")
    .map((p) => stripQuotes(p))
    .filter((p) => p.length > 0);
};

// Parse a frontmatter block (already stripped of its `---` fences).
const parseBlock = (block: string): Frontmatter => {
  const fm: Frontmatter = {};
  const lines = block.split(/\r?\n/);
  let key: string | null = null;
  let bucket: string[] | null = null;

  for (const line of lines) {
    // A bare `- item` continues the most recent block-array key.
    if (key && bucket && /^\s+-\s/.test(line)) {
      const value = stripQuotes(line.replace(/^\s+-\s+/, ""));
      if (value) bucket.push(value);
      continue;
    }
    const m = /^([a-zA-Z_][\w.-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      key = null;
      bucket = null;
      continue;
    }
    const k = (m[1] ?? "").trim();
    const v = (m[2] ?? "").trim();
    if (v === "") {
      // The value lives on the following indented `- item` lines.
      bucket = [];
      fm[k] = bucket;
      key = k;
      continue;
    }
    if (v.startsWith("[")) {
      fm[k] = parseInlineArray(v);
      key = null;
      bucket = null;
      continue;
    }
    fm[k] = stripQuotes(v);
    key = null;
    bucket = null;
  }
  return fm;
};

export const parseSource = (raw: string): ParsedSource => {
  // A document with `---` on the first line, then a closing `---`, has
  // frontmatter; everything else is treated as a body-only file.
  if (!/^---\s*\n/.test(raw)) return { fm: {}, body: raw };
  const after = raw.slice(raw.indexOf("\n") + 1);
  const end = after.indexOf("\n---");
  if (end < 0) return { fm: {}, body: raw };
  const block = after.slice(0, end);
  const body = after.slice(end + 4).replace(/^\s*\n/, "");
  return { fm: parseBlock(block), body };
};

// Convenience accessors used by load.ts — keep call sites tidy.
export const stringField = (fm: Frontmatter, key: string): string | null => {
  const v = fm[key];
  return typeof v === "string" && v.length > 0 ? v : null;
};

export const arrayField = (fm: Frontmatter, key: string): string[] => {
  const v = fm[key];
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.startsWith("[")) return parseInlineArray(v);
  return [];
};
