# Course 7 — Projects and Real Work Folders

Goal: connect Bethink to real project folders while keeping control over what
agents can read, change, and run.

## Lesson 1: What a project is

A project is a local folder registered inside Bethink. It can be a codebase,
writing project, research folder, design folder, or any workspace where files
matter.

Projects are not channels. They solve different problems:

| Concept | Meaning |
|---|---|
| Project | A folder on disk. |
| Channel | A conversation/work room. |
| Agent | A role that can help. |

A channel can link to a project so agents have a room for project work.

## Lesson 2: Add a project folder

From the sidebar:

1. Open **Projects**.
2. Choose the `+` action.
3. Pick a folder.
4. Inspect the file tree.
5. Open the Project Inspector.

Bethink analyzes the folder for common files, package managers, scripts, and
safe commands.

## Lesson 3: Understand permissions

Project permissions are explicit.

| Permission | What it allows |
|---|---|
| Read files | Agents and MCP clients can inspect project files. |
| Write files | Agents can write or propose changes when the global setting allows it. |
| Run commands | Agents can run approved commands. |

Keep write and run permissions off until you trust the workflow.

## Lesson 4: Understand approved commands

Bethink separates detected safe commands from approved commands.

- **Detected safe commands** are scripts that look like test, check, lint,
  type, format, build, or verify commands.
- **Approved commands** are the commands agents are allowed to run.

Agents cannot run arbitrary commands just because command execution is enabled.
This is intentional. It keeps project automation useful without making it
reckless.

Examples of commands that usually make sense:

- `bun run test`
- `bun run check`
- `bun run typecheck`
- `bun run build`

Examples to keep out of agent runs unless you explicitly trust the workflow:

- Deploy scripts.
- Publish scripts.
- Database migrations.
- Destructive cleanup commands.
- Commands requiring secrets.

## Lesson 5: Use proposed changes first

For most workflows, prefer proposed file changes over direct writes.

Proposed-change workflow:

1. Agent reads project context.
2. Agent proposes a file change.
3. You inspect the review queue.
4. You approve or reject.
5. Bethink keeps a before/after snapshot.

Direct writes are faster, but proposals are safer while you are still building
trust.

## Lesson 6: Suggest a channel

For a project folder, Bethink can suggest a channel/team. Use this when:

- The folder is new to Bethink.
- You want multiple agent roles.
- You want channel memory tied to the project.
- You want a project-specific transcript.

A useful suggested team often includes:

- Architect: plans and explains structure.
- Builder: proposes or makes focused changes.
- Reviewer: checks bugs, tests, and regression risk.

## Lesson 7: Debug project work

When project work goes wrong, inspect in this order:

1. Project permissions.
2. Approved commands.
3. Review queue.
4. Changed files.
5. Command runs.
6. Agent run history.
7. Channel memory.

Do not start by rewriting the agent prompt. Most failures are permission,
context, or command-surface problems.

## Exercises

1. Add a harmless project folder.
2. Inspect the file tree.
3. Open Project Inspector and review detected stack information.
4. Turn on read access if it is off.
5. Leave write/run access off and ask an agent to inspect the project.
6. Enable run access only after checking approved commands.
7. Run an approved check command through an agent.
8. Ask an agent to propose a small documentation change, then approve or reject
   it in the review queue.

## Power-user checkpoint

You can safely use projects when:

- You know which folder is attached.
- You understand the permission toggles.
- Agents use approved commands only.
- Proposed changes are reviewed before disk writes.
- Run history and snapshots explain what happened.
- Project channels keep context and memory scoped.

## Next

Continue to [Automation and MCP](automation.md).
