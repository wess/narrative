# The editor

Narrative's editor is a **block editor** — a Notion-style writing surface where
a page is a stack of blocks you can create, transform, reorder, and delete.
Underneath, every page is a plain Markdown file: the editor round-trips
blocks ↔ Markdown on every load and save, so **what you see is what's on disk.**

## Blocks

Each paragraph, heading, list item, quote, and so on is a block. You can:

- **Create a block** by pressing `Enter` at the end of one.
- **Transform a block** into another type — via the slash menu, a Markdown
  shortcut, or the block's right-click menu ("Turn into…").
- **Reorder blocks** by dragging them.
- **Act on a block** — duplicate, move, delete, open in split — from its
  right-click context menu.

## The slash menu

Type `/` at the start of an empty block to open the **slash menu**. Start
typing to filter, then press `Enter` to insert. It's the fastest way to add any
block type without leaving the keyboard.

## Markdown shortcuts

You can also create blocks by typing Markdown and letting it transform in
place:

| Type this | And the block becomes |
|---|---|
| `# ` | Heading 1 |
| `## ` | Heading 2 |
| `### ` | Heading 3 |
| `- ` or `* ` | Bulleted list item |
| `1. ` | Numbered list item |
| `[] ` / `[ ] ` | To-do item |
| `> ` | Quote |
| `> [!warning] ` | Callout |
| ` ``` ` | Code block |
| `$$` | Math block |
| `---` | Divider |

Inline formatting works the usual Markdown way — `**bold**`, `*italic*`,
`~~strikethrough~~`, `` `inline code` `` — and a **selection toolbar** appears
when you highlight text, so you can apply formatting with the mouse too.

## Block types

| Block | Notes |
|---|---|
| **Text** | A plain paragraph — the default block. |
| **Heading 1–3** | Section headings; they also feed the [outline](search.md#the-outline). |
| **Bulleted list** | A standard unordered list item. |
| **Numbered list** | An ordered list item. |
| **To-do** | A checkbox item you can tick. |
| **Quote** | A block quote. |
| **Callout** | A highlighted admonition — `> [!note]`, `> [!warning]`, etc. |
| **Code** | A fenced code block with a language. |
| **Math** | KaTeX-rendered math — `$$…$$` for a block, `$…$` inline. |
| **Divider** | A horizontal rule. |
| **Image** | An embedded image — a pasted attachment or a URL. |
| **Table** | An editable Markdown table. |
| **Page embed** | `![[Page]]` — renders another page's content inline. |
| **Page properties** | A YAML front-matter block at the top of the page for structured metadata. |

## Math

Narrative renders math with **KaTeX**. Use `$$ … $$` on its own block for
display math, or `$ … $` within text for inline math. The source is stored as
ordinary LaTeX between dollar signs in the Markdown file.

## Images & attachments

There are two ways to put an image on a page:

- **Paste it.** Copy an image anywhere, then paste into a page. Narrative saves
  it into an `attachments/` folder inside the vault and inserts an image block.
  The picture is now a real file in your vault — it travels with it, and
  [Stohr sync](stohr.md) carries it like any page.
- **Link a URL.** Type or paste an image URL into the image block's field.

Because the attachment lives in the vault, the page's Markdown only stores a
short relative path (`![](attachments/shot.png)`) — so the note stays portable
and readable in any other Markdown tool that has the folder alongside it.

## Page embeds

`![[Another Page]]` embeds that page's content directly in the current one. The
embed stays live — edit the source page and the embed reflects it. Combined
with `[[wiki links]]` (see **[Linking](linking.md)**), embeds let you compose
pages out of other pages.

## Page properties

A page can carry structured metadata in a **YAML front-matter** block at its
top. This is standard Markdown front-matter — a fenced `---` block of
`key: value` pairs — so it stays readable in any other editor and is picked up
by tools that understand front-matter.

## Page icons

Every page can have an emoji **icon** shown in the sidebar, tabs, and the title.
Icons are app-level metadata stored in the [sidecar](vault.md#the-sidecar), so
they never clutter your Markdown.

## Context menus everywhere

Both **pages** (in the sidebar) and **blocks** (in the editor) have full
right-click context menus — turn-into, duplicate, move, open-in-split, export,
delete, and more. If you're looking for an action, right-click is a good first
guess.

## Next

- **[Linking & the graph](linking.md)** — connect your pages.
- **[Tutorial: Writing your first notes](tutorial/writing.md)** — a hands-on
  walkthrough.
