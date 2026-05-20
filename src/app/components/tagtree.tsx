import { ChevronRight, Hash } from "lucide-react";
import { useState } from "react";
import type { TagNode } from "../lib/tags.ts";

type Props = {
  node: TagNode;
  activeTag: string | null;
  onPick: (tag: string) => void;
  depth: number;
};

const TagTreeNode = ({ node, activeTag, onPick, depth }: Props) => {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className="tagtree-row"
        data-active={node.name === activeTag}
        style={{ paddingLeft: `${depth * 13}px` }}
      >
        <button
          type="button"
          className="tagtree-chevron"
          data-has={hasChildren}
          onClick={() => setOpen((v) => !v)}
        >
          {hasChildren ? (
            <ChevronRight size={11} style={{ transform: open ? "rotate(90deg)" : "none" }} />
          ) : null}
        </button>
        <button type="button" className="tagtree-label" onClick={() => onPick(node.name)}>
          <Hash size={11} />
          <span className="tagtree-name">{node.label}</span>
          <span className="tagtree-count">{node.total}</span>
        </button>
      </div>
      {hasChildren && open
        ? node.children.map((child) => (
            <TagTreeNode
              key={child.name}
              node={child}
              activeTag={activeTag}
              onPick={onPick}
              depth={depth + 1}
            />
          ))
        : null}
    </>
  );
};

export const TagTree = ({
  nodes,
  activeTag = null,
  onPick,
}: {
  nodes: readonly TagNode[];
  activeTag?: string | null;
  onPick: (tag: string) => void;
}) => (
  <div className="tag-tree">
    {nodes.map((node) => (
      <TagTreeNode key={node.name} node={node} activeTag={activeTag} onPick={onPick} depth={0} />
    ))}
  </div>
);
