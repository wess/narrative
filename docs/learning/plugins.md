# Course 9 — Plugins

Goal: understand when plugins are worth using, how to evaluate them, and how to
start writing your own.

## Lesson 1: What plugins are for

Plugins extend Bethink with commands, views, Markdown processors, ribbon icons,
status-bar items, and settings. Bethink supports an Obsidian-compatible plugin
API so existing patterns are familiar.

Use a plugin when:

- A workflow is repeated often.
- The command palette is not enough.
- You need a custom view.
- You need a custom Markdown rendering behavior.
- You want to connect Bethink to another local workflow.

Do not use a plugin when:

- A template or checklist is enough.
- A one-off script is enough.
- The workflow is not stable yet.

## Lesson 2: Install carefully

Plugins run inside Bethink with meaningful access to your workspace. Treat them
like software, not like themes.

Before installing a plugin, ask:

- Who wrote it?
- What does it do?
- Does it need network access?
- Does it modify pages?
- Can I remove it cleanly?
- Is my vault backed up?

Test new plugins in a copy of an important vault if you are unsure.

## Lesson 3: Manage plugin settings

Good plugin settings should be:

- Understandable.
- Reversible.
- Scoped to the plugin.
- Documented.

After changing plugin settings, write a short note in your vault if the plugin
becomes part of a critical workflow. Future-you should know why it exists.

## Lesson 4: Write your first plugin

Start with the plugin tutorial:

- [Writing your first plugin](../tutorial/plugin.md)
- [Plugin reference](../plugins.md)

Your first plugin should be boring:

- Add one command.
- Show one notice.
- Read the active page.
- Do not modify files until the command is reliable.

## Lesson 5: Plugin ideas for power users

Good first real plugins:

- Create a page from a custom template.
- Add a command for your weekly review.
- Render a custom callout style.
- Add a status-bar counter.
- Open a project dashboard.
- Insert a decision-record skeleton.

Avoid starting with:

- Sync engines.
- Multi-provider AI systems.
- Complex editors.
- Anything that rewrites many pages.

## Exercises

1. Read the plugin guide.
2. Load the sample plugin.
3. Run its command from the command palette.
4. Change one setting.
5. Write a tiny plugin idea in your vault.
6. Rank the idea: command, view, processor, or settings.

## Power-user checkpoint

You understand plugins when:

- You know when not to use one.
- You can evaluate plugin risk.
- You can load and disable a plugin.
- You understand commands, views, processors, and settings.
- You can build a small plugin before attempting a large one.

## Next

Continue to [Mastery](mastery.md).
