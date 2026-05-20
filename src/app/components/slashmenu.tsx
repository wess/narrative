import {
  Bold,
  BookOpen,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Settings2,
  Sigma,
  Strikethrough,
  Table as TableIcon,
  Type,
} from "lucide-react";
import type { ReactNode } from "react";
import type { BlockType } from "../lib/blocks.ts";

// --- generic positioned menu ---------------------------------------------

export type MenuEntry = {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly icon?: ReactNode;
};

export const BlockMenu = ({
  items,
  index,
  top,
  left,
  header,
  onPick,
  onHover,
}: {
  items: readonly MenuEntry[];
  index: number;
  top: number;
  left: number;
  header?: string;
  onPick: (entry: MenuEntry) => void;
  onHover: (i: number) => void;
}) => {
  if (items.length === 0) return null;
  return (
    <div className="block-menu" style={{ top, left }}>
      {header ? <div className="block-menu-head">{header}</div> : null}
      {items.map((entry, i) => (
        <button
          type="button"
          key={entry.id}
          className="block-menu-item"
          data-on={i === index}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(entry);
          }}
        >
          {entry.icon ? <span className="block-menu-icon">{entry.icon}</span> : null}
          <span className="block-menu-label">{entry.label}</span>
          {entry.hint ? <span className="block-menu-hint">{entry.hint}</span> : null}
        </button>
      ))}
    </div>
  );
};

// --- slash commands -------------------------------------------------------

export type SlashCommand = {
  readonly id: string;
  readonly label: string;
  readonly type: BlockType;
  readonly hint: string;
  readonly keywords: readonly string[];
  readonly icon: ReactNode;
};

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: "text",
    label: "Text",
    type: "paragraph",
    hint: "Plain paragraph",
    keywords: ["paragraph", "p", "body"],
    icon: <Type size={15} />,
  },
  {
    id: "h1",
    label: "Heading 1",
    type: "h1",
    hint: "Large section title",
    keywords: ["title", "big"],
    icon: <Heading1 size={15} />,
  },
  {
    id: "h2",
    label: "Heading 2",
    type: "h2",
    hint: "Medium heading",
    keywords: ["subtitle"],
    icon: <Heading2 size={15} />,
  },
  {
    id: "h3",
    label: "Heading 3",
    type: "h3",
    hint: "Small heading",
    keywords: ["minor"],
    icon: <Heading3 size={15} />,
  },
  {
    id: "bulleted",
    label: "Bulleted list",
    type: "bulleted",
    hint: "Unordered list",
    keywords: ["ul", "unordered", "dash"],
    icon: <List size={15} />,
  },
  {
    id: "numbered",
    label: "Numbered list",
    type: "numbered",
    hint: "Ordered list",
    keywords: ["ol", "ordered"],
    icon: <ListOrdered size={15} />,
  },
  {
    id: "todo",
    label: "To-do",
    type: "todo",
    hint: "Checklist item",
    keywords: ["task", "checkbox", "check"],
    icon: <ListChecks size={15} />,
  },
  {
    id: "quote",
    label: "Quote",
    type: "quote",
    hint: "Callout / quote",
    keywords: ["blockquote", "callout"],
    icon: <Quote size={15} />,
  },
  {
    id: "code",
    label: "Code",
    type: "code",
    hint: "Code block",
    keywords: ["snippet", "pre", "monospace"],
    icon: <Code size={15} />,
  },
  {
    id: "divider",
    label: "Divider",
    type: "divider",
    hint: "Visual separator",
    keywords: ["hr", "line", "rule", "separator"],
    icon: <Minus size={15} />,
  },
  {
    id: "image",
    label: "Image",
    type: "image",
    hint: "Embed by URL",
    keywords: ["img", "picture", "photo"],
    icon: <ImageIcon size={15} />,
  },
  {
    id: "table",
    label: "Table",
    type: "table",
    hint: "Simple grid",
    keywords: ["grid", "spreadsheet"],
    icon: <TableIcon size={15} />,
  },
  {
    id: "embed",
    label: "Embed page",
    type: "embed",
    hint: "Inline another page",
    keywords: ["transclude", "include", "reference"],
    icon: <BookOpen size={15} />,
  },
  {
    id: "callout",
    label: "Callout",
    type: "callout",
    hint: "Highlighted note / warning",
    keywords: ["admonition", "note", "warning", "tip"],
    icon: <Info size={15} />,
  },
  {
    id: "math",
    label: "Math block",
    type: "math",
    hint: "LaTeX equation",
    keywords: ["latex", "equation", "formula", "tex"],
    icon: <Sigma size={15} />,
  },
  {
    id: "properties",
    label: "Page properties",
    type: "properties",
    hint: "Front-matter metadata",
    keywords: ["frontmatter", "metadata", "fields"],
    icon: <Settings2 size={15} />,
  },
];

export const filterSlash = (query: string): SlashCommand[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter(
    (c) => c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q)),
  );
};

// --- selection toolbar ----------------------------------------------------

export type SelectionToolbarProps = {
  readonly top: number;
  readonly left: number;
  readonly onBold: () => void;
  readonly onItalic: () => void;
  readonly onStrike: () => void;
  readonly onCode: () => void;
  readonly onLink: () => void;
};

export const SelectionToolbar = ({
  top,
  left,
  onBold,
  onItalic,
  onStrike,
  onCode,
  onLink,
}: SelectionToolbarProps) => {
  const guard = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn();
  };
  return (
    <div className="sel-toolbar" style={{ top, left }}>
      <button type="button" title="Bold (⌘B)" onMouseDown={guard(onBold)}>
        <Bold size={14} />
      </button>
      <button type="button" title="Italic (⌘I)" onMouseDown={guard(onItalic)}>
        <Italic size={14} />
      </button>
      <button type="button" title="Strikethrough" onMouseDown={guard(onStrike)}>
        <Strikethrough size={14} />
      </button>
      <button type="button" title="Inline code (⌘E)" onMouseDown={guard(onCode)}>
        <Code size={14} />
      </button>
      <button type="button" title="Link" onMouseDown={guard(onLink)}>
        <Link2 size={14} />
      </button>
    </div>
  );
};
