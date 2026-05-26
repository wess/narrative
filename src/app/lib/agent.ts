// Webview-side helpers for rendering agent chat. Mirrors the host's
// `protocol.ts` strip — the chat shows just the prose, since tool calls
// already render as their own cards.

const TOOL_RE = /<tool\s+name=["'][^"']+["']\s*>[\s\S]*?<\/tool>/g;
const TOOL_RESULT_RE = /<tool-result\s+name=["'][^"']+["']\s*>[\s\S]*?<\/tool-result>/g;

export const stripChatToolBlocks = (text: string): string =>
  text.replace(TOOL_RE, "").replace(TOOL_RESULT_RE, "").trim();
