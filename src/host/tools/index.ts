// The vault tool registry — single source of truth for every action an
// agent can invoke. Tools are pure functions over `ToolContext`; the
// registry's only job is to look one up by name, filtered through an
// allowlist when an agent declares `tools: [...]`.

import type { AgentToolDef } from "../../shared/types.ts";
import { tools as pageTools } from "./page.ts";
import type { Tool, ToolContext } from "./types.ts";
import { tools as vaultTools } from "./vault.ts";

const registry: Map<string, Tool> = new Map();
for (const t of [...vaultTools, ...pageTools]) registry.set(t.name, t);

export const allTools = (): Tool[] => Array.from(registry.values());

export const findTool = (name: string): Tool | null => registry.get(name) ?? null;

// Resolve an agent's allowlist to actual tools, dropping unknown names.
export const resolveTools = (allow: readonly string[]): Tool[] => {
  if (allow.length === 0) return allTools();
  const out: Tool[] = [];
  for (const name of allow) {
    const tool = registry.get(name);
    if (tool) out.push(tool);
  }
  return out;
};

export const toolDef = (tool: Tool): AgentToolDef => ({
  name: tool.name,
  description: tool.description,
  usage: tool.usage,
});

export const listToolDefs = (): AgentToolDef[] => allTools().map(toolDef);

export type { Tool, ToolContext };
