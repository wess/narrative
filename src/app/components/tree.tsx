// The vault file tree. With the file-backed vault the tree has two kinds of
// node: real folders (expand/collapse only — not editable pages) and `.md`
// files (open in the editor). Renaming happens inline; drag-and-drop maps to
// real moves on disk.

import { ChevronRight, Folder, FolderOpen, Plus } from "lucide-react";
import { type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { TreeNode } from "../../shared/types.ts";
import { openMenu } from "../lib/contextmenu.ts";
import { type DropPosition, resolveDrop } from "../lib/tree.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";
import { buildPageMenu } from "./contextmenu.tsx";
import { PageIcon } from "./icon.tsx";

export const Tree = ({ nodes, depth = 0 }: { nodes: readonly TreeNode[]; depth?: number }) => (
  <ul className="tree">
    {nodes.map((node) => (
      <TreeRow key={node.id} node={node} depth={depth} />
    ))}
  </ul>
);

const TreeRow = ({ node, depth }: { node: TreeNode; depth: number }) => {
  const { expanded, activeId, tree, renamingId } = useApp();
  const isFolder = node.kind === "folder";
  const isOpen = expanded.includes(node.id);
  const isActive = node.id === activeId;
  const isRenaming = renamingId === node.id;
  const [drop, setDrop] = useState<DropPosition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      cancelledRef.current = false;
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("text/page", String(node.id));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const third = rect.height / 3;
    setDrop(y < third ? "before" : y > third * 2 ? "after" : "child");
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dragId = Number(e.dataTransfer.getData("text/page"));
    const position = drop;
    setDrop(null);
    if (!Number.isFinite(dragId) || !position) return;
    const move = resolveDrop(tree, dragId, node.id, position);
    if (move) void actions.movePage(dragId, move.parentId, move.sortKey);
  };

  const commitRename = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    void actions.finishRename(node.id, inputRef.current?.value ?? "");
  };

  const onRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelledRef.current = true;
      actions.cancelRename();
    }
  };

  return (
    <li>
      <div
        className="tree-row"
        role="treeitem"
        tabIndex={isRenaming ? -1 : 0}
        aria-selected={isActive}
        aria-expanded={isFolder ? isOpen : undefined}
        data-active={isActive}
        data-folder={isFolder}
        data-drop={drop ?? undefined}
        style={{ paddingLeft: `${depth * 13 + 6}px` }}
        draggable={!isRenaming}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onClick={() => {
          if (!isRenaming) void actions.openPage(node.id);
        }}
        onKeyDown={(e) => {
          if (!isRenaming && e.key === "Enter") {
            e.preventDefault();
            void actions.openPage(node.id);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openMenu(e.clientX, e.clientY, buildPageMenu(node));
        }}
      >
        <button
          type="button"
          className="tree-chevron"
          data-has={isFolder}
          onClick={(e) => {
            e.stopPropagation();
            if (isFolder) actions.toggleExpanded(node.id);
          }}
        >
          {isFolder ? (
            <ChevronRight size={13} style={{ transform: isOpen ? "rotate(90deg)" : "none" }} />
          ) : null}
        </button>

        {isFolder ? (
          isOpen ? (
            <FolderOpen size={15} className="tree-folder-icon" />
          ) : (
            <Folder size={15} className="tree-folder-icon" />
          )
        ) : (
          <PageIcon icon={node.icon} size={15} />
        )}

        {isRenaming ? (
          <input
            ref={inputRef}
            className="tree-rename"
            defaultValue={node.title}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onRenameKey}
            onBlur={commitRename}
          />
        ) : (
          <span className="tree-title">{node.title || "Untitled"}</span>
        )}

        {isFolder && !isRenaming ? (
          <span className="tree-row-actions">
            <button
              type="button"
              title="New page"
              onClick={(e) => {
                e.stopPropagation();
                void actions.createPage(node.id);
              }}
            >
              <Plus size={13} />
            </button>
          </span>
        ) : null}
      </div>
      {isFolder && isOpen && node.children.length > 0 ? (
        <Tree nodes={node.children} depth={depth + 1} />
      ) : null}
    </li>
  );
};
