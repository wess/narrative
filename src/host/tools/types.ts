// Internal tool types. A tool is a single named action an agent can call,
// wrapping a host capability (vault CRUD, search, navigation). The public
// shape — `name`, `description`, `usage` — flows out over `tools:list` so
// the webview and the system prompt see the same surface.

import type { Provider } from "@basket/ai";
import type { OpenVault } from "../vault/types.ts";

export type ToolContext = {
  readonly vault: OpenVault;
  readonly provider: Provider | null; // null when the user hasn't configured a key
  readonly requestId: string;
  readonly emitFocus: (pageId: number) => void;
  readonly projectWrite: boolean;
};

export type Tool = {
  readonly name: string;
  readonly description: string;
  readonly usage: string; // human-facing JSON-shape hint for the system prompt
  readonly run: (ctx: ToolContext, args: unknown) => Promise<unknown>;
};

// Parse helpers reused across tools — the model occasionally serialises an
// integer as a string ("12") or omits an optional field; pull it out safely.
export const asObject = (args: unknown): Record<string, unknown> =>
  args && typeof args === "object" ? (args as Record<string, unknown>) : {};

export const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export const asBool = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
};
