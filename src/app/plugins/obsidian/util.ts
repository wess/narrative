// Free functions and constants the plugin API module exports: path/string
// helpers, a frontmatter-grade YAML parser, fuzzy search, and small DOM
// utilities. None of these touch Narrative state — they're pure helpers.

import type { CachedMetadata } from "./metadata.ts";

// The API version we claim to implement. Plugins gate features on this; we
// report a recent-ish version and aim to satisfy `minAppVersion` checks.
export const apiVersion = "1.5.12";

// --- platform -------------------------------------------------------------

const ua = navigator.userAgent;
export const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
  isPhone: false,
  isTablet: false,
  isMacOS: /Mac/i.test(ua),
  isWin: /Win/i.test(ua),
  isLinux: /Linux/i.test(ua) && !/Android/i.test(ua),
  isIosApp: false,
  isAndroidApp: false,
  isSafari: /Safari/i.test(ua) && !/Chrome/i.test(ua),
  resourcePathPrefix: "",
};

// --- path / string --------------------------------------------------------

// Collapse `\` to `/`, squeeze repeated slashes, drop leading/trailing ones.
export const normalizePath = (path: string): string => {
  let p = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  p = p.replace(/^\/+/, "").replace(/\/+$/, "");
  return p === "" ? "/" : p;
};

// The page-title portion of a wiki link (`Note#Heading|Alias` -> `Note`).
export const getLinkpath = (linktext: string): string => {
  const noAlias = linktext.split("|")[0] ?? linktext;
  const noHeading = noAlias.split("#")[0] ?? noAlias;
  const noBlock = noHeading.split("^")[0] ?? noHeading;
  return noBlock.trim() || noAlias.trim();
};

// --- timing ---------------------------------------------------------------

type AnyFn = (...args: never[]) => unknown;

export const debounce = <T extends AnyFn>(
  fn: T,
  timeout = 0,
  resetTimer = false,
): T & { cancel: () => void; run: () => void } => {
  let handle: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (handle !== null && resetTimer) clearTimeout(handle);
    if (handle === null || resetTimer) {
      handle = setTimeout(() => {
        handle = null;
        if (lastArgs) fn(...lastArgs);
      }, timeout);
    }
  }) as T & { cancel: () => void; run: () => void };
  debounced.cancel = () => {
    if (handle !== null) clearTimeout(handle);
    handle = null;
    lastArgs = null;
  };
  debounced.run = () => {
    if (handle !== null) clearTimeout(handle);
    handle = null;
    if (lastArgs) fn(...lastArgs);
  };
  return debounced;
};

// --- YAML (frontmatter grade) --------------------------------------------
// Not a full YAML implementation — it covers `key: value`, block lists,
// quoted scalars, numbers / booleans / null, and one level of nested maps.
// That's the shape frontmatter actually takes in practice.

const parseScalar = (raw: string): unknown => {
  const v = raw.trim();
  if (v === "" || v === "~" || v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number.parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return Number.parseFloat(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => parseScalar(part));
  }
  return v;
};

export const parseYaml = (yaml: string): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  const lines = yaml.replace(/\r\n/g, "\n").split("\n");
  let currentKey: string | null = null;
  let currentList: unknown[] | null = null;
  let currentMap: Record<string, unknown> | null = null;

  const flush = (): void => {
    if (currentKey !== null) {
      if (currentList !== null) result[currentKey] = currentList;
      else if (currentMap !== null) result[currentKey] = currentMap;
    }
    currentKey = null;
    currentList = null;
    currentMap = null;
  };

  for (const line of lines) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    if (indent > 0 && currentKey !== null) {
      if (trimmed.startsWith("- ")) {
        if (currentList === null) currentList = [];
        currentList.push(parseScalar(trimmed.slice(2)));
        continue;
      }
      const nested = /^([^:]+):\s*(.*)$/.exec(trimmed);
      if (nested) {
        if (currentMap === null) currentMap = {};
        currentMap[(nested[1] ?? "").trim()] = parseScalar(nested[2] ?? "");
        continue;
      }
    }

    flush();
    const m = /^([^:]+):\s*(.*)$/.exec(trimmed);
    if (!m) continue;
    const key = (m[1] ?? "").trim();
    const value = (m[2] ?? "").trim();
    if (value === "") {
      // A block list / map follows on indented lines.
      currentKey = key;
    } else {
      result[key] = parseScalar(value);
    }
  }
  flush();
  return result;
};

const emitScalar = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const s = String(value);
  return /[:#\n]|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
};

export const stringifyYaml = (obj: unknown): string => {
  if (obj === null || typeof obj !== "object") return `${emitScalar(obj)}\n`;
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out.push(`${key}:`);
      for (const item of value) out.push(`  - ${emitScalar(item)}`);
    } else if (value && typeof value === "object") {
      out.push(`${key}:`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out.push(`  ${k}: ${emitScalar(v)}`);
      }
    } else {
      out.push(`${key}: ${emitScalar(value)}`);
    }
  }
  return `${out.join("\n")}\n`;
};

// --- frontmatter helpers --------------------------------------------------

export const parseFrontMatterEntry = (
  frontmatter: Record<string, unknown> | null | undefined,
  key: string,
): unknown => {
  if (!frontmatter) return null;
  return key in frontmatter ? frontmatter[key] : null;
};

