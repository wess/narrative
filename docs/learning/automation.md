# Course 8 — Automation and MCP

Goal: use Bethink with external AI tools, repeatable commands, and automation
without losing the local-first model.

## Lesson 1: What MCP does

The MCP server exposes Bethink to MCP-aware clients. In plain language:

- Bethink's built-in AI brings a model into the app.
- MCP lets outside AI tools work with Bethink's vault and metadata.

MCP clients can search, read, inspect agents/channels/projects, list memory,
read transcripts, inspect run history, and manage harness records. Write tools
require explicit opt-in.

## Lesson 2: Use MCP read-only first

Start read-only. A read-only MCP client can still:

- Search your vault.
- Read pages.
- Inspect project trees when read permission is enabled.
- List agents and channels.
- Review memory and run history.
- Use table and canvas views.

This is enough for research, summaries, planning, and cross-tool context.

## Lesson 3: Enable writes only for a reason

Write tools require `BETHINK_MCP_ALLOW_WRITES=true`.

Enable writes when you want an external AI client to:

- Create pages.
- Capture web pages.
- Queue project file proposals.
- Create harness scenarios.
- Record harness results.

Do not enable writes casually. If you only need search and context, stay
read-only.

## Lesson 4: Build repeatable workflows

A repeatable workflow has:

1. A trigger.
2. A clear input.
3. A Bethink page, channel, project, or agent.
4. A review point.
5. A durable output.

Bethink supports two lightweight automation surfaces:

- Kanban boards for visible work in a project or shared inbox.
- Workflows for repeatable procedures with manual, schedule, webhook, or
  integration triggers.

Use Kanban when the question is "what should we work next?" Use workflows when
the question is "what steps should happen every time?"

Kanban cards can be assigned to an agent. Sending a card to an agent opens the
AI chat with the card title, status, priority, and details already structured as
the prompt.

Workflows are intentionally small. They store steps, triggers, and run history in
SQLite. A run records what would happen at each step, including approval waits,
so the procedure is inspectable before you trust deeper automation.

Examples:

### Research intake

1. Capture web page.
2. Ask AI to summarize claims.
3. Save source page.
4. Link it to a project.
5. Add `#review/needs-source` if verification is needed.

### Project review

1. Open project channel.
2. Ask reviewer agent to inspect changed files.
3. Run approved check command.
4. Save summary to channel memory.
5. Record harness result if this is a repeat scenario.

### Weekly review

1. Search `#review/weekly`.
2. Ask AI to group open loops.
3. Verify important claims.
4. Update project pages.
5. Archive stale notes.

## Lesson 5: Use the command palette as automation

Not all automation needs scripts. The command palette is the fastest built-in
automation layer:

- Create pages.
- Open views.
- Run summaries.
- Switch modes.
- Open settings.
- Start captures.
- Trigger plugin commands.

If you repeat something often, first check whether it already exists in `⌘K`.

## Lesson 6: Keep automation observable

Automation is only useful if you can explain what happened.

For agent and project automation, inspect:

- Run timeline.
- Tool calls.
- Stop reason.
- Loop count.
- Review queue.
- Project snapshots.
- Command run history.
- Kanban card movement.
- Workflow run history.
- Harness results.

If you cannot audit the workflow, do not rely on it for important work.

## Exercises

1. Register the MCP server in a client but leave writes disabled.
2. Use the client to search for a page.
3. Ask the client to list agents or channels.
4. Enable writes only in a test vault.
5. Create a harness scenario through MCP.
6. Record one harness result.
7. Turn one repeated manual workflow into a written checklist.
8. Create a Kanban card and send it to an agent.
9. Create a workflow from a template and run it manually.

## Power-user checkpoint

You are ready for automation when:

- Read-only MCP is useful before enabling writes.
- Every write-capable workflow has a review point.
- Agent/project automation leaves an audit trail.
- Harnesses protect workflows you repeat.
- You prefer simple checklists until real automation pays for itself.
- Kanban tracks open work; workflows track repeated procedure.

## Next

Continue to [Plugins](plugins.md).
