# Tutorial 4 — Organising a vault

Links connect ideas; structure keeps them findable. This tutorial covers the
tools that keep a growing vault navigable: **folders, tags, daily notes,
search, and templates**.

## Step 1 — Make a folder

In the sidebar, create a new **folder** — call it `Projects`. Folders are real
directories in your vault folder on disk.

Now **drag** a page into `Projects`. That moves the file on disk into the
`Projects/` directory. The sidebar tree mirrors your filesystem exactly.

You can rename a page or folder inline by double-clicking it.

## Step 2 — Add tags

Folders say where a file *lives*. **Tags** say what a page is *about*, and they
cut across folders.

In any page, write a tag inline:

```
This is a research note. #research #todo
```

Tags also **nest**. Try writing `#project/narrative` and `#project/website` in
a couple of pages — Narrative builds a collapsible tree with `#project` as the
parent.

Open the **Tags view** with **`⌘⇧T`** to browse every tag and its page count.
Click a tag to see all the pages that carry it.

## Step 3 — Search the vault

Press **`⌘⇧F`** to search. Type a word and you get ranked results with
**snippets** — the matching text in context.

Now try the **operators** that narrow a search:

| Search | Finds |
|---|---|
| `tag:research` | Pages tagged `#research` |
| `title:project` | Pages with "project" in the title |
| `content:budget` | Pages whose body contains "budget" |
| `/wo[rd]+/` | Pages matching a regular expression |

Operators combine: `tag:research todo` finds pages tagged `#research` that also
mention "todo".

## Step 4 — Start a daily note

Press **`⌘D`**. Narrative creates (or opens) **today's daily note** — a page
named for today's date. Daily notes are ideal for journaling and capturing
quick thoughts; link out from them to give those thoughts a permanent home
later.

## Step 5 — Pin what matters

Right-click an important page and **pin** it. Pinned pages get their own
section at the top of the sidebar, always one click away. Pins, icons, and your
manual sort order are remembered with the vault.

## Step 6 — Give a page an icon

Right-click a page and set an **emoji icon**. It shows in the sidebar, tabs,
and the page title — a fast visual anchor. (Icons are app metadata; they never
touch your Markdown.)

## Step 7 — Make a template

Build a page with a reusable structure — say a *Meeting Note* with headings for
*Attendees*, *Notes*, and *Actions*. Mark it as a **template**. From then on
you can spin up new pages from that shape, keeping recurring notes consistent.

## Step 8 — Archive, don't delete

When a page has served its purpose but you don't want to lose it, **archive**
it. It leaves the tree, search, and the graph — but the file stays in your
vault. Nothing is destroyed.

## Step 9 — Use tabs and split view

- Open several pages as **tabs** across the top.
- Open a page in **split view** as a read-only reference pane beside the one
  you're editing — perfect for writing while consulting another note.

## What you learned

- **Folders** organise files on disk; **tags** (including nested `#a/b` tags)
  cut across them.
- **`⌘⇧F`** searches with `tag:`, `title:`, `content:`, and `/regex/`
  operators.
- **`⌘D`** opens a daily note; pin, icon, template, and archive keep the vault
  tidy.
- **Tabs** and **split view** let you work with several pages at once.

## Next

→ **[Tutorial 5 — Using the AI assistant](ai.md)**
