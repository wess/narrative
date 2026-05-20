// Inline rich text for a single block. The contentEditable surface holds
// HTML; the model holds inline markdown. These functions convert between
// the two, plus the caret/Range helpers the block editor needs.

import { renderMath } from "./math.ts";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const WIKI_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/gu;
const CODE_TOKEN = /@@C(\d+)@@/g;
const MATH_TOKEN = /@@M(\d+)@@/g;

// Atomic inline nodes (wiki links, tags, math, external links) are rendered
// `contenteditable="false"` so the caret treats them as a single unit.
export const inlineToHtml = (md: string): string => {
  if (!md) return "";
  const code: string[] = [];
  let t = md.replace(/`([^`]+)`/g, (_m, c: string) => {
    code.push(`<code>${escapeHtml(c)}</code>`);
    return `@@C${code.length - 1}@@`;
  });

  const math: string[] = [];
  t = t.replace(/\$([^$\n]+)\$/g, (_m, tex: string) => {
    math.push(
      `<span class="math-inline" contenteditable="false" data-tex="${escapeHtml(tex)}">${renderMath(tex, false)}</span>`,
    );
    return `@@M${math.length - 1}@@`;
  });

  t = escapeHtml(t);

  t = t.replace(WIKI_RE, (_m, raw: string, alias?: string) => {
    const hash = raw.indexOf("#");
    const title = (hash < 0 ? raw : raw.slice(0, hash)).trim();
    const anchor = hash < 0 ? "" : raw.slice(hash + 1).trim();
    const aliasText = (alias ?? "").trim();
    const label = aliasText || (anchor ? (title ? `${title} › ${anchor}` : `› ${anchor}`) : title);
    return `<a class="wikilink" contenteditable="false" data-title="${escapeHtml(title)}" data-anchor="${escapeHtml(anchor)}" data-alias="${escapeHtml(aliasText)}">${escapeHtml(label)}</a>`;
  });

  t = t.replace(
    LINK_RE,
    (_m, label: string, url: string) =>
      `<a class="exlink" contenteditable="false" data-href="${escapeHtml(url)}">${escapeHtml(label)}</a>`,
  );

  t = t
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");

  t = t.replace(
    TAG_RE,
    (_m, pre: string, tag: string) =>
      `${pre}<a class="tag" contenteditable="false" data-tag="${escapeHtml(tag.toLowerCase())}">#${escapeHtml(tag)}</a>`,
  );

  t = t.replace(CODE_TOKEN, (_m, i: string) => code[Number(i)] ?? "");
  return t.replace(MATH_TOKEN, (_m, i: string) => math[Number(i)] ?? "");
};

const BACKTICK = "`";

// Serialise a contentEditable subtree back to inline markdown.
export const htmlToInline = (root: Node): string => {
  let out = "";

  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;

      if (child.classList.contains("wikilink")) {
        const title = child.getAttribute("data-title") ?? "";
        const anchor = child.getAttribute("data-anchor") ?? "";
        const alias = child.getAttribute("data-alias") ?? "";
        const target = anchor ? `${title}#${anchor}` : title;
        out += alias ? `[[${target}|${alias}]]` : `[[${target}]]`;
        continue;
      }
      if (child.classList.contains("tag")) {
        const tag = child.getAttribute("data-tag") ?? (child.textContent ?? "").replace(/^#/, "");
        out += `#${tag}`;
        continue;
      }
      if (child.classList.contains("math-inline")) {
        out += `$${child.getAttribute("data-tex") ?? ""}$`;
        continue;
      }
      if (child.classList.contains("exlink")) {
        out += `[${child.textContent ?? ""}](${child.getAttribute("data-href") ?? ""})`;
        continue;
      }

      const tag = child.tagName;
      if (tag === "STRONG" || tag === "B") {
        out += "**";
        walk(child);
        out += "**";
      } else if (tag === "EM" || tag === "I") {
        out += "*";
        walk(child);
        out += "*";
      } else if (tag === "DEL" || tag === "S" || tag === "STRIKE") {
        out += "~~";
        walk(child);
        out += "~~";
      } else if (tag === "CODE") {
        out += BACKTICK + (child.textContent ?? "") + BACKTICK;
      } else if (tag === "BR") {
        out += " ";
      } else {
        walk(child);
      }
    }
  };

  walk(root);
  return out.replace(/\u00a0/g, " ");
};

// --- caret / range helpers ------------------------------------------------

export const getCaretOffset = (el: HTMLElement): number => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
};

type Placement = { node: Node; offset: number };

export const setCaretOffset = (el: HTMLElement, offset: number): void => {
  const sel = window.getSelection();
  if (!sel) return;
  let remaining = offset;

  const walk = (node: Node): Placement | null => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const len = (child.textContent ?? "").length;
        if (remaining <= len) return { node: child, offset: remaining };
        remaining -= len;
      } else if (child instanceof HTMLElement) {
        if (child.getAttribute("contenteditable") === "false") {
          const len = (child.textContent ?? "").length;
          if (remaining <= len) {
            const idx = Array.from(node.childNodes).indexOf(child);
            return { node, offset: idx + 1 };
          }
          remaining -= len;
        } else {
          const found = walk(child);
          if (found) return found;
        }
      }
    }
    return null;
  };

  const placed = walk(el);
  const range = document.createRange();
  if (placed) {
    range.setStart(placed.node, placed.offset);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
};

export const caretAtStart = (el: HTMLElement): boolean => getCaretOffset(el) === 0;

export const caretAtEnd = (el: HTMLElement): boolean =>
  getCaretOffset(el) >= (el.textContent ?? "").length;

// Split the block's content at the caret into two inline-markdown halves.
export const splitAtCaret = (el: HTMLElement): { before: string; after: string } => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { before: htmlToInline(el), after: "" };
  const caret = sel.getRangeAt(0);

  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(el);
  beforeRange.setEnd(caret.endContainer, caret.endOffset);

  const afterRange = document.createRange();
  afterRange.selectNodeContents(el);
  afterRange.setStart(caret.endContainer, caret.endOffset);

  const beforeHost = document.createElement("div");
  beforeHost.appendChild(beforeRange.cloneContents());
  const afterHost = document.createElement("div");
  afterHost.appendChild(afterRange.cloneContents());

  return { before: htmlToInline(beforeHost), after: htmlToInline(afterHost) };
};

// Bounding rect of the caret — used to place the slash / link menus.
export const caretRect = (): DOMRect | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0] ?? null;
  // Collapsed range at an element boundary has no rects — probe a marker.
  const marker = document.createElement("span");
  marker.textContent = "​";
  range.insertNode(marker);
  const rect = marker.getBoundingClientRect();
  marker.remove();
  return rect;
};

// Replace the caret's selection with a node, then place the caret after it.
export const insertNodeAtCaret = (node: Node): void => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
};
