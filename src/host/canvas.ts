import type { DB } from "@basket/db";
import type { CanvasEdge, CanvasNode, CanvasView, PropertySubjectType } from "../shared/types.ts";
import { openAgentStore } from "./agents/store.ts";
import type { NodeRow } from "./schema.ts";
import type { OpenVault } from "./vault/types.ts";

type CanvasNodeRow = {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly updatedAt: string;
};

type CanvasEdgeRow = {
  readonly id: string;
  readonly fromNode: string;
  readonly toNode: string;
  readonly label: string;
};

type AgentRow = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
};

type ChannelRow = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly agents: string;
  readonly projects: string;
};

type ProjectRow = {
  readonly slug: string;
  readonly name: string;
  readonly path: string;
};

type WorkflowRow = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly projectSlug: string | null;
  readonly channelSlug: string | null;
};

type SeedNode = {
  readonly id: string;
  readonly subjectType: PropertySubjectType;
  readonly subjectId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly x: number;
  readonly y: number;
};

const decodeList = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const nodeId = (type: PropertySubjectType, id: string | number): string => `${type}:${id}`;

const gridNode = (
  index: number,
  type: PropertySubjectType,
  id: string | number,
  title: string,
  subtitle: string,
): SeedNode => ({
  id: nodeId(type, id),
  subjectType: type,
  subjectId: String(id),
  title,
  subtitle,
  x: 40 + (index % 4) * 240,
  y: 40 + Math.floor(index / 4) * 132,
});

const seedNodes = (vaultDb: DB, store: DB): SeedNode[] => {
  const nodes: SeedNode[] = [];
  const pages = vaultDb.query<NodeRow>(
    "SELECT * FROM nodes WHERE kind = 'file' AND archived = 0 ORDER BY updatedAt DESC LIMIT 24",
  );
  for (const page of pages) {
    nodes.push(gridNode(nodes.length, "page", page.id, page.title, page.path));
  }
  for (const project of store.query<ProjectRow>("SELECT * FROM projects ORDER BY name")) {
    nodes.push(gridNode(nodes.length, "project", project.slug, project.name, project.path));
  }
  for (const channel of store.query<ChannelRow>("SELECT * FROM channels ORDER BY name")) {
    nodes.push(gridNode(nodes.length, "channel", channel.slug, channel.name, channel.description));
  }
  for (const agent of store.query<AgentRow>("SELECT * FROM agents ORDER BY name")) {
    nodes.push(gridNode(nodes.length, "agent", agent.slug, agent.name, agent.description));
  }
  for (const workflow of store.query<WorkflowRow>("SELECT * FROM workflows ORDER BY name")) {
    nodes.push(
      gridNode(nodes.length, "workflow", workflow.slug, workflow.name, workflow.description),
    );
  }
  return nodes;
};

