import { invoke } from "@basket/ipc/client";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardCopy,
  CopyPlus,
  FileText,
  GripVertical,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as ch from "../../shared/channels.ts";
import type { Page } from "../../shared/types.ts";
import { saveImageAttachment, useAttachmentSrc } from "../lib/attachment.ts";
import type { Block, BlockType } from "../lib/blocks.ts";
import { type CtxItem, openMenu, separator } from "../lib/contextmenu.ts";
import {
  caretAtEnd,
  caretAtStart,
  caretRect,
  htmlToInline,
  inlineToHtml,
  insertNodeAtCaret,
  setCaretOffset,
  splitAtCaret,
} from "../lib/inline.ts";
import { slugify } from "../lib/markdown.ts";
import { renderMath } from "../lib/math.ts";
import { actions } from "../state/actions.ts";
import { RenderedMarkdown } from "./renderedmarkdown.tsx";
import {
  BlockMenu,
  filterSlash,
  type MenuEntry,
  SelectionToolbar,
  SLASH_COMMANDS,
} from "./slashmenu.tsx";

export const CALLOUT_KINDS = ["note", "tip", "warning", "danger", "success", "info"];

// Renders an `![[Page]]` embed — the target page's content, read-only.
const EmbedBlock = ({ target }: { target: string }) => {
  const [page, setPage] = useState<Page | null | undefined>(undefined);

  useEffect(() => {
    const trimmed = target.trim();
    if (!trimmed) {
      setPage(null);
      return;
    }
    const hash = trimmed.indexOf("#");
    const title = (hash < 0 ? trimmed : trimmed.slice(0, hash)).trim();
    let alive = true;
    void invoke(ch.pageByTitle, { title }).then((p) => {
      if (alive) setPage(p);
    });
    return () => {
      alive = false;
    };
  }, [target]);

  if (!target.trim()) {
    return <div className="block-embed block-embed-empty">Set a page title to embed below.</div>;
  }
  if (page === undefined) {
    return <div className="block-embed block-embed-empty">Loading…</div>;
  }
  if (page === null) {
    return <div className="block-embed block-embed-empty">No page titled “{target.trim()}”.</div>;
  }
  return (
    <div className="block-embed">
      <button
        type="button"
        className="block-embed-head"
        onClick={() => void actions.openPage(page.id)}
      >
        {page.icon ? <span>{page.icon}</span> : <FileText size={13} />}
        <span>{page.title || "Untitled"}</span>
      </button>
      <RenderedMarkdown
        body={page.body}
        sourcePath={page.title}
        className="block-embed-body markdown"
      />
    </div>
  );
};

// Everything the editor container exposes to a block. Implementations live
// in editor.tsx; the block just calls them.
export type BlockOps = {
  change: (id: string, patch: Partial<Block>) => void;
  split: (id: string, before: string, after: string) => void;
  mergeBack: (id: string) => void;
  convert: (id: string, type: BlockType, text: string) => void;
  indent: (id: string, delta: number) => void;
  arrow: (id: string, dir: "up" | "down") => void;
  remove: (id: string) => void;
  insertAfter: (id: string, type?: BlockType) => void;
  move: (dragId: string, targetId: string, pos: "before" | "after") => void;
  duplicate: (id: string) => void;
  copyMarkdown: (id: string) => void;
  moveBy: (id: string, delta: number) => void;
  // Insert an image block carrying `src` — used when an image is pasted.
  imageFromPaste: (id: string, src: string) => void;
};

// An image block's picture. A vault attachment path is resolved to bytes
// over IPC; an external URL renders straight away.
const ImageContent = ({ src, alt }: { src: string; alt: string }) => {
  const resolved = useAttachmentSrc(src);
  if (!src) {
    return <div className="block-image-empty">Paste an image, or add a URL below</div>;
  }
  if (!resolved) {
    return <div className="block-image-empty">Loading image…</div>;
  }
  return <img src={resolved} alt={alt} />;
};

// Block types offered by the "Turn into" submenu.
const TURN_INTO: [BlockType, string][] = [
  ["paragraph", "Text"],
  ["h1", "Heading 1"],
  ["h2", "Heading 2"],
  ["h3", "Heading 3"],
  ["bulleted", "Bulleted list"],
  ["numbered", "Numbered list"],
  ["todo", "To-do"],
  ["quote", "Quote"],
  ["code", "Code"],
];

