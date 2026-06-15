# Course 6 — Agents, Channels, Memory, and Harnesses

Goal: understand Bethink's agent workspace and use it without turning simple
work into unnecessary machinery.

## Lesson 1: When to use an agent

Use normal AI chat for one-off questions. Use an agent when the work repeats or
needs a stable role.

Good agent roles:

- Research lead.
- Editor.
- Project reviewer.
- Test runner.
- Meeting summarizer.
- Knowledge librarian.

Weak agent roles:

- Smart helper.
- Do everything.
- Random assistant.
- General expert.

An agent should have:

- A human-readable name.
- A role definition.
- A focused purpose.
- Limited tools.
- A clear success pattern.

## Lesson 2: Understand tool access

Tools let an agent do things: search, read pages, propose changes, inspect
projects, or run approved project commands.

Tool access has three common states:

| State | Meaning |
|---|---|
| No tools | The agent can chat from provided context but cannot inspect or change data. |
| Specific tools | The agent can only use the named tools. |
| `*` | The agent can use every registered tool. Use this rarely. |

Start narrow. Add tools only when the agent needs them.

## Lesson 3: Create a useful agent

Use the agent wizard when you are not sure what to write. Start with a preset,
guided setup, or freeform description.

Example role:

```text
Name: Rowan
Role: Vault librarian
Purpose: Find related pages, suggest links, and keep project notes organized.
Tools: vault.search, vault.read, vault.backlinks, vault.outgoing
Rules:
- Search before answering.
- Cite page titles.
- Suggest changes before making them.
- Prefer links and structure over long prose.
```

## Lesson 4: Use channels for multi-agent work

A channel is a named room with a brief, assigned agents, optional linked
projects, and its own transcript/memory.

Use a channel when:

- Work lasts more than one chat turn.
- More than one agent role is useful.
- The work has a project, topic, or ongoing goal.
- You want channel-specific memory.

Examples:

- `Website Redesign`
- `Product Research`
- `Launch Planning`
- `Bethink Development`
- `Weekly Review`

## Lesson 5: Use memory deliberately

Bethink has global memory and channel memory.

| Memory type | Use it for |
|---|---|
| Global memory | Facts that should help across the whole vault. |
| Channel memory | Facts that matter only inside one channel. |

Good memory:

- "The onboarding project uses the term activation for first successful use."
- "The user prefers short release notes with blockers first."
- "The Stohr project uses Bun for local commands."

Bad memory:

- "The user had a meeting."
- "The assistant was helpful."
- "Remember everything about this discussion."

Open the memory manager when an agent starts acting on stale assumptions.

## Lesson 6: Read run history

Run history is the audit trail for agent behavior. Use it to answer:

- Which agent ran?
- Which channel was active?
- Which tools were called?
- Did it complete, error, cancel, or hit the loop limit?
- How many loop iterations did it use?
- What output did it produce?

If an agent surprises you, inspect the run before changing the prompt.

## Lesson 7: Use harnesses for repeatable behavior

A harness scenario is a saved test for agent behavior. Use one when you expect
the same workflow to work repeatedly.

Good harness scenarios:

- "Project reviewer finds missing tests."
- "Research agent cites source pages."
- "Builder proposes a file change instead of writing directly."
- "Weekly review agent separates decisions from open questions."

Each harness result should record:

- Pass, fail, or error.
- Score.
- Notes.
- Stop reason.
- Iteration count.

Harnesses are how you turn "this agent seems good" into "this workflow is
trusted enough to reuse."

## Exercises

1. Create one agent from a preset.
2. Edit its role definition so it has a specific job.
3. Remove broad tool access and give it only the tools it needs.
4. Create a channel with that agent and one clear brief.
5. Ask the agent to perform one small task.
6. Open run history and inspect tool calls, stop reason, and loop count.
7. Pin one useful memory and delete one noisy memory.
8. Write one harness scenario for a repeated workflow.

## Power-user checkpoint

You understand Bethink agents when:

- You know when plain AI chat is enough.
- Each agent has a role, not just a name.
- Tool access is narrow and intentional.
- Channels hold longer-running work.
- Memory is curated.
- Run history is part of debugging.
- Harness scenarios protect workflows you care about.

## Next

Continue to [Projects and real work folders](projects.md).
