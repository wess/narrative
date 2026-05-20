import type { TreeNode } from "../../shared/types.ts";

// Depth-first flatten of the page hierarchy.
export const flattenTree = (nodes: readonly TreeNode[]): TreeNode[] => {
  const out: TreeNode[] = [];
  const walk = (list: readonly TreeNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
};

export const findNode = (nodes: readonly TreeNode[], id: number): TreeNode | undefined =>
  flattenTree(nodes).find((n) => n.id === id);

export const descendantIds = (node: TreeNode): Set<number> => {
  const ids = new Set<number>();
  const walk = (n: TreeNode) => {
    for (const c of n.children) {
      ids.add(c.id);
      walk(c);
    }
  };
  walk(node);
  return ids;
};

export const siblingsOf = (
  tree: readonly TreeNode[],
  parentId: number | null,
): readonly TreeNode[] => {
  if (parentId === null) return tree;
  return findNode(tree, parentId)?.children ?? [];
};

export type DropPosition = "before" | "after" | "child";

// Translate a drag-and-drop gesture into a concrete `{ parentId, sortKey }`,
// or `null` when the move is illegal (onto itself or into its own subtree).
export const resolveDrop = (
  tree: readonly TreeNode[],
  dragId: number,
  targetId: number,
  position: DropPosition,
): { parentId: number | null; sortKey: number } | null => {
  if (dragId === targetId) return null;
  const dragNode = findNode(tree, dragId);
  const target = findNode(tree, targetId);
  if (!dragNode || !target) return null;
  if (descendantIds(dragNode).has(targetId)) return null;

  if (position === "child") {
    const max = target.children.reduce((m, k) => Math.max(m, k.sortKey), 0);
    return { parentId: target.id, sortKey: max + 1 };
  }

  const parentId = target.parentId;
  const siblings = siblingsOf(tree, parentId).filter((s) => s.id !== dragId);
  const idx = siblings.findIndex((s) => s.id === targetId);
  if (idx < 0) return { parentId, sortKey: Date.now() };

  if (position === "before") {
    const prev = siblings[idx - 1];
    const lo = prev ? prev.sortKey : target.sortKey - 2;
    return { parentId, sortKey: (lo + target.sortKey) / 2 };
  }
  const next = siblings[idx + 1];
  const hi = next ? next.sortKey : target.sortKey + 2;
  return { parentId, sortKey: (target.sortKey + hi) / 2 };
};
