# Tutorial 2 — Writing your first notes

Now that Bethink is running, let's write. This tutorial covers the **block
editor** — creating pages, working with blocks, the slash menu, and the
Markdown shortcuts that make writing fast.

## Step 1 — Create a page

Press **`⌘N`**. A new untitled page opens. Type a title at the top — call it
`My First Note` — and press `Enter` to drop into the body.

That page is now a real file: `My First Note.md` in your vault folder.

## Step 2 — Write some blocks

The editor works in **blocks**. Each paragraph, heading, or list item is its
own block. Type a sentence, press `Enter`, and you've started a new block.

Write a few lines:

```
This is my first note in Bethink.
I'm learning how the block editor works.
```

## Step 3 — Use the slash menu

At the start of an empty block, type **`/`**. A menu of block types appears.
Start typing to filter — `head`, `todo`, `quote`, `code` — and press `Enter`
to insert.

Try it: on a new block, type `/` then `heading 2`, press `Enter`, and write a
section heading.

## Step 4 — Use Markdown shortcuts

Even faster than the slash menu: type Markdown and watch it transform in place.

Try each of these at the start of a block:

| Type | Becomes |
|---|---|
| `# ` | A big heading |
| `## ` | A medium heading |
| `- ` | A bulleted list |
| `1. ` | A numbered list |
| `[] ` | A to-do checkbox |
| `> ` | A quote |
| `---` | A divider |

Build a small structured page using a heading, a bulleted list, and a couple
of to-do items.

## Step 5 — Format text inline

Inside any text block, use Markdown for inline formatting:

- `**bold**` → **bold**
- `*italic*` → *italic*
- `~~strikethrough~~` → ~~strikethrough~~
- `` `inline code` `` → `inline code`

Or **select text with the mouse** — a small toolbar appears with the same
formatting options.

## Step 6 — Try the richer blocks

A few block types worth knowing early:

- **Code block** — type ` ``` `, choose a language, and write code.
- **Callout** — type `> [!warning] ` for a highlighted admonition. Try
  `[!note]` and `[!tip]` too.
- **Math** — type `$$` for a math block and write LaTeX; it renders with
  KaTeX. Use `$x^2$` for inline math.
- **Table** — insert one from the slash menu and fill in cells.

## Step 7 — Reorder and transform

- **Drag** a block by its handle to move it.
- **Right-click** a block for its menu — *turn into* another type, duplicate,
  or delete it.

## Step 8 — It's all Markdown

Open `My First Note.md` in a plain text editor outside Bethink. Everything
you just wrote — the headings, lists, callout, code — is there as ordinary
Markdown. The block editor is a *view*; the file is the truth.

## What you learned

- Pages are made of **blocks**; `Enter` starts a new one.
- **`/`** opens the slash menu; Markdown shortcuts transform blocks as you type.
- Inline formatting works with Markdown or the selection toolbar.
- Every page round-trips to a plain `.md` file.

## Next

→ **[Tutorial 3 — Linking & the graph](linking.md)**
