// Public surface for the agent IDE subsystem. Combines the on-disk loader
// (parse + read + write under `.narrative/agents` and `.narrative/commands`)
// with the streaming run loop.

export {
  createAgent,
  createCommand,
  deleteAgent,
  deleteCommand,
  listAgents,
  listCommands,
  readAgentSource,
  readCommandSource,
  saveAgent,
  saveCommand,
} from "./load.ts";
export { extractToolCalls, formatToolPrompt, stripToolBlocks } from "./protocol.ts";
export type { RunAgentOptions } from "./run.ts";
export { runAgent } from "./run.ts";
