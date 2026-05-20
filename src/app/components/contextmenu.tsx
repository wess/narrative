import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Columns2,
  CopyPlus,
  Download,
  FilePlus2,
  FolderPlus,
  LayoutTemplate,
  Link2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NodeKind } from "../../shared/types.ts";
import { type CtxItem, closeMenu, separator, useContextMenu } from "../lib/contextmenu.ts";
import { actions } from "../state/actions.ts";

const MenuList = ({
  items,
  x,
  y,
  onClose,
}: {
  items: readonly CtxItem[];
  x: number;
  y: number;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [subPos, setSubPos] = useState({ x: 0, y: 0 });

  // Keep the menu inside the viewport once its size is known.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx =
      x + rect.width > window.innerWidth - 8 ? Math.max(8, window.innerWidth - rect.width - 8) : x;
    const ny =
      y + rect.height > window.innerHeight - 8
        ? Math.max(8, window.innerHeight - rect.height - 8)
        : y;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  return (
    <div ref={ref} className="ctx-menu" style={{ left: pos.x, top: pos.y }}>
      {items.map((entry, i) => {
        if (entry.kind === "separator") {
          // biome-ignore lint/suspicious/noArrayIndexKey: static menu, never reordered
          return <div key={`sep-${i}`} className="ctx-sep" />;
        }
        const hasSub = entry.submenu !== undefined && entry.submenu.length > 0;
        return (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: static menu, never reordered
            key={`item-${i}`}
            type="button"
            className="ctx-item"
            data-danger={entry.danger ? "true" : undefined}
            disabled={entry.disabled}
            onMouseEnter={(e) => {
              if (hasSub) {
                const rect = e.currentTarget.getBoundingClientRect();
                setSubPos({ x: rect.right - 4, y: rect.top - 5 });
                setOpenSub(i);
              } else {
                setOpenSub(null);
              }
            }}
            onClick={() => {
              if (hasSub) return;
              entry.onSelect?.();
              onClose();
            }}
          >
            <span className="ctx-icon">{entry.icon ?? null}</span>
            <span className="ctx-label">{entry.label}</span>
            {entry.shortcut ? <span className="ctx-shortcut">{entry.shortcut}</span> : null}
            {hasSub ? <ChevronRight size={13} className="ctx-arrow" /> : null}
          </button>
        );
      })}
      {(() => {
        if (openSub === null) return null;
        const parent = items[openSub];
        if (!parent || parent.kind !== "item" || !parent.submenu) return null;
        return <MenuList items={parent.submenu} x={subPos.x} y={subPos.y} onClose={onClose} />;
      })()}
    </div>
  );
};

export const ContextMenuHost = () => {
  const menu = useContextMenu();

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".ctx-menu")) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    const onScroll = () => closeMenu();
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("contextmenu", onPointerDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", closeMenu);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("contextmenu", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", closeMenu);
    };
  }, [menu]);

  if (!menu) return null;
  return <MenuList items={menu.items} x={menu.x} y={menu.y} onClose={closeMenu} />;
};

// Shared right-click menu for a vault node — works for both folders and
// files (sidebar tree, pinned list, search hits…). Folders get a short
// container menu; files get the full page menu.
export const buildPageMenu = (node: {
  id: number;
  title: string;
  kind: NodeKind;
  parentId?: number | null;
  pinned?: boolean;
  archived?: boolean;
  isTemplate?: boolean;
}): CtxItem[] => {
  if (node.kind === "folder") {
    return [
      {
        kind: "item",
        label: "New page",
        icon: <Plus size={14} />,
        onSelect: () => void actions.createPage(node.id),
      },
      {
        kind: "item",
        label: "New folder",
        icon: <FolderPlus size={14} />,
        onSelect: () => void actions.createFolder(node.id),
      },
      separator,
      {
        kind: "item",
        label: "Rename",
        icon: <Pencil size={14} />,
        onSelect: () => actions.startRename(node.id),
      },
      {
        kind: "item",
        label: "Delete folder",
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => void actions.deletePage(node.id),
      },
    ];
  }

  // A file's "new page" lands beside it, in the same folder.
  const siblingParent = node.parentId ?? null;
  return [
    {
      kind: "item",
      label: "New page",
      icon: <Plus size={14} />,
      onSelect: () => void actions.createPage(siblingParent),
    },
    {
      kind: "item",
      label: "Open in split view",
      icon: <Columns2 size={14} />,
      onSelect: () => actions.setSplit(node.id),
    },
    {
      kind: "item",
      label: "Duplicate",
      icon: <CopyPlus size={14} />,
      onSelect: () => void actions.duplicatePage(node.id),
    },
    separator,
    {
      kind: "item",
      label: node.pinned ? "Unpin" : "Pin",
      icon: node.pinned ? <PinOff size={14} /> : <Pin size={14} />,
      onSelect: () => void actions.togglePin(node.id, !node.pinned),
    },
    node.isTemplate
      ? {
          kind: "item",
          label: "New page from template",
          icon: <FilePlus2 size={14} />,
          onSelect: () => void actions.newFromTemplate(node.id),
        }
      : {
          kind: "item",
          label: "Save as template",
          icon: <LayoutTemplate size={14} />,
          onSelect: () => void actions.toggleTemplate(node.id, true),
        },
    {
      kind: "item",
      label: "Copy link",
      icon: <Link2 size={14} />,
      onSelect: () => void actions.copyLink(node.title),
    },
    {
      kind: "item",
      label: "Rename",
      icon: <Pencil size={14} />,
      onSelect: () => actions.startRename(node.id),
    },
    {
      kind: "item",
      label: "Export…",
      icon: <Download size={14} />,
      shortcut: "⌘E",
      onSelect: () => void actions.exportPageById(node.id),
    },
    separator,
    {
      kind: "item",
      label: node.archived ? "Restore" : "Move to archive",
      icon: node.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />,
      onSelect: () => void actions.archivePage(node.id, !node.archived),
    },
    {
      kind: "item",
      label: "Delete",
      icon: <Trash2 size={14} />,
      danger: true,
      onSelect: () => void actions.deletePage(node.id),
    },
  ];
};
