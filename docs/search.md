# Search & organisation

A growing vault needs more than links. Narrative gives you folders, tags,
ranked full-text search, daily notes, and templates to keep hundreds of pages
navigable.

## Full-text search

Open search with `⌘⇧F`. Narrative searches every page's content and returns
**ranked results with snippets** — the matching text shown in context so you
can recognise the right page at a glance.

### Search operators

Plain words match anywhere. Operators narrow the search:

| Operator | Matches |
|---|---|
| `tag:project` | Pages carrying the `#project` tag |
| `title:roadmap` | Pages whose title contains "roadmap" |
| `content:budget` | Pages whose body contains "budget" |
| `/reg(ex)?/` | Pages matching the regular expression |

Operators combine with each other and with plain terms — for example
`tag:meeting budget` finds pages tagged `#meeting` that mention "budget".

## Tags

Write `#tag` anywhere in a page and it becomes a tag. Tags are an organising
layer that cuts across folders.

- **Nested tags.** `#project/narrative` and `#project/website` build a
  collapsible **tag tree** — `#project` is a parent you can expand.
- **The Tags view** (`⌘⇧T`) lists every tag with its page count; pick one to
  see all pages that carry it.

Tags and folders are complementary: a folder is where a file *lives*, a tag is
a theme that can span the whole vault.

## Folders & the sidebar tree

The sidebar shows your vault as a tree of real folders and files. You can:

- **Drag** a page or folder to reorganise — this moves the file on disk.
- **Rename inline** by double-clicking.
- **Create** pages and folders from the tree or the command palette.
- **Pin** important pages to a dedicated section at the top.

Sort order, pins, and icons are remembered in the
[sidecar](vault.md#the-sidecar), so your arrangement travels with the vault.

## Daily notes

Press `⌘D` to open **today's daily note** — a page named for the date, created
on demand in the daily-notes folder. Daily notes are perfect for journaling,
logging, and capturing fleeting thoughts you'll link out from later.

## Templates

Mark any page as a **template** and reuse its structure for new pages — a
meeting note, a project brief, a book summary. Templates live in the templates
folder and keep recurring page shapes consistent.

## Archive

Pages you no longer need in view can be **archived** rather than deleted. They
drop out of the tree, search, and the graph, but the file stays in the vault —
nothing is lost, and you can restore it any time.

## The outline

Every page with headings shows a **document outline** — a clickable table of
contents built from its `H1`–`H3` blocks. For long pages it's the fastest way
to jump to a section.

## The command palette

`⌘K` opens the **command palette** — a single search box over every command
*and* every page. Type to jump to a page, run an action, toggle a view, or fire
a plugin command. When in doubt, press `⌘K`.

## Export

Any page can be **exported** to a standalone Markdown file (`⌘E`) — handy for
sharing a single note outside the vault. (Your pages are *already* Markdown on
disk; export simply writes a clean copy wherever you choose.)

## Next

- **[AI assistant](ai.md)** — ask questions across everything you've written.
- **[Tutorial: Organising a vault](tutorial/organizing.md)** — practise the
  whole workflow.