const buildBlockMenu = (block: Block, ops: BlockOps): CtxItem[] => [
  {
    kind: "item",
    label: "Turn into",
    icon: <Type size={14} />,
    submenu: TURN_INTO.map(([type, label]) => ({
      kind: "item",
      label,
      disabled: block.type === type,
      onSelect: () => ops.convert(block.id, type, block.text),
    })),
  },
  separator,
  {
    kind: "item",
    label: "Duplicate",
    icon: <CopyPlus size={14} />,
    onSelect: () => ops.duplicate(block.id),
  },
  {
    kind: "item",
    label: "Copy as Markdown",
    icon: <ClipboardCopy size={14} />,
    onSelect: () => ops.copyMarkdown(block.id),
  },
  separator,
  {
    kind: "item",
    label: "Move up",
    icon: <ArrowUp size={14} />,
    onSelect: () => ops.moveBy(block.id, -1),
  },
  {
    kind: "item",
    label: "Move down",
    icon: <ArrowDown size={14} />,
    onSelect: () => ops.moveBy(block.id, 1),
  },
  separator,
  {
    kind: "item",
    label: "Delete",
    icon: <Trash2 size={14} />,
    danger: true,
    onSelect: () => ops.remove(block.id),
  },
];

export type BlockProps = {
  block: Block;
  ordinal: number;
  ops: BlockOps;
  pageTitles: readonly string[];
  tagNames: readonly string[];
  pendingFocus: { id: string; offset: number } | null;
  onFocused: () => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
};

type ActiveMenu = {
  kind: "slash" | "wiki" | "tag";
  query: string;
  index: number;
  matchLen: number;
  top: number;
  left: number;
};

const PLACEHOLDERS: Partial<Record<BlockType, string>> = {
  paragraph: "Write, or press '/' for commands…",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  bulleted: "List item",
  numbered: "List item",
  todo: "To-do",
  quote: "Quote",
};

const blockRuleFor = (before: string): BlockType | null => {
  switch (before) {
    case "#":
      return "h1";
    case "##":
      return "h2";
    case "###":
      return "h3";
    case ">":
      return "quote";
    case "-":
    case "*":
      return "bulleted";
    case "[]":
    case "[ ]":
      return "todo";
    case "---":
      return "divider";
    case "```":
      return "code";
    default:
      return /^\d+[.)]$/.test(before) ? "numbered" : null;
  }
};

// Plain visible text from the start of `el` up to the caret.
const textBeforeCaret = (el: HTMLElement): string => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return "";
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString();
};

const deleteBeforeCaret = (count: number): void => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  for (let k = 0; k < count; k++) sel.modify("extend", "backward", "character");
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
};

const makeInlineNode = (kind: "wiki" | "tag", value: string): HTMLAnchorElement => {
  const node = document.createElement("a");
  node.setAttribute("contenteditable", "false");
  if (kind === "wiki") {
    const hash = value.indexOf("#");
    const title = (hash < 0 ? value : value.slice(0, hash)).trim();
    const anchor = hash < 0 ? "" : value.slice(hash + 1).trim();
    node.className = "wikilink";
    node.setAttribute("data-title", title);
    node.setAttribute("data-anchor", anchor);
    node.setAttribute("data-alias", "");
    node.textContent = anchor ? `${title} › ${anchor}` : title;
  } else {
    node.className = "tag";
    node.setAttribute("data-tag", value.toLowerCase());
    node.textContent = `#${value}`;
  }
  return node;
};

// --- text block (paragraph / headings / list items / quote) --------------

