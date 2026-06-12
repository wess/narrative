// A small, dependency-free markdown renderer tuned for a knowledge base:
// it understands `[[wiki links]]` and `#tags` on top of common markdown.
// Output HTML is rendered with `dangerouslySetInnerHTML`, so every path
// escapes user input before composing tags.

import { renderMath } from "./math.ts";

export type Heading = {
  readonly level: number;
  readonly text: string;
  readonly slug: string;
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "section";

const WIKI_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/gu;
const CODE_TOKEN = /@@CODE(\d+)@@/g;
const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);
const SAFE_IMAGE_SCHEMES = new Set(["http:", "https:", "data:", "blob:"]);

const safeUrl = (raw: string, allowed: ReadonlySet<string>): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "#";
  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && !allowed.has(scheme)) return "#";
  if (scheme === "data:" && !/^data:image\//i.test(trimmed)) return "#";
  return escapeHtml(trimmed);
};

// Inline formatting for a single line / paragraph of text.
const renderInline = (raw: string): string => {
  // 1. Pull inline code + math out so nothing else transforms their contents.
  const code: string[] = [];
  let text = raw.replace(/`([^`]+)`/g, (_m, c: string) => {
    code.push(`<code>${escapeHtml(c)}</code>`);
    return `@@CODE${code.length - 1}@@`;
  });

  const math: string[] = [];
  text = text.replace(/\$([^$\n]+)\$/g, (_m, tex: string) => {
    math.push(renderMath(tex, false));
    return `@@MATH${math.length - 1}@@`;
  });

  text = escapeHtml(text);

  text = text.replace(WIKI_RE, (_m, raw: string, alias?: string) => {
    const hash = raw.indexOf("#");
    const target = (hash < 0 ? raw : raw.slice(0, hash)).trim();
    const anchor = hash < 0 ? "" : raw.slice(hash + 1).trim();
    const label =
      (alias ?? "").trim() ||
      (anchor ? (target ? `${target} › ${anchor}` : `› ${anchor}`) : target);
    return `<a class="wikilink" data-title="${escapeHtml(target)}" data-anchor="${escapeHtml(anchor)}" href="#">${escapeHtml(label)}</a>`;
  });

  text = text.replace(
    IMG_RE,
    (_m, alt: string, src: string) =>
      `<img alt="${alt}" src="${safeUrl(src, SAFE_IMAGE_SCHEMES)}" />`,
  );

  text = text.replace(
    LINK_RE,
    (_m, label: string, url: string) =>
      `<a class="exlink" href="${safeUrl(url, SAFE_LINK_SCHEMES)}" data-external="1">${label}</a>`,
  );

  // Footnote references — `[^1]` becomes a small superscript.
  text = text.replace(/\[\^([^\]\s]+)\]/g, '<sup class="footnote">$1</sup>');

  text = text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");

  text = text.replace(
    TAG_RE,
    (_m, pre: string, tag: string) =>
      `${pre}<a class="tag" data-tag="${escapeHtml(tag.toLowerCase())}" href="#">#${escapeHtml(tag)}</a>`,
  );

  // 2. Restore inline code + math spans.
  text = text.replace(CODE_TOKEN, (_m, i: string) => code[Number(i)] ?? "");
  return text.replace(/@@MATH(\d+)@@/g, (_m, i: string) => math[Number(i)] ?? "");
};

type ListItem = {
  indent: number;
  ordered: boolean;
  checked: boolean | null;
  content: string;
};
type ListNode = { item: ListItem; children: ListNode[] };

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

const parseListItem = (line: string): ListItem | null => {
  const m = LIST_RE.exec(line);
  if (!m) return null;
  const indent = (m[1] ?? "").replace(/\t/g, "  ").length;
  const ordered = /\d/.test(m[2] ?? "");
  let content = m[3] ?? "";
  let checked: boolean | null = null;
  const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
  if (task) {
    checked = (task[1] ?? "").toLowerCase() === "x";
    content = task[2] ?? "";
  }
  return { indent, ordered, checked, content };
};

const renderListNodes = (nodes: ListNode[]): string => {
  const first = nodes[0];
  if (!first) return "";
  const ordered = first.item.ordered;
  let out = ordered ? "<ol>" : "<ul>";
  for (const n of nodes) {
    const isTask = n.item.checked !== null;
    const box = isTask
      ? `<input type="checkbox" disabled${n.item.checked ? " checked" : ""} /> `
      : "";
    out += `<li${isTask ? ' class="task"' : ""}>${box}${renderInline(n.item.content)}`;
    if (n.children.length > 0) out += renderListNodes(n.children);
    out += "</li>";
  }
  out += ordered ? "</ol>" : "</ul>";
  return out;
};