const toStringArray = (value: unknown): string[] | null => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(value)];
};

export const parseFrontMatterAliases = (
  frontmatter: Record<string, unknown> | null | undefined,
): string[] | null => {
  if (!frontmatter) return null;
  return toStringArray(frontmatter.aliases ?? frontmatter.alias);
};

export const parseFrontMatterTags = (
  frontmatter: Record<string, unknown> | null | undefined,
): string[] | null => {
  if (!frontmatter) return null;
  const tags = toStringArray(frontmatter.tags ?? frontmatter.tag);
  return tags ? tags.map((t) => (t.startsWith("#") ? t : `#${t}`)) : null;
};

// Every tag in a file: inline `#tags` plus frontmatter `tags`.
export const getAllTags = (cache: CachedMetadata | null | undefined): string[] | null => {
  if (!cache) return null;
  const tags = new Set<string>();
  for (const t of cache.tags ?? []) tags.add(t.tag);
  const fmTags = parseFrontMatterTags(cache.frontmatter);
  if (fmTags) for (const t of fmTags) tags.add(t);
  return [...tags];
};

// --- fuzzy search ---------------------------------------------------------

export type SearchMatchPart = [number, number];
export type SearchResult = { score: number; matches: SearchMatchPart[] };
export type SearchMatcher = (text: string) => SearchResult | null;
export type PreparedQuery = { query: string; tokens: string[]; matcher: SearchMatcher };

// Subsequence match with a light score: contiguous runs and word-boundary
// hits are worth more, gaps cost a little.
const fuzzyMatch = (query: string, text: string): SearchResult | null => {
  if (query === "") return { score: 0, matches: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const matches: SearchMatchPart[] = [];
  let score = 0;
  let qi = 0;
  let runStart = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (runStart < 0) runStart = ti;
      const boundary = ti === 0 || /\W|_/.test(t[ti - 1] ?? "");
      score += boundary ? 2 : 1;
      qi++;
    } else if (runStart >= 0) {
      matches.push([runStart, ti]);
      runStart = -1;
      score -= 0.1;
    }
  }
  if (runStart >= 0)
    matches.push([
      runStart,
      runStart + (q.length - matches.reduce((n, m) => n + (m[1] - m[0]), 0)),
    ]);
  if (qi < q.length) return null;
  // Normalise so shorter, denser matches rank higher.
  return { score: score - text.length * 0.01, matches };
};

export const prepareFuzzySearch = (query: string): SearchMatcher => {
  return (text: string) => fuzzyMatch(query, text);
};

export const prepareSimpleSearch = (query: string): SearchMatcher => {
  const q = query.toLowerCase().trim();
  return (text: string) => {
    if (q === "") return { score: 0, matches: [] };
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return null;
    return { score: 10 - text.length * 0.01, matches: [[idx, idx + q.length]] };
  };
};

export const prepareQuery = (query: string): PreparedQuery => ({
  query,
  tokens: query.toLowerCase().split(/\s+/).filter(Boolean),
  matcher: prepareFuzzySearch(query),
});

export const fuzzySearch = (q: PreparedQuery, text: string): SearchResult | null => q.matcher(text);

export const sortSearchResults = <T extends { match: SearchResult }>(results: T[]): void => {
  results.sort((a, b) => b.match.score - a.match.score);
};

// --- html -----------------------------------------------------------------

// Parse untrusted HTML into a DocumentFragment with scripts and inline event
// handlers stripped.
export const sanitizeHTMLToDom = (html: string): DocumentFragment => {
  const template = document.createElement("template");
  template.innerHTML = html;
  const frag = template.content;
  for (const script of Array.from(frag.querySelectorAll("script"))) script.remove();
  for (const el of Array.from(frag.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name) || /javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return frag;
};

// A small, lossy HTML -> Markdown conversion — enough for "paste as markdown"
// style features, not a faithful round-trip.
export const htmlToMarkdown = (html: string | HTMLElement): string => {
  const root =
    typeof html === "string"
      ? (() => {
          const d = document.createElement("div");
          d.innerHTML = html;
          return d;
        })()
      : html;

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const inner = Array.from(el.childNodes).map(walk).join("");
    switch (el.tagName.toLowerCase()) {
      case "h1":
        return `# ${inner}\n\n`;
      case "h2":
        return `## ${inner}\n\n`;
      case "h3":
        return `### ${inner}\n\n`;
      case "h4":
        return `#### ${inner}\n\n`;
      case "strong":
      case "b":
        return `**${inner}**`;
      case "em":
      case "i":
        return `*${inner}*`;
      case "code":
        return `\`${inner}\``;
      case "pre":
        return `\n\`\`\`\n${inner}\n\`\`\`\n\n`;
      case "a":
        return `[${inner}](${el.getAttribute("href") ?? ""})`;
      case "img":
        return `![${el.getAttribute("alt") ?? ""}](${el.getAttribute("src") ?? ""})`;
      case "li":
        return `- ${inner}\n`;
      case "ul":
      case "ol":
        return `${inner}\n`;
      case "blockquote":
        return `> ${inner}\n\n`;
      case "br":
        return "\n";
      case "p":
      case "div":
        return `${inner}\n\n`;
      default:
        return inner;
    }
  };

  return walk(root)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
