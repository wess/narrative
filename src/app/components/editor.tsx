import { toast } from "@basket/ui/toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Block,
  emptyBlock,
  LIST_TYPES,
  newId,
  parseBlocks,
  serializeBlocks,
  TEXT_TYPES,
} from "../lib/blocks.ts";
import { copyText } from "../lib/clipboard.ts";
import { openMenu } from "../lib/contextmenu.ts";
import { formatDateTime } from "../lib/dates.ts";
import { inlineToHtml } from "../lib/inline.ts";
import { slugify } from "../lib/markdown.ts";
import { flattenTree } from "../lib/tree.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";
import { type BlockOps, BlockView } from "./block.tsx";
import { buildPageMenu } from "./contextmenu.tsx";
import { EmojiPicker } from "./emojipicker.tsx";
import { PageIcon } from "./icon.tsx";

type Focus = { id: string; offset: number } | null;

// Visible (rendered) character length of an inline-markdown string —
// used to place the caret after a structural change.
const visibleLength = (md: string): number => {
  if (!md) return 0;
  const probe = document.createElement("div");
  probe.innerHTML = inlineToHtml(md);
  return (probe.textContent ?? "").length;
};

export const Editor = () => {
  const { activePage, tree, tags, pendingScroll } = useApp();

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pendingFocus, setPendingFocus] = useState<Focus>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [iconOpen, setIconOpen] = useState(false);

  const blocksRef = useRef<Block[]>([]);
  blocksRef.current = blocks;
  const pageIdRef = useRef<number | null>(null);
  pageIdRef.current = activePage?.id ?? null;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<{ title?: string; body?: string }>({});
  // The last body string the editor is in sync with — set on page open and
  // on every local edit. When `activePage.body` differs from this, the change
  // came from outside (the vault watcher caught an edit in another app), so
  // the document is re-parsed to match the file on disk.
  const lastBodyRef = useRef("");

  const clearFocus = useCallback(() => setPendingFocus(null), []);

  // Scroll to a `[[Page#Heading]]` anchor once the target page has rendered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run after blocks render
  useEffect(() => {
    if (!pendingScroll) return;
    const slug = slugify(pendingScroll);
    const timer = window.setTimeout(() => {
      document.getElementById(slug)?.scrollIntoView({ behavior: "smooth", block: "start" });
      actions.consumeScroll();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [pendingScroll, blocks]);

  // Re-parse the document whenever a different page is opened. The cleanup
  // flushes any debounced save for the page being left so edits never drop.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to page identity only
  useEffect(() => {
    if (!activePage) {
      setBlocks([]);
      setTitle("");
      return;
    }
    setBlocks(parseBlocks(activePage.body));
    setTitle(activePage.title);
    setIconOpen(false);
    lastBodyRef.current = activePage.body;
    const leavingId = activePage.id;
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        const patch = pendingPatch.current;
        pendingPatch.current = {};
        if (Object.keys(patch).length > 0) void actions.savePage({ id: leavingId, ...patch });
      }
    };
  }, [activePage?.id]);

  // External-edit sync: when `activePage.body` changes for a reason that
  // isn't a local edit (the vault watcher saw the file change in git or
  // another editor…), re-parse so the editor reflects the file on disk.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to the body string only
  useEffect(() => {
    if (!activePage) return;
    if (activePage.body === lastBodyRef.current) return;
    lastBodyRef.current = activePage.body;
    setBlocks(parseBlocks(activePage.body));
    setTitle(activePage.title);
  }, [activePage?.body]);

  // Stable editor operations + a debounced save. Everything referenced here
  // is a stable ref or setter, so the memo never needs to re-create.
  const { ops, save } = useMemo(() => {
    const queueSave = (patch: { title?: string; body?: string }) => {
      Object.assign(pendingPatch.current, patch);
      const id = pageIdRef.current;
      if (id === null) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const p = pendingPatch.current;
        pendingPatch.current = {};
        if (pageIdRef.current === id && Object.keys(p).length > 0) {
          void actions.savePage({ id, ...p });
        }
      }, 500);
    };

    const apply = (next: Block[], focus?: Focus) => {
      setBlocks(next);
      if (focus !== undefined) setPendingFocus(focus);
      const body = serializeBlocks(next);
      lastBodyRef.current = body;
      queueSave({ body });
    };

    const ops: BlockOps = {
      change: (id, patch) =>
        apply(blocksRef.current.map((b) => (b.id === id ? { ...b, ...patch } : b))),

      split: (id, before, after) => {
        const list = blocksRef.current;
        const idx = list.findIndex((b) => b.id === id);
        const cur = list[idx];
        if (!cur) return;
        const isList = LIST_TYPES.has(cur.type);
        const isQuote = cur.type === "quote";

        if ((isList || isQuote) && before === "" && after === "") {
          const para = emptyBlock();
          apply([...list.slice(0, idx), para, ...list.slice(idx + 1)], {
            id: para.id,
            offset: 0,
          });
          return;
        }

        const first: Block = { ...cur, id: newId(), text: before };
        const second: Block =
          isList || isQuote
            ? {
                ...cur,
                id: newId(),
                text: after,
                ...(cur.type === "todo" ? { checked: false } : {}),
              }
            : { id: newId(), type: "paragraph", text: after };
        apply([...list.slice(0, idx), first, second, ...list.slice(idx + 1)], {
          id: second.id,
          offset: 0,
        });
      },

      mergeBack: (id) => {
        const list = blocksRef.current;
        const idx = list.findIndex((b) => b.id === id);
        if (idx <= 0) return;
        const cur = list[idx];
        const prev = list[idx - 1];
        if (!cur || !prev) return;
        if (!TEXT_TYPES.has(prev.type)) {
          apply([...list.slice(0, idx - 1), ...list.slice(idx)], { id: cur.id, offset: 0 });
          return;
        }
        const merged: Block = { ...prev, id: newId(), text: prev.text + cur.text };
        apply([...list.slice(0, idx - 1), merged, ...list.slice(idx + 1)], {
          id: merged.id,
          offset: visibleLength(prev.text),
        });
      },

      convert: (id, type, text) => {
        const list = blocksRef.current;
        const idx = list.findIndex((b) => b.id === id);
        const cur = list[idx];
        if (!cur) return;
        const before = list.slice(0, idx);
        const after = list.slice(idx + 1);

        if (type === "divider") {
          const divider: Block = { id: newId(), type: "divider", text: "" };
          const para: Block = { id: newId(), type: "paragraph", text };
          apply([...before, divider, para, ...after], { id: para.id, offset: 0 });
          return;
        }
        if (type === "code") {
          const code: Block = { id: newId(), type: "code", text, lang: "" };
          apply([...before, code, ...after], { id: code.id, offset: 0 });
          return;
        }
        if (type === "image") {
          const image: Block = { id: newId(), type: "image", text: "", src: "", alt: "" };
          apply([...before, image, ...after], { id: image.id, offset: 0 });
          return;
        }
        if (type === "table") {
          const table: Block = {
            id: newId(),
            type: "table",
            text: "",
            rows: [
              ["", ""],
              ["", ""],
            ],
          };
          apply([...before, table, ...after]);
          return;
        }
        if (type === "embed") {
          const embed: Block = { id: newId(), type: "embed", text: "", target: "" };
          apply([...before, embed, ...after]);
          return;
        }
        if (type === "math") {
          const math: Block = { id: newId(), type: "math", text };
          apply([...before, math, ...after]);
          return;
        }
        if (type === "properties") {
          if (blocksRef.current.some((b) => b.type === "properties")) return;
          const node: Block = { id: newId(), type: "properties", text: "", props: [] };
          const para: Block = { id: newId(), type: "paragraph", text };
          // properties always lead the document
          apply([node, ...before, para, ...after], { id: para.id, offset: 0 });
          return;
        }
        if (type === "callout") {
          const callout: Block = {
            id: newId(),
            type: "callout",
            text,
            calloutKind: "note",
          };
          apply([...before, callout, ...after], { id: callout.id, offset: 0 });
          return;
        }

        const block: Block = {
          id: newId(),
          type,
          text,
          ...(LIST_TYPES.has(type) ? { indent: cur.indent ?? 0 } : {}),
          ...(type === "todo" ? { checked: false } : {}),
        };
        apply([...before, block, ...after], { id: block.id, offset: 0 });
      },

      indent: (id, delta) => {
        apply(
          blocksRef.current.map((b) => {
            if (b.id !== id || !LIST_TYPES.has(b.type)) return b;
            return { ...b, indent: Math.max(0, Math.min(6, (b.indent ?? 0) + delta)) };
          }),
        );
      },

      arrow: (id, dir) => {
        const list = blocksRef.current;
        const idx = list.findIndex((b) => b.id === id);
        const target = dir === "up" ? list[idx - 1] : list[idx + 1];
        if (!target) return;
        setPendingFocus({
          id: target.id,
          offset: dir === "up" ? visibleLength(target.text) : 0,
        });
      },

      remove: (id) => {
        const list = blocksRef.current;
        const idx = list.findIndex((b) => b.id === id);
        if (idx < 0) return;
        const next = list.filter((b) => b.id !== id);
        if (next.length === 0) {
          const para = emptyBlock();
          apply([para], { id: para.id, offset: 0 });
          return;
        }
        const focusTarget = next[idx] ?? next[idx - 1];
        apply(next, focusTarget ? { id: focusTarget.id, offset: 0 } : null);
      },

      insertAfter: (id, type = "paragraph") => {
        const list = blocksRef.current;
        const idx = list.findIndex((b) => b.id === id);
        if (idx < 0) return;
        const block = emptyBlock(type);
        apply([...list.slice(0, idx + 1), block, ...list.slice(idx + 1)], {
          id: block.id,
          offset: 0,
        });
      },

      move: (dragged, targetId, pos) => {
        const list = blocksRef.current;
        const moving = list.find((b) => b.id === dragged);
        if (!moving || dragged === targetId) return;
        const without = list.filter((b) => b.id !== dragged);
        const ti = without.findIndex((b) => b.id === targetId);
        if (ti < 0) return;
        const at = pos === "before" ? ti : ti + 1;
        apply([...without.slice(0, at), moving, ...without.slice(at)]);
      },

      duplicate: (id) => {
        const list = blocksRef.current;
        const idx = list.findIndex((b) => b.id === id);
        const original = list[idx];
        if (!original) return;
        const copy: Block = { ...original, id: newId() };
        apply([...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)], {
          id: copy.id,
          offset: 0,
        });
      },

      copyMarkdown: (id) => {
        const original = blocksRef.current.find((b) => b.id === id);
        if (!original) return;
        void copyText(serializeBlocks([original])).then((ok) => {
          if (ok) toast.success("Copied as Markdown");
        });
      },

      moveBy: (id, delta) => {
        const list = blocksRef.current;
        const idx = list.findIndex((b) => b.id === id);
        const swap = idx + delta;
        if (idx < 0 || swap < 0 || swap >= list.length) return;
        const next = [...list];
        const a = next[idx];
        const b = next[swap];
        if (!a || !b) return;
        next[idx] = b;
        next[swap] = a;
        apply(next);
      },
    };

    return { ops, save: queueSave };
  }, []);

  const pageTitles = useMemo(() => flattenTree(tree).map((n) => n.title || "Untitled"), [tree]);
  const tagNames = useMemo(() => tags.map((t) => t.tag), [tags]);

  // Ordinals for numbered-list blocks (a run breaks on any other block type).
  const ordinals = useMemo(() => {
    const map = new Map<string, number>();
    let count = 0;
    for (const b of blocks) {
      if (b.type === "numbered") {
        count += 1;
        map.set(b.id, count);
      } else {
        count = 0;
      }
    }
    return map;
  }, [blocks]);

  const words = useMemo(() => {
    const text = blocks
      .map((b) => b.text)
      .join(" ")
      .replace(/[#*_>`[\]()~|-]/g, " ")
      .trim();
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
  }, [blocks]);

  if (!activePage) {
    return (
      <div className="editor-empty">
        <div className="editor-empty-mark">◆</div>
        <h2>Nothing open</h2>
        <p>Create a page with ⌘N, or pick one from the sidebar.</p>
        <button type="button" onClick={() => void actions.createPage(null)}>
          New page
        </button>
      </div>
    );
  }
  const page = activePage;

  return (
    <div className="editor">
      <div className="editor-scroll">
        <article className="doc">
          <div
            className="doc-head"
            onContextMenu={(e) => {
              e.preventDefault();
              openMenu(e.clientX, e.clientY, buildPageMenu(page));
            }}
          >
            <div className="icon-pick-wrap">
              <button
                type="button"
                className="icon-pick"
                title="Change icon"
                onClick={() => setIconOpen((v) => !v)}
              >
                <PageIcon icon={page.icon} size={30} />
              </button>
              {iconOpen ? (
                <EmojiPicker
                  value={page.icon}
                  onClose={() => setIconOpen(false)}
                  onPick={(emoji) => {
                    setIconOpen(false);
                    void actions.savePage({ id: page.id, icon: emoji });
                  }}
                />
              ) : null}
            </div>
            <input
              className="doc-title"
              value={title}
              placeholder="Untitled"
              onChange={(e) => {
                setTitle(e.target.value);
                save({ title: e.target.value });
              }}
            />
          </div>

          <div className="doc-blocks">
            {blocks.map((b) => (
              <BlockView
                key={b.id}
                block={b}
                ordinal={ordinals.get(b.id) ?? 1}
                ops={ops}
                pageTitles={pageTitles}
                tagNames={tagNames}
                pendingFocus={pendingFocus}
                onFocused={clearFocus}
                dragId={dragId}
                setDragId={setDragId}
              />
            ))}
          </div>

          <footer className="doc-foot">
            <span>{words} words</span>
            <span className="dot">·</span>
            <span>{blocks.length} blocks</span>
            <span className="doc-foot-spacer" />
            <span>Updated {formatDateTime(page.updatedAt)}</span>
          </footer>
        </article>
      </div>
    </div>
  );
};