const TextBlock = ({
  block,
  ops,
  pageTitles,
  tagNames,
  pendingFocus,
  onFocused,
  editableRef,
}: BlockProps & { editableRef: React.RefObject<HTMLDivElement | null> }) => {
  const [menu, setMenu] = useState<ActiveMenu | null>(null);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: seed the DOM once; the model never writes back into a live block
  useLayoutEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    el.innerHTML = inlineToHtml(block.text);
    el.classList.toggle("is-empty", (el.textContent ?? "").trim() === "");
  }, []);

  useLayoutEffect(() => {
    if (pendingFocus?.id === block.id && editableRef.current) {
      const el = editableRef.current;
      el.focus();
      setCaretOffset(el, pendingFocus.offset);
      onFocused();
    }
  }, [pendingFocus, block.id, onFocused, editableRef]);

  const menuItems = useMemo<MenuEntry[]>(() => {
    if (!menu) return [];
    if (menu.kind === "slash") {
      return filterSlash(menu.query).map((c) => ({
        id: c.id,
        label: c.label,
        hint: c.hint,
        icon: c.icon,
      }));
    }
    if (menu.kind === "wiki") {
      const q = menu.query.trim().toLowerCase();
      const matches = pageTitles.filter((t) => t.toLowerCase().includes(q)).slice(0, 6);
      const items: MenuEntry[] = matches.map((t) => ({ id: `p:${t}`, label: t }));
      if (menu.query.trim() && !pageTitles.some((t) => t.toLowerCase() === q)) {
        items.push({ id: "__create", label: `Create “${menu.query.trim()}”`, hint: "new page" });
      }
      return items;
    }
    const q = menu.query.toLowerCase();
    const matches = tagNames.filter((t) => t.includes(q)).slice(0, 6);
    const items: MenuEntry[] = matches.map((t) => ({ id: `t:${t}`, label: `#${t}` }));
    if (menu.query && !tagNames.includes(q)) {
      items.push({ id: "__create", label: `Create #${menu.query.toLowerCase()}`, hint: "new tag" });
    }
    return items;
  }, [menu, pageTitles, tagNames]);

  const flush = () => {
    const el = editableRef.current;
    if (!el) return;
    el.classList.toggle("is-empty", (el.textContent ?? "").trim() === "");
    ops.change(block.id, { text: htmlToInline(el) });
  };

  const syncMenu = () => {
    const el = editableRef.current;
    if (!el) {
      setMenu(null);
      return;
    }
    const before = textBeforeCaret(el);
    const wiki = /\[\[([^\]\n]*)$/.exec(before);
    const slash = /(?:^|\s)\/(\w*)$/.exec(before);
    const tag = /(?:^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_/-]*)$/u.exec(before);
    const rect = caretRect();
    if (!rect) {
      setMenu(null);
      return;
    }
    const top = rect.bottom + 6;
    const left = rect.left;
    if (wiki) {
      const query = wiki[1] ?? "";
      setMenu({ kind: "wiki", query, index: 0, matchLen: query.length + 2, top, left });
    } else if (slash && block.type === "paragraph") {
      const query = slash[1] ?? "";
      setMenu({ kind: "slash", query, index: 0, matchLen: query.length + 1, top, left });
    } else if (tag) {
      const query = tag[1] ?? "";
      setMenu({ kind: "tag", query, index: 0, matchLen: query.length + 1, top, left });
    } else {
      setMenu(null);
    }
  };

  const syncToolbar = () => {
    const sel = window.getSelection();
    const el = editableRef.current;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !el || !el.contains(sel.anchorNode)) {
      setToolbar(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setToolbar({ top: rect.top - 44, left: Math.max(8, rect.left) });
  };

  const onInput = () => {
    flush();
    syncMenu();
    setToolbar(null);
  };

  const pickMenu = (entry: MenuEntry) => {
    const el = editableRef.current;
    if (!el || !menu) return;
    if (menu.kind === "slash") {
      const cmd = SLASH_COMMANDS.find((c) => c.id === entry.id);
      setMenu(null);
      if (!cmd) return;
      deleteBeforeCaret(menu.matchLen);
      ops.convert(block.id, cmd.type, htmlToInline(el));
      return;
    }
    const value =
      entry.id === "__create"
        ? menu.query.trim()
        : menu.kind === "wiki"
          ? entry.label
          : entry.label.replace(/^#/, "");
    deleteBeforeCaret(menu.matchLen);
    insertNodeAtCaret(makeInlineNode(menu.kind, value));
    insertNodeAtCaret(document.createTextNode(" "));
    setMenu(null);
    flush();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = editableRef.current;
    if (!el) return;

    if (menu && menuItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index + 1) % menuItems.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index - 1 + menuItems.length) % menuItems.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const entry = menuItems[menu.index];
        if (entry) pickMenu(entry);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }

    if (e.key === " " && block.type === "paragraph") {
      const { before, after } = splitAtCaret(el);
      const rule = blockRuleFor(before);
      if (rule) {
        e.preventDefault();
        setMenu(null);
        ops.convert(block.id, rule, after);
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        document.execCommand("bold");
        flush();
        return;
      }
      if (k === "i") {
        e.preventDefault();
        document.execCommand("italic");
        flush();
        return;
      }
      if (k === "e") {
        e.preventDefault();
        wrapInlineCode();
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setMenu(null);
      const { before, after } = splitAtCaret(el);
      ops.split(block.id, before, after);
      return;
    }

    if (e.key === "Backspace" && caretAtStart(el)) {
      e.preventDefault();
      if (block.type !== "paragraph") ops.convert(block.id, "paragraph", htmlToInline(el));
      else ops.mergeBack(block.id);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      ops.indent(block.id, e.shiftKey ? -1 : 1);
      return;
    }

    if (e.key === "ArrowUp" && !e.shiftKey && caretAtStart(el)) {
      e.preventDefault();
      ops.arrow(block.id, "up");
      return;
    }
    if (e.key === "ArrowDown" && !e.shiftKey && caretAtEnd(el)) {
      e.preventDefault();
      ops.arrow(block.id, "down");
    }
  };

  const wrapInlineCode = () => {
    const sel = window.getSelection();
    const el = editableRef.current;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !el) return;
    const range = sel.getRangeAt(0);
    const code = document.createElement("code");
    code.textContent = range.toString();
    range.deleteContents();
    range.insertNode(code);
    range.setStartAfter(code);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    flush();
  };

  const wrapLink = () => {
    const sel = window.getSelection();
    const el = editableRef.current;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !el) return;
    const range = sel.getRangeAt(0);
    const text = range.toString();
    const link = document.createElement("a");
    link.className = "exlink";
    link.setAttribute("contenteditable", "false");
    link.setAttribute("data-href", /^https?:\/\//.test(text) ? text : `https://${text}`);
    link.textContent = text;
    range.deleteContents();
    range.insertNode(link);
    range.setStartAfter(link);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    setToolbar(null);
    flush();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    // An image on the clipboard becomes a vault attachment + an image block.
    const imageFile = Array.from(e.clipboardData.items)
      .find((it) => it.kind === "file" && it.type.startsWith("image/"))
      ?.getAsFile();
    if (imageFile) {
      e.preventDefault();
      void saveImageAttachment(imageFile).then((path) => {
        if (path) ops.imageFromPaste(block.id, path);
      });
      return;
    }
    e.preventDefault();
    const text = (e.clipboardData.getData("text/plain") ?? "").replace(/\r?\n/g, " ");
    document.execCommand("insertText", false, text);
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    if (anchor.classList.contains("wikilink")) {
      e.preventDefault();
      const title = anchor.getAttribute("data-title") ?? "";
      const anc = anchor.getAttribute("data-anchor") || null;
      void actions.openWikilink(title, anc);
    } else if (anchor.classList.contains("tag")) {
      e.preventDefault();
      const tag = anchor.getAttribute("data-tag");
      if (tag) void actions.openTag(tag);
    }
  };

  const exec = (cmd: string) => {
    document.execCommand(cmd);
    setToolbar(null);
    flush();
  };

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a rich-text contentEditable surface (inline links, tags, formatting) — it can't be a plain <input>/<textarea> */}
      <div
        ref={editableRef}
        className="block-editable"
        role="textbox"
        aria-multiline="true"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={PLACEHOLDERS[block.type] ?? "Write…"}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onClick={onClick}
        onMouseUp={syncToolbar}
        onKeyUp={(e) => {
          if (!menu && (e.key.startsWith("Arrow") || e.shiftKey)) syncToolbar();
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setMenu(null);
            setToolbar(null);
          }, 150);
        }}
      />
      {menu ? (
        <BlockMenu
          items={menuItems}
          index={menu.index}
          top={menu.top}
          left={menu.left}
          header={menu.kind === "slash" ? "Blocks" : menu.kind === "wiki" ? "Link to page" : "Tag"}
          onHover={(i) => setMenu({ ...menu, index: i })}
          onPick={pickMenu}
        />
      ) : null}
      {toolbar ? (
        <SelectionToolbar
          top={toolbar.top}
          left={toolbar.left}
          onBold={() => exec("bold")}
          onItalic={() => exec("italic")}
          onStrike={() => exec("strikeThrough")}
          onCode={wrapInlineCode}
          onLink={wrapLink}
        />
      ) : null}
    </>
  );
};