const upsertNodes = (store: DB, nodes: readonly SeedNode[]): void => {
  const stamp = new Date().toISOString();
  const current = new Set(nodes.map((node) => node.id));
  for (const row of store.query<{ id: string }>("SELECT id FROM canvasNodes")) {
    if (!current.has(row.id)) store.exec("DELETE FROM canvasNodes WHERE id = ?", row.id);
  }
  for (const node of nodes) {
    store.exec(
      `INSERT OR IGNORE INTO canvasNodes
        (id, subjectType, subjectId, title, subtitle, x, y, width, height, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      node.id,
      node.subjectType,
      node.subjectId,
      node.title,
      node.subtitle,
      node.x,
      node.y,
      190,
      92,
      stamp,
    );
    store.exec(
      "UPDATE canvasNodes SET title = ?, subtitle = ?, updatedAt = ? WHERE id = ?",
      node.title,
      node.subtitle,
      stamp,
      node.id,
    );
  }
};

const rebuildEdges = (store: DB): void => {
  store.exec("DELETE FROM canvasEdges");
  const existing = new Set(
    store.query<{ id: string }>("SELECT id FROM canvasNodes").map((row) => row.id),
  );
  const stamp = new Date().toISOString();
  for (const channel of store.query<ChannelRow>("SELECT * FROM channels ORDER BY name")) {
    const channelNode = nodeId("channel", channel.slug);
    if (!existing.has(channelNode)) continue;
    for (const agent of decodeList(channel.agents)) {
      const agentNode = nodeId("agent", agent);
      if (!existing.has(agentNode)) continue;
      const id = `${channelNode}->${agentNode}`;
      store.exec(
        "INSERT INTO canvasEdges (id, fromNode, toNode, label, updatedAt) VALUES (?, ?, ?, ?, ?)",
        id,
        channelNode,
        agentNode,
        "member",
        stamp,
      );
    }
    for (const project of decodeList(channel.projects)) {
      const projectNode = nodeId("project", project);
      if (!existing.has(projectNode)) continue;
      const id = `${channelNode}->${projectNode}`;
      store.exec(
        "INSERT INTO canvasEdges (id, fromNode, toNode, label, updatedAt) VALUES (?, ?, ?, ?, ?)",
        id,
        channelNode,
        projectNode,
        "project",
        stamp,
      );
    }
  }
  for (const workflow of store.query<WorkflowRow>("SELECT * FROM workflows ORDER BY name")) {
    const workflowNode = nodeId("workflow", workflow.slug);
    if (!existing.has(workflowNode)) continue;
    if (workflow.channelSlug) {
      const channelNode = nodeId("channel", workflow.channelSlug);
      if (existing.has(channelNode)) {
        store.exec(
          "INSERT INTO canvasEdges (id, fromNode, toNode, label, updatedAt) VALUES (?, ?, ?, ?, ?)",
          `${workflowNode}->${channelNode}`,
          workflowNode,
          channelNode,
          "channel",
          stamp,
        );
      }
    }
    if (workflow.projectSlug) {
      const projectNode = nodeId("project", workflow.projectSlug);
      if (existing.has(projectNode)) {
        store.exec(
          "INSERT INTO canvasEdges (id, fromNode, toNode, label, updatedAt) VALUES (?, ?, ?, ?, ?)",
          `${workflowNode}->${projectNode}`,
          workflowNode,
          projectNode,
          "project",
          stamp,
        );
      }
    }
  }
};

const seedToCanvasNode = (node: SeedNode): CanvasNode => ({
  id: node.id,
  subjectType: node.subjectType,
  subjectId: node.subjectId,
  title: node.title,
  subtitle: node.subtitle,
  x: node.x,
  y: node.y,
  width: 190,
  height: 92,
});

const readCanvas = (store: DB, availableNodes: readonly SeedNode[]): CanvasView => {
  const nodes = store
    .query<CanvasNodeRow>("SELECT * FROM canvasNodes ORDER BY y, x")
    .map<CanvasNode>((row) => ({
      id: row.id,
      subjectType: row.subjectType as PropertySubjectType,
      subjectId: row.subjectId,
      title: row.title,
      subtitle: row.subtitle,
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
    }));
  const edges = store
    .query<CanvasEdgeRow>("SELECT * FROM canvasEdges ORDER BY id")
    .map<CanvasEdge>((row) => ({
      id: row.id,
      from: row.fromNode,
      to: row.toNode,
      label: row.label,
    }));
  return {
    nodes,
    edges,
    availableNodes: availableNodes.map(seedToCanvasNode),
    updatedAt: new Date().toISOString(),
  };
};

export const buildCanvasView = async (vault: OpenVault): Promise<CanvasView> => {
  const store = await openAgentStore(vault.root);
  const seeded = seedNodes(vault.db, store);
  const hidden = new Set(
    store.query<{ id: string }>("SELECT id FROM canvasHiddenNodes").map((row) => row.id),
  );
  const visible = seeded.filter((node) => !hidden.has(node.id));
  const available = seeded.filter((node) => hidden.has(node.id));
  upsertNodes(store, visible);
  rebuildEdges(store);
  return readCanvas(store, available);
};

export const moveCanvasNode = async (
  vault: OpenVault,
  id: string,
  x: number,
  y: number,
): Promise<CanvasView> => {
  const store = await openAgentStore(vault.root);
  store.exec(
    "UPDATE canvasNodes SET x = ?, y = ?, updatedAt = ? WHERE id = ?",
    Math.round(x),
    Math.round(y),
    new Date().toISOString(),
    id,
  );
  return buildCanvasView(vault);
};

export const addCanvasNode = async (vault: OpenVault, id: string): Promise<CanvasView> => {
  const store = await openAgentStore(vault.root);
  store.exec("DELETE FROM canvasHiddenNodes WHERE id = ?", id);
  return buildCanvasView(vault);
};

export const removeCanvasNode = async (vault: OpenVault, id: string): Promise<CanvasView> => {
  const store = await openAgentStore(vault.root);
  store.exec(
    "INSERT OR REPLACE INTO canvasHiddenNodes (id, hiddenAt) VALUES (?, ?)",
    id,
    new Date().toISOString(),
  );
  store.exec("DELETE FROM canvasNodes WHERE id = ?", id);
  store.exec("DELETE FROM canvasEdges WHERE fromNode = ? OR toNode = ?", id, id);
  return buildCanvasView(vault);
};
