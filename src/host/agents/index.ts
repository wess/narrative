// Public surface for the agent IDE subsystem. Combines the on-disk loader
// (parse + read + write under `.narrative/agents` and `.narrative/commands`)
// with the streaming run loop.

export {
  createChannel,
  deleteChannel,
  listChannels,
  readChannelSource,
  saveChannel,
} from "./channel.ts";
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
export type { SuggestedChannelResult } from "./project.ts";
export {
  createProject,
  deleteProject,
  listProjects,
  suggestChannelForProject,
} from "./project.ts";
export { extractToolCalls, formatToolPrompt, stripToolBlocks } from "./protocol.ts";
export type { RunAgentOptions } from "./run.ts";
export { runAgent } from "./run.ts";
