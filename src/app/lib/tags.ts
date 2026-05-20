import type { TagCount } from "../../shared/types.ts";

// A node in the hierarchical tag tree. `#project/narrative` nests
// `narrative` under `project`.
export type TagNode = {
  readonly name: string; // full path, e.g. "project/narrative"
  readonly label: string; // last segment, e.g. "narrative"
  count: number; // pages tagged exactly with `name`
  total: number; // pages tagged with `name` or anything beneath it
  readonly children: TagNode[];
};

export const buildTagTree = (tags: readonly TagCount[]): TagNode[] => {
  const roots: TagNode[] = [];

  const childOf = (siblings: TagNode[], label: string, fullPath: string): TagNode => {
    let node = siblings.find((c) => c.label === label);
    if (!node) {
      node = { name: fullPath, label, count: 0, total: 0, children: [] };
      siblings.push(node);
    }
    return node;
  };

  for (const { tag, count } of tags) {
    const segments = tag.split("/").filter(Boolean);
    let siblings = roots;
    let path = "";
    segments.forEach((segment, idx) => {
      path = path ? `${path}/${segment}` : segment;
      const node = childOf(siblings, segment, path);
      node.total += count;
      if (idx === segments.length - 1) node.count += count;
      siblings = node.children;
    });
  }

  const sortTree = (nodes: TagNode[]) => {
    nodes.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
    for (const n of nodes) sortTree(n.children);
  };
  sortTree(roots);
  return roots;
};