// --- block (wrapper + content dispatch) ----------------------------------

const BlockInner = (props: BlockProps) => {
  const { block, ordinal, ops, pendingFocus, onFocused, dragId, setDragId } = props;
  const editableRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const plainRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<"before" | "after" | null>(null);

  // focus management for non-contentEditable blocks
  useLayoutEffect(() => {
    if (pendingFocus?.id !== block.id) return;
    if (block.type === "code" && codeRef.current) {
      codeRef.current.focus();
      onFocused();
    } else if (
      (block.type === "divider" || block.type === "image" || block.type === "table") &&
      plainRef.current
    ) {
      plainRef.current.focus();
      onFocused();
    }
  }, [pendingFocus, block.id, block.type, onFocused]);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragId || dragId === block.id) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setDropPos(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pos = dropPos;
    setDropPos(null);
    if (dragId && pos) ops.move(dragId, block.id, pos);
  };

  const codeKeys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Backspace" && block.text === "") {
      e.preventDefault();
      ops.convert(block.id, "paragraph", "");
    }
    if (e.key === "Tab") {
      e.preventDefault();
      document.execCommand("insertText", false, "  ");
    }
  };

  const plainKeys = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      ops.remove(block.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      ops.insertAfter(block.id, "paragraph");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      ops.arrow(block.id, "up");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      ops.arrow(block.id, "down");
    }
  };

  const updateCell = (r: number, c: number, value: string) => {
    const rows = (block.rows ?? []).map((row) => [...row]);
    const target = rows[r];
    if (target) target[c] = value;
    ops.change(block.id, { rows });
  };
  const addRow = () => {
    const rows = (block.rows ?? []).map((row) => [...row]);
    const width = rows[0]?.length ?? 1;
    rows.push(Array.from({ length: width }, () => ""));
    ops.change(block.id, { rows });
  };
  const addColumn = () => {
    const rows = (block.rows ?? []).map((row) => [...row, ""]);
    ops.change(block.id, { rows });
  };

  let content: React.ReactNode;
  if (block.type === "divider") {
    content = (
      <button
        type="button"
        ref={plainRef as unknown as React.RefObject<HTMLButtonElement>}
        className="block-divider"
        aria-label="Divider"
        onKeyDown={plainKeys}
      />
    );
  } else if (block.type === "code") {
    content = (
      <div className="block-code">
        <input
          className="block-code-lang"
          value={block.lang ?? ""}
          placeholder="language"
          onChange={(e) => ops.change(block.id, { lang: e.target.value })}
        />
        <textarea
          ref={codeRef}
          className="block-code-text"
          value={block.text}
          spellCheck={false}
          placeholder="Code…"
          onChange={(e) => ops.change(block.id, { text: e.target.value })}
          onKeyDown={codeKeys}
        />
      </div>
    );
  } else if (block.type === "image") {
    content = (
      <div className="block-image">
        <ImageContent src={block.src ?? ""} alt={block.alt ?? ""} />
        <input
          ref={plainRef as unknown as React.RefObject<HTMLInputElement>}
          className="block-image-url"
          value={block.src ?? ""}
          placeholder="Image URL — or paste an image into the page"
          onChange={(e) => ops.change(block.id, { src: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !block.src) {
              e.preventDefault();
              ops.remove(block.id);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              ops.insertAfter(block.id, "paragraph");
            }
          }}
        />
      </div>
    );
  } else if (block.type === "embed") {
    content = (
      <div className="block-embed-wrap">
        <EmbedBlock target={block.target ?? ""} />
        <input
          ref={plainRef as unknown as React.RefObject<HTMLInputElement>}
          className="block-embed-input"
          value={block.target ?? ""}
          placeholder="Page title to embed…"
          onChange={(e) => ops.change(block.id, { target: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !block.target) {
              e.preventDefault();
              ops.remove(block.id);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              ops.insertAfter(block.id, "paragraph");
            }
          }}
        />
      </div>
    );
  } else if (block.type === "table") {
    const rows = block.rows ?? [];
    content = (
      <div className="block-table">
        <table>
          <tbody>
            {rows.map((row, ri) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: table cells are positional, never reordered
              <tr key={ri} data-head={ri === 0}>
                {row.map((cell, ci) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: table cells are positional, never reordered
                  <td key={ci}>
                    <input value={cell} onChange={(e) => updateCell(ri, ci, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="block-table-actions">
          <button type="button" onClick={addRow}>
            + Row
          </button>
          <button type="button" onClick={addColumn}>
            + Column
          </button>
        </div>
      </div>
    );
  } else if (block.type === "callout") {
    const kind = block.calloutKind ?? "note";
    content = (
      <div className="block-callout" data-kind={kind}>
        <button
          type="button"
          className="callout-chip"
          title="Change callout type"
          onClick={() => {
            const idx = CALLOUT_KINDS.indexOf(kind);
            ops.change(block.id, {
              calloutKind: CALLOUT_KINDS[(idx + 1) % CALLOUT_KINDS.length],
            });
          }}
        >
          {kind}
        </button>
        <TextBlock {...props} editableRef={editableRef} />
      </div>
    );
  } else if (block.type === "math") {
    content = (
      <div className="block-math">
        <div
          className="block-math-render"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: katex output is sanitised HTML
          dangerouslySetInnerHTML={{ __html: renderMath(block.text, true) }}
        />
        <textarea
          ref={codeRef}
          className="block-math-input"
          value={block.text}
          spellCheck={false}
          placeholder="LaTeX — e.g. \frac{a}{b}"
          onChange={(e) => ops.change(block.id, { text: e.target.value })}
          onKeyDown={codeKeys}
        />
      </div>
    );
  } else if (block.type === "properties") {
    const rows = block.props ?? [];
    const setRows = (next: typeof rows) => ops.change(block.id, { props: next });
    content = (
      <div className="block-props">
        {rows.map((row, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: controlled inputs, stable enough
          <div className="prop-row" key={idx}>
            <input
              className="prop-key"
              value={row.key}
              placeholder="property"
              onChange={(e) =>
                setRows(rows.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r)))
              }
            />
            <input
              className="prop-val"
              value={row.value}
              placeholder="value"
              onChange={(e) =>
                setRows(rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))
              }
            />
            <button
              type="button"
              className="prop-del"
              title="Remove"
              onClick={() => setRows(rows.filter((_, i) => i !== idx))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="prop-add"
          onClick={() => setRows([...rows, { key: "", value: "" }])}
        >
          + Add property
        </button>
      </div>
    );
  } else if (block.type === "todo") {
    content = (
      <div className="block-todo">
        <button
          type="button"
          className="todo-check"
          data-checked={Boolean(block.checked)}
          onClick={() => ops.change(block.id, { checked: !block.checked })}
        >
          {block.checked ? <Check size={12} strokeWidth={3} /> : null}
        </button>
        <TextBlock {...props} editableRef={editableRef} />
      </div>
    );
  } else if (block.type === "bulleted") {
    content = (
      <div className="block-list">
        <span className="list-marker">•</span>
        <TextBlock {...props} editableRef={editableRef} />
      </div>
    );
  } else if (block.type === "numbered") {
    content = (
      <div className="block-list">
        <span className="list-marker list-marker-num">{ordinal}.</span>
        <TextBlock {...props} editableRef={editableRef} />
      </div>
    );
  } else {
    content = <TextBlock {...props} editableRef={editableRef} />;
  }

  const headingId =
    block.type === "h1" || block.type === "h2" || block.type === "h3"
      ? slugify(block.text)
      : undefined;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a block row is a drag-and-drop target and right-click-menu host — its inner controls (editable text, buttons) are individually keyboard-accessible
    <div
      className="block-row"
      id={headingId}
      data-type={block.type}
      data-checked={block.type === "todo" ? Boolean(block.checked) : undefined}
      data-drop={dropPos ?? undefined}
      data-dragging={dragId === block.id}
      style={block.indent ? { marginLeft: `${block.indent * 22}px` } : undefined}
      onDragOver={onDragOver}
      onDragLeave={() => setDropPos(null)}
      onDrop={onDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, buildBlockMenu(block, ops));
      }}
    >
      <div className="block-gutter">
        <button
          type="button"
          className="block-add"
          title="Add block below"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => ops.insertAfter(block.id)}
        >
          <Plus size={14} />
        </button>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer-only drag handle — block reordering also has keyboard-reachable "Move up/down" items in the block menu */}
        <span
          className="block-grip"
          title="Drag to move"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", block.id);
            setDragId(block.id);
          }}
          onDragEnd={() => setDragId(null)}
        >
          <GripVertical size={14} />
        </span>
      </div>
      <div className="block-body">{content}</div>
    </div>
  );
};

export const BlockView = memo(BlockInner);
