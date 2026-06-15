<div align="center">

# Bethink

**A fast, native knowledge base where every note is a Markdown file you own.**

Write in blocks. Connect ideas with `[[links]]`. Find anything in milliseconds.
Ask an AI grounded in your own notes — all in a desktop app that starts in a
blink and never holds your knowledge hostage.

[Quick start](#quick-start) ·
[Documentation](docs/readme.md) ·
[Tutorials](docs/tutorial/readme.md) ·
[Learning](docs/learning/index.md) ·
[Plugins](docs/plugins.md)

</div>

---

## Why Bethink

- **Your vault is a folder of files.** Every page is a real `.md` file, every
  subfolder a folder. Point Bethink at any folder of Markdown and it just
  works. There is no proprietary database, no lock-in — back it up with git,
  sync it with anything, open it in any editor.
- **Native and fast.** No bundled browser. A small binary, an instant cold
  start, and a window that feels like part of your OS.
- **Block editor, Markdown underneath.** A Notion-style writing surface that
  round-trips to plain Markdown on every save. What you see is what's on disk.
- **Linked, not foldered.** `[[Wiki links]]`, backlinks, hover previews, and a
  graph view turn a pile of notes into a connected web of thought.
- **AI that knows *your* notes.** A chat assistant that can ground its answers
  in the page you're reading or your entire vault — with any provider, local
  or hosted.
- **Extensible.** An Obsidian-compatible plugin API means a real ecosystem of
  commands, views, and processors — not a walled garden.

## Features

### ✍️ Writing

A block editor with a `/` slash menu, Markdown shortcuts (`# `, `- `, `> `, …),
a selection toolbar, and drag-to-reorder blocks. Block types include text,
H1–H3, bulleted / numbered / to-do lists, quotes, **callouts**, code, **math**
(KaTeX), dividers, images, **tables**, **page embeds** (`![[Page]]`), and
**page properties** (YAML front-matter). Paste an image straight into a page
and it's saved into the vault as an **attachment**.

### 🔗 Linking & navigation

`[[Wiki links]]` with live autocomplete, `[[Page#Heading]]` jumps, **backlinks**
and **outgoing-links** panels, **hover previews**, back / forward history, and a
**graph view** — both global and local to the current page.

### 🗂️ Organisation & search

Real folders you can drag to reorganise, nested `#tags` that build a collapsible
tree, **daily notes**, **pinning**, **archive**, **templates**, **page icons**,
and a document **outline**. Full-text search is ranked and supports operators:
`tag:`, `title:`, `content:`, and `/regex/`.

### 🪟 Workspace

**Tabs**, a **split view** reference pane, **find in note** (`⌘F`), a
**command palette** (`⌘K`), **random note**, light / dark / auto **theme**, and
persisted window state.

### 🤖 AI assistant

A streaming **chat drawer** (`⌘J`) that grounds answers in the page you're
reading and/or your **whole vault** (RAG), plus one-tap **page summarisation**.
Works with **Anthropic**, **OpenAI**, **Ollama** (local), **Ollama Cloud**, or
any **OpenAI-compatible** server. API keys live in the **OS Keychain**.

### ☁️ Cloud sync (optional)

Keep working entirely local, or connect Bethink to a self-hostable
**[Stohr](https://github.com/wess/stohr)** instance and your whole vault —
every page and attachment — stays in **two-way sync** with your account:
pushed and pulled on launch, on a timer, and on demand, with conflicting edits
kept side by side rather than overwritten. Sign in with a password (2FA
supported) or a personal access token; the token lives in your OS keychain.

### 🔌 MCP server & plugins

A standalone **Model Context Protocol** server lets Claude Desktop, Cursor, or
Claude Code search, read, and create pages in your vault. An **Obsidian-compatible
plugin system** loads community plugins that add commands, ribbon icons, views,
and Markdown processors.

## Quick start

Bethink runs on **[Bun](https://bun.sh)** — install it first, then:

```bash
bun install
bun run dev
```

A native window opens with hot reload. On first run Bethink seeds a starter
vault so you're never staring at a blank screen — press **⌘N** for a new page
and **⌘K** to open the command palette.

## Build

```bash
bun run build      # -> dist/bethink   single-file binary
bun run bundle     # -> a native app bundle (.app / .AppDir / .exe folder)
bun run package    # -> a distributable installer (.dmg / .AppImage / setup.exe)
```

Bethink builds on **macOS, Linux, and Windows** — it uses each OS's own
webview, so there's no bundled browser anywhere. See
**[docs/building.md](docs/building.md)** for the full cross-platform build and
distribution guide.

## Documentation

| Guide | What's inside |
|---|---|
| [Learning](docs/learning/index.md) | Courses, lessons, exercises, and power-user workflows |
| [Overview](docs/overview.md) | What Bethink is and how it's built |
| [Vaults](docs/vault.md) | The file-backed vault model and how sync works |
| [The editor](docs/editor.md) | Blocks, the slash menu, every block type |
| [Linking & the graph](docs/linking.md) | Wiki links, backlinks, hover previews |
| [Search & organisation](docs/search.md) | Operators, tags, daily notes, templates |
| [AI assistant](docs/ai.md) | Providers, RAG, the semantic index |
| [Connecting to Stohr](docs/stohr.md) | Optional self-hostable cloud storage |
| [MCP server](docs/mcp.md) | Exposing your vault to AI clients |
| [Plugins](docs/plugins.md) | Installing and writing plugins |
| [Keyboard shortcuts](docs/shortcuts.md) | The full shortcut reference |
| [Building & distribution](docs/building.md) | Dev, compile, bundle, ship |

**New here?** Start with the **[tutorials](docs/tutorial/readme.md)** — a
hands-on path from installing Bethink to writing your first plugin. To go
deeper, work through **[Bethink Learning](docs/learning/index.md)**, a
course-style path for becoming a power user.

## Project layout

```
src/
  mcp.ts       standalone MCP server (run with `bun src/mcp.ts`)
  shared/      types + the typed IPC channel contract (host <-> webview)
  host/        Bun process — vault repo, file I/O, index sync, search, RAG, AI
    vault/     scan, in-memory index, file I/O, watcher, recents, sidecar
    plugins/   plugin scan/store, IPC handlers, the seeded sample plugin
  app/         React webview
    state/     the external store + actions
    lib/       markdown <-> blocks, math, tree/tag/date helpers
    components/ sidebar, editor, graph, search, settings, …
    plugins/   the plugin runtime — Obsidian API, loader, vault adapter
```

Bethink is built on two of its own libraries, vendored into the repo:
**[butter](butter/)** (the Bun-host + native-webview desktop framework) and
**[basket](basket/)** (the `@basket/*` standard-library packages).

## License

[Apache License 2.0](LICENSE) © 2026 Wess Cope
