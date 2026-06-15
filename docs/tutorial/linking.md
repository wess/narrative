# Tutorial 3 — Linking & the graph

A pile of notes becomes a *knowledge base* when the notes connect. This
tutorial covers Bethink's core feature: linking pages with `[[wiki links]]`,
and seeing those connections through backlinks and the graph.

## Step 1 — Make a wiki link

Open `My First Note` from the previous tutorial. In a text block, type **`[[`**.

An autocomplete list of your pages appears. Type a few letters of `Ideas`,
select it, and Bethink inserts a link: `[[Ideas]]`.

Click that link — it opens the *Ideas* page. You've connected two notes.

## Step 2 — Link a page into existence

Here's the trick that changes how you write: **you can link to a page that
doesn't exist yet.**

In `My First Note`, type `[[Reading List]]` — a page you haven't created.
Click it. Bethink **creates `Reading List.md`** and opens it.

This is the natural workflow: when you mention an idea, link it. The page is
created the moment you need it. Write down a few books on the new *Reading
List* page.

## Step 3 — Link to a heading

You can target a specific heading with `[[Page#Heading]]`. If `Reading List`
has a `## Fiction` heading, then `[[Reading List#Fiction]]` jumps straight to
it. The autocomplete helps after you type the `#`.

## Step 4 — Read the backlinks

Go back to the *Ideas* page. Find the **Backlinks** panel — it lists every page
that links *to* this one. `My First Note` is there, because you linked to
*Ideas* in Step 1.

Backlinks are how you discover context. Open any page and you instantly see
everything that refers to it — connections you never had to maintain by hand.

The panel separates:

- **Linked mentions** — real `[[links]]` to this page.
- **Unlinked mentions** — pages that mention this page's title in plain text.
  These are candidates you can turn into proper links.

## Step 5 — See outgoing links

Next to backlinks is **Links from here** — every page the current page links
*out* to. Backlinks and outgoing links are the two directions of the same web.

## Step 6 — Hover to preview

Hover your cursor over any link without clicking. A **preview** of the target
page pops up, so you can check what's behind a link while you stay where you
are.

## Step 7 — Open the graph

Press **`⌘⇧G`** for the **graph view**. Every page is a dot; every link is a
line. With only a few pages it's small — but as your vault grows, the graph
turns into a map of how your thinking is organised, with clusters forming
around related ideas.

Try the two modes:

- **Global** — the whole vault.
- **Local** — just the current page and its neighbours.

Click any node to jump to that page.

## Step 8 — Navigate like a browser

As you follow links, use **back** and **forward** to retrace your path — just
like a web browser. The sidebar's **Recent** section is another fast lane back
to where you've been.

## What you learned

- **`[[` ** creates a wiki link; `[[Page#Heading]]` targets a heading.
- Linking to a missing page **creates it** — link first, write later.
- **Backlinks** show what points at a page; **outgoing links** show what it
  points to.
- **Hover** previews a link; **`⌘⇧G`** opens the graph.

## Next

→ **[Tutorial 4 — Organising a vault](organizing.md)**
