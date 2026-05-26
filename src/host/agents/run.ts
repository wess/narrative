// The agentic loop. Streams a turn, parses any <tool> blocks, runs them,
// feeds the results back as the next user turn, and repeats until the
// assistant produces no more tool calls (or we hit MAX_TURNS).
//
// Tool calls are streamed to the webview as `aiToolCall` events so the chat
// can render them as live cards next to the assistant message. The raw
// `<tool>` markup also lands in the text stream — the webview strips it
// from rendered markdown so only prose is visible.

import type { Provider } from "@basket/ai";
import { emit } from "@basket/ipc";
import * as ch from "../../shared/channels.ts";
import type { AgentDef, AiResult, ChatMessage, ToolCall } from "../../shared/types.ts";
import type { ToolContext } from "../tools/index.ts";
import { findTool, resolveTools } from "../tools/index.ts";
import { extractToolCalls, formatToolPrompt, formatToolResult } from "./protocol.ts";

const MAX_TURNS = 8;

export type RunAgentOptions = {
  readonly provider: Provider;
  readonly ctx: ToolContext;
  readonly agent: AgentDef;
  readonly messages: readonly ChatMessage[];
  readonly contextSystem: string; // page/RAG context injected by the caller
  readonly signal: AbortSignal;
};

let counter = 0;
const newCallId = (): string => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export const runAgent = async (opts: RunAgentOptions): Promise<AiResult> => {
  const allowed = resolveTools(opts.agent.tools);
  const systemPrompt = [opts.agent.systemPrompt, formatToolPrompt(allowed), opts.contextSystem]
    .filter((p) => p && p.length > 0)
    .join("\n\n");

  const transcript: ChatMessage[] = [...opts.messages];
  const allCalls: ToolCall[] = [];
  let fullOut = "";

  const emitTool = (call: ToolCall) => emit(ch.aiToolCall, { requestId: opts.ctx.requestId, call });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let turnText = "";
    try {
      for await (const chunk of opts.provider.chatStream({
        messages: transcript.map((m) => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        signal: opts.signal,
      })) {
        if (chunk.delta) {
          turnText += chunk.delta;
          emit(ch.aiChunk, {
            requestId: opts.ctx.requestId,
            delta: chunk.delta,
            done: false,
          });
        }
        if (chunk.done) break;
      }
    } catch (e) {
      emit(ch.aiChunk, { requestId: opts.ctx.requestId, delta: "", done: true });
      return {
        ok: false,
        content: fullOut + turnText,
        error: (e as Error).message,
        toolCalls: allCalls,
      };
    }
    fullOut += turnText;

    const requested = extractToolCalls(turnText);
    if (requested.length === 0) break;

    // Echo the assistant's tool requests back into the transcript so the
    // model sees the conversation in correct shape next iteration.
    transcript.push({ role: "assistant", content: turnText });

    const resultBlocks: string[] = [];
    for (const req of requested) {
      const id = newCallId();
      const pending: ToolCall = {
        id,
        name: req.name,
        args: req.args,
        status: "pending",
      };
      emitTool(pending);

      const tool = findTool(req.name);
      if (!tool) {
        const error = `Unknown tool: ${req.name}`;
        const final: ToolCall = { id, name: req.name, args: req.args, status: "error", error };
        allCalls.push(final);
        emitTool(final);
        resultBlocks.push(formatToolResult(req.name, { error }));
        continue;
      }

      try {
        const output = await tool.run(opts.ctx, req.args);
        const final: ToolCall = {
          id,
          name: req.name,
          args: req.args,
          status: "ok",
          result: output,
        };
        allCalls.push(final);
        emitTool(final);
        resultBlocks.push(formatToolResult(req.name, output));
      } catch (e) {
        const error = (e as Error).message;
        const final: ToolCall = { id, name: req.name, args: req.args, status: "error", error };
        allCalls.push(final);
        emitTool(final);
        resultBlocks.push(formatToolResult(req.name, { error }));
      }
    }

    transcript.push({ role: "user", content: resultBlocks.join("\n\n") });
  }

  emit(ch.aiChunk, { requestId: opts.ctx.requestId, delta: "", done: true });
  return { ok: true, content: fullOut, toolCalls: allCalls };
};
