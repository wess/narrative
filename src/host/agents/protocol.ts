// The tool-call wire format. `@basket/ai` is text-only, so agents call tools
// by emitting fenced XML-like blocks in chat. The host parses them out of
// each assistant turn, runs them, and replies with `<tool-result>` blocks
// the model can read on its next pass.
//
// We chose XML-style tags over JSON because every Claude/OpenAI/Llama-class
// model emits them reliably and they read cleanly when stripped from the UI.

import type { Tool } from "../tools/index.ts";

export type ParsedCall = {
  readonly name: string;
  readonly args: unknown; // the JSON payload, or {} if absent/invalid
  readonly raw: string; // the entire `<tool>…</tool>` substring (for stripping)
};

const TOOL_RE = /<tool\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/tool>/g;

const tryJson = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (trimmed === "") return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    // The model occasionally wraps JSON in a code fence — peel it.
    const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        /* fall through */
      }
    }
    return { _raw: trimmed };
  }
};

export const extractToolCalls = (text: string): ParsedCall[] => {
  const calls: ParsedCall[] = [];
  TOOL_RE.lastIndex = 0;
  for (const m of text.matchAll(TOOL_RE)) {
    const name = (m[1] ?? "").trim();
    if (!name) continue;
    calls.push({ name, args: tryJson(m[2] ?? ""), raw: m[0] });
  }
  return calls;
};

// Remove every `<tool>` block from a chunk of assistant text — used when the
// webview wants to render the model's prose without the raw call markup.
export const stripToolBlocks = (text: string): string => text.replace(TOOL_RE, "").trim();

export const formatToolResult = (name: string, output: unknown): string => {
  const json = JSON.stringify(output, null, 2);
  return `<tool-result name="${name}">\n${json}\n</tool-result>`;
};

// Build the appendix the runner glues onto every agent system prompt. Lists
// the available tools and spells out the call format so the model emits it
// in the exact shape the parser recognises.
export const formatToolPrompt = (tools: readonly Tool[]): string => {
  if (tools.length === 0) return "";
  const catalog = tools.map((t) => `- ${t.name} — ${t.description}\n  args: ${t.usage}`).join("\n");
  return `You have access to vault tools that read and edit the user's Narrative knowledge base.

To call a tool, emit a block exactly like this — nothing else on those lines:

<tool name="vault.search">
{"query": "design notes"}
</tool>

After you emit one or more <tool> blocks, stop. The host will run them and
reply with the results as <tool-result> blocks. You can then call more
tools, or write the final answer in plain prose.

Tools:
${catalog}

Rules:
- Use exact tool names from the list above.
- Always wrap the JSON arguments inside <tool name="…"> … </tool> tags.
- Do not emit a <tool> block in your final user-facing answer.
- Prefer reading pages (vault.read) and searching (vault.search) before writing.
- Cite page titles in your final answer when you used them as sources.`;
};
