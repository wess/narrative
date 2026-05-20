# Overview

Narrative is a native desktop **personal knowledge base** — an app for writing
notes, linking them together, and finding them again fast. It sits in the same
family as Obsidian, Notion, and Logseq, with one firm principle: **your notes
are plain Markdown files and they always belong to you.**

## What makes it different

- **Files, not a database.** Your vault is an ordinary folder of `.md` files.
  Narrative never stores your content anywhere else. Everything proprietary —
  the search index, the link graph — is derived data that can be thrown away
  and rebuilt.
- **A real native app.** Narrative is not a website in a wrapper. It uses the
  operating system's own webview, so the binary is small and the app starts
  instantly.
- **A block editor over Markdown.** You write in a Notion-style block surface,
  but every page is saved as clean Markdown. The two representations are kept
  in sync on every load and save.
- **Linked thinking, built in.** Wiki links, backlinks, hover previews, and a
  graph view are core features, not add-ons.
- **AI grounded in your vault.** The assistant can answer using the page you're
  reading or your whole vault, and it cites the pages it used.
- **Extensible.** An Obsidian-compatible plugin API and a Model Context
  Protocol server open the app up to a wider ecosystem.

## How it's built

Narrative is a [butter](../butter/) desktop app. Internally it runs as **two
processes** that never share memory:

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  Host  (Bun process)    │  typed  │  Webview  (React UI)     │
│                         │   IPC   │                          │
│  • reads/writes the     │ <─────> │  • the block editor      │
│    vault's .md files    │ channels│  • sidebar, graph, search │
│  • the in-memory index  │         │  • the AI chat drawer     │
│  • search, links, RAG   │         │  • the plugin runtime     │
│  • AI provider calls    │         │                          │
└─────────────────────────┘         └──────────────────────────┘
```

- **The host** is a Bun process. It owns the filesystem: it scans the vault,
  builds and maintains the in-memory index, runs full-text search and RAG
  retrieval, and makes AI provider calls. It is the only side that touches
  disk or the network.
- **The webview** is a React app rendered in the OS webview. It is the entire
  user interface — the editor, sidebar, graph, search, settings, and the
  plugin runtime.
- **The IPC contract** is a single typed file (`src/shared/channels.ts`). Every
  request, response, and event between the two sides is declared there, so the
  boundary is fully type-checked.

This split is why Narrative feels fast: the UI never blocks on disk or network
work, and the host never blocks on rendering.

## The data model in one diagram

```
   Your vault folder (the source of truth)
   ┌──────────────────────────────────┐
   │  Projects/                       │        scan + parse on open
   │    Narrative.md   ── [[links]] ──┐│   ┌───────────────────────────┐
   │    Roadmap.md                   ││──>│  In-memory index (SQLite)  │
   │  Daily/2026-05-20.md            ││   │  nodes · links · tags ·    │
   │  .narrative/ui.json  (sidecar)  ││   │  embeddings  — disposable  │
   └──────────────────────────────────┘   └───────────────────────────┘
```

The folder is permanent; the index is not. See **[Vaults](vault.md)** for the
full story.

## Where to go next

- **[Vaults](vault.md)** — the file-backed model in detail.
- **[The editor](editor.md)** — how writing works.
- **[Tutorials](tutorial/readme.md)** — a hands-on introduction.
