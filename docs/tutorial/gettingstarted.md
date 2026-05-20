# Tutorial 1 — Getting started

In this first tutorial you'll install Narrative, launch it, and get comfortable
with the single most important concept: the **vault**.

## Step 1 — Install Bun

Narrative runs on [Bun](https://bun.sh). If you don't have it yet, install it
following the instructions at **bun.sh**, then confirm:

```bash
bun --version
```

## Step 2 — Install dependencies

From the Narrative project folder:

```bash
bun install
```

This pulls in everything Narrative needs, including its vendored `butter` and
`basket` libraries.

## Step 3 — Launch the app

```bash
bun run dev
```

A native window opens. Because this is your first launch and you have no vaults
yet, Narrative **creates a starter vault for you** and seeds it with two
pages — *Welcome to Narrative* and *Ideas*. You're looking at a working
knowledge base, not a blank screen.

`bun run dev` keeps running with **hot reload** — leave it open while you work
through these tutorials.

## Step 4 — Understand the vault

Here's the one idea everything else builds on:

> **A vault is a folder of Markdown files. That folder is your knowledge base,
> and it is the source of truth.**

Every page you see in the sidebar is a real `.md` file. Every folder is a real
directory. Narrative reads and writes those files directly — there is no
hidden database holding your content hostage.

To prove it to yourself, find the starter vault folder on disk (it's in
Narrative's app-data directory) and open it in any file manager. You'll see
`Welcome to Narrative.md` and `Ideas.md` — the exact pages shown in the app.
Open one in a text editor: it's plain Markdown.

This is the promise: **close Narrative and your knowledge is still just a
folder of files** you can read, back up, sync, and own forever.

## Step 5 — Look around

Take the tour:

- The **sidebar** on the left lists your pages and folders.
- The **main area** is the editor — click *Welcome to Narrative* to read it.
- Press **`⌘K`** to open the **command palette** — your map of everything the
  app can do. Type to filter; press `Esc` to close.

## Step 6 — Create your own vault (optional)

The starter vault is fine for these tutorials. But when you're ready for a real
one:

- **File → New Vault…** — pick or create an empty folder; Narrative seeds it.
- **File → Open Vault…** (`⌘O`) — open *any* existing folder of Markdown files
  as a vault. Nothing is imported or converted; it just works.

You can keep many vaults and switch between them with **File → Switch Vault…** —
no restart needed.

## What you learned

- Narrative runs on Bun; `bun run dev` launches it with hot reload.
- A **vault is a plain folder of Markdown files** — the source of truth.
- The index Narrative builds is disposable; your files are not.
- `⌘K` opens the command palette.

## Next

→ **[Tutorial 2 — Writing your first notes](writing.md)**
