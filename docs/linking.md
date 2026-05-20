# Linking & the graph

Narrative is built for **linked thinking**. Folders organise; links *connect*.
A vault becomes useful when its pages reference each other, and Narrative makes
that the path of least resistance.

## Wiki links

Type `[[` anywhere in a page to start a **wiki link**. An autocomplete list of
pages appears as you type — pick one and Narrative inserts the link.

- **`[[Page Title]]`** links to a page by title.
- **`[[Page Title#Heading]]`** links to a specific heading and scrolls there
  when followed.
- **Clicking a link** opens the target page. If the page doesn't exist yet,
  Narrative **creates it** — so you can link first and write later. Linking to
  an idea is how you bring its page into being.

Links are matched by title, case-insensitively. Because the index resolves
links by title at query time, **renaming a page never leaves dead links** —
the connection is re-resolved automatically.

## Backlinks

Every page has a **Backlinks** panel showing every other page that links *to*
it. This is where linked thinking pays off: open any page and immediately see
its context — everything that mentions or depends on it.

Backlinks come in two groups:

- **Linked mentions** — pages with an explicit `[[link]]` to this page.
- **Unlinked mentions** — pages that mention this page's title in plain text
  but haven't linked it yet, so you can promote them to real links.

## Outgoing links

The **Links from here** panel is the mirror image: every page the current page
links *out* to. Together, backlinks and outgoing links show both sides of a
page's place in the web.

## Hover previews

Hover over any link — in the editor or in a panel — to get a **preview** of the
target page without leaving the one you're on. It's the quickest way to check
"what's behind this link?" while you read.

## History: back & forward

Narrative keeps a navigation history. Move **back** and **forward** through the
pages you've visited, just like a browser. Following a chain of links and
retracing your steps is frictionless.

## The graph

The **graph view** (`⌘⇧G`) draws your vault as a network — each page a node,
each link an edge. It comes in two modes:

- **Global graph** — the whole vault at once. Clusters reveal themselves:
  tightly linked groups of pages are tightly clustered nodes.
- **Local graph** — just the current page and its immediate neighbours, so you
  can see one idea's surroundings without the noise of the whole vault.

Click any node to jump to that page.

## The Recent section

The sidebar has a **Recent** section listing the pages you've touched most
recently — a fast lane back to whatever you were just working on.

## Next

- **[Search & organisation](search.md)** — find and arrange your pages.
- **[Tutorial: Linking & the graph](tutorial/linking.md)** — try it hands-on.