const buildListTree = (items: ListItem[]): ListNode[] => {
  const roots: ListNode[] = [];
  const stack: ListNode[] = [];
  for (const item of items) {
    const node: ListNode = { item, children: [] };
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top && top.item.indent >= item.indent) stack.pop();
      else break;
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
};

const splitCells = (line: string): string[] =>
  line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const renderTable = (rows: string[]): string => {
  const header = rows[0] ? splitCells(rows[0]) : [];
  let out = "<table><thead><tr>";
  for (const h of header) out += `<th>${renderInline(h)}</th>`;
  out += "</tr></thead><tbody>";
  for (const row of rows.slice(2)) {
    out += "<tr>";
    for (const c of splitCells(row)) out += `<td>${renderInline(c)}</td>`;
    out += "</tr>";
  }
  out += "</tbody></table>";
  return out;
};

const isTableSep = (line: string): boolean =>
  /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");

const isBlockStart = (l: string): boolean =>
  l.trim() === "" ||
  /^(#{1,6})\s/.test(l) ||
  /^(```|~~~)/.test(l) ||
  /^\s*>/.test(l) ||
  parseListItem(l) !== null ||
  /^\s*([-*_])\s*(\1\s*){2,}$/.test(l);

// Render a markdown document to an HTML string.
export const renderMarkdown = (md: string): string => {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const slugCounts = new Map<string, number>();
  let i = 0;

  const uniqueSlug = (text: string): string => {
    const base = slugify(text);
    const seen = slugCounts.get(base) ?? 0;
    slugCounts.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i++;
      continue;
    }

    // YAML front matter at the very top — render as a small properties table.
    if (i === 0 && line.trim() === "---") {
      const buf: string[] = [];
      i++;
      while (i < lines.length && (lines[i] ?? "").trim() !== "---") {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++;
      const rows = buf
        .map((l) => /^([^:]+):\s*(.*)$/.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
        .map(
          (m) =>
            `<tr><th>${escapeHtml((m[1] ?? "").trim())}</th><td>${escapeHtml((m[2] ?? "").trim())}</td></tr>`,
        )
        .join("");
      if (rows) out.push(`<table class="md-props">${rows}</table>`);
      continue;
    }

    // Block math: $$ … $$
    if (line.trim() === "$$") {
      const buf: string[] = [];
      i++;
      while (i < lines.length && (lines[i] ?? "").trim() !== "$$") {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++;
      out.push(`<div class="math-block">${renderMath(buf.join("\n"), true)}</div>`);
      continue;
    }

    const fence = /^(```|~~~)(.*)$/.exec(line);
    if (fence) {
      const marker = fence[1] ?? "```";
      const lang = (fence[2] ?? "").trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith(marker)) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++;
      const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
      out.push(`<pre><code${cls}>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? "#").length;
      const text = (heading[2] ?? "").trim();
      out.push(`<h${level} id="${uniqueSlug(text)}">${renderInline(text)}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      out.push("<hr />");
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? "")) {
        buf.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderInline(buf.join(" "))}</blockquote>`);
      continue;
    }

    if (line.includes("|") && isTableSep(lines[i + 1] ?? "")) {
      const buf: string[] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      out.push(renderTable(buf));
      continue;
    }

    if (parseListItem(line)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const parsed = parseListItem(lines[i] ?? "");
        if (!parsed) break;
        items.push(parsed);
        i++;
      }
      out.push(renderListNodes(buildListTree(items)));
      continue;
    }

    const buf: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (isBlockStart(l)) break;
      buf.push(l);
      i++;
    }
    out.push(`<p>${renderInline(buf.join("\n").trim()).replace(/\n/g, "<br />")}</p>`);
  }

  return out.join("\n");
};

// Headings only — used to build the document outline.
export const extractHeadings = (md: string): Heading[] => {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const headings: Heading[] = [];
  const slugCounts = new Map<string, number>();
  let inFence = false;

  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!m) continue;
    const level = (m[1] ?? "#").length;
    const text = (m[2] ?? "").trim();
    const base = slugify(text);
    const seen = slugCounts.get(base) ?? 0;
    slugCounts.set(base, seen + 1);
    headings.push({ level, text, slug: seen === 0 ? base : `${base}-${seen}` });
  }
  return headings;
};
