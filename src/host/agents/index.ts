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
  createHarnessScenario,
  listHarnessRuns,
  listHarnessScenarios,
  recordHarnessRun,
} from "./harness.ts";
export {
  buildKanbanPrompt,
  createKanbanCard,
  deleteKanbanCard,
  listKanbanBoard,
  moveKanbanCard,
  updateKanbanCard,
} from "./kanban.ts";
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
  analyzeProject,
  cancelProjectRun,
  changedProjectFiles,
  createProject,
  decideProjectWriteProposal,
  deleteProject,
  diffProjectFile,
  getProject,
  listProjectRuns,
  listProjects,
  listProjectWriteProposals,
  projectTree,
  proposeProjectWrite,
  readProjectFile,
  setProjectApprovedCommands,
  setProjectPermissions,
  suggestChannelForProject,
} from "./project.ts";
export { extractToolCalls, formatToolPrompt, stripToolBlocks } from "./protocol.ts";
export type { RunAgentOptions } from "./run.ts";
export { runAgent } from "./run.ts";
export { listAgentRuns, recordAgentRun } from "./timeline.ts";
export { listChannelMessages, recordChannelMessage } from "./transcript.ts";
export {
  createWorkflow,
  deleteWorkflow,
  listWorkflowRuns,
  listWorkflows,
  runWorkflow,
  updateWorkflow,
} from "./workflow.ts";
