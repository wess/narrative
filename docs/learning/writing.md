# Course 2 — Writing in Bethink

Goal: write clear notes quickly, use blocks without overthinking them, and keep
pages easy to reuse later.

## Lesson 1: Think in blocks, save as Markdown

Bethink gives you a block editor, but your page is still Markdown underneath.
That means you can write naturally, use the slash menu when you need structure,
and trust that the saved file stays portable.

Common block types:

| Block | Use it for |
|---|---|
| Paragraph | Normal writing. |
| Heading | Sections and scanning. |
| List | Options, notes, rough grouping. |
| To-do | Action items you intend to complete. |
| Quote | Something someone said or a source excerpt. |
| Callout | A warning, decision, note, or important context. |
| Code | Commands, snippets, config, or examples. |
| Table | Repeated structured facts. |
| Properties | Metadata that should be easy to scan later. |

## Lesson 2: Start with page shapes

A page shape is a reusable pattern. You do not need automation to start using
them. Copy the shape into a new page and fill it out.

### Meeting notes

```md
# Meeting: <topic>

Date:
People:

## Context

## Decisions

## Open questions

## Actions

- [ ]
```

### Decision record

```md
# Decision: <short name>

Status: proposed / accepted / reversed
Date:

## Decision

## Why

## Alternatives

## Follow-up
```

### Project note

```md
# Project: <name>

Goal:
Status:
Owner:

## Current focus

## Links

## Next actions
```

## Lesson 3: Write for future search

Search can only find what you wrote. Use the words future-you will search for.

Weak:

> talked about the thing again

Strong:

> Discussed the onboarding email redesign and decided to test a shorter welcome
> sequence.

The strong version includes real nouns: `onboarding`, `email`, `redesign`,
`welcome sequence`.

### Practice

Take one old vague note and rewrite the first paragraph so it includes:

- The project name.
- The decision or question.
- The people or context.
- The next action.

## Lesson 4: Use to-dos carefully

A to-do is a promise. Too many stale to-dos make a vault feel broken.

Use to-dos for actions that belong in the note:

- Follow up with a person.
- Verify a claim.
- Draft a section.
- Run a review.

Avoid to-dos for vague intentions:

- Think more.
- Improve this.
- Maybe research.

### Weekly clean-up

Once a week, search for open to-dos and either:

- Do it.
- Move it to a project note.
- Delete it.
- Rewrite it as a specific next action.

## Lesson 5: Use properties when a page belongs in a table

Properties are useful when you want to compare pages. Examples:

- Status
- Owner
- Priority
- Area
- Deadline
- Type

Do not add properties to every page by default. Add them when they make a view
or workflow easier.

## Exercises

1. Create a decision record for a real decision.
2. Create a meeting note using the shape above.
3. Add one callout to a page with an important warning or context.
4. Turn one vague action into a concrete to-do.
5. Add properties to three related project pages and inspect them in the table
   view.

## Power-user checkpoint

You are writing well in Bethink when:

- Pages have useful titles and scannable headings.
- Notes contain searchable nouns.
- To-dos are specific and reviewed.
- Tables and properties are used only where they help.
- Your Markdown files still look readable outside Bethink.

## Next

Continue to [Organization](organization.md).
