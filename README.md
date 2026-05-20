# Narrative

A feature-complete personal knowledge base — a fast, native desktop app for
writing, linking, and finding your notes. Your whole vault is a plain folder
of Markdown files, so your knowledge is always portable and always yours.

## Features

### Vault
- **Your vault is a folder of files** — every `.md` file is a page, every
  subfolder a folder. Point Narrative at any folder of Markdown and it just
  works. Edits write straight to the files; the search index is rebuilt in
  memory on open, so there's nothing proprietary to lock you in.
- **Live filesystem sync** — a recursive watcher folds in changes made by
  git, another editor, or a sync client while Narrative is open, including
  renames and moves.
- **Vault switcher** — open / create / recent-vaults picker, switch without
  a restart. App-only metadata (pins, icons, manual sort) lives in a small
  `.narrative/ui.json` sidecar so it travels with the vault without touching
  the Markdown.

### Writing
- **Block editor** — a Notion-style WYSIWYG surface: `/` slash menu,
  markdown shortcuts (`# `, `- `, `> `, …), a selection toolbar, and
  drag-to-reorder blocks. A page *is* a `.md` file — the editor round-trips
  blocks ↔ markdown on every load and save.
- **Block types** — text, H1–H3, bulleted / numbered / to-do lists, quotes,
  **callouts** (`> [!warning]`), code, **math** (`$$…$$` and inline `$…$`,
  rendered with KaTeX), dividers, images, **tables**, **page embeds**
  (`![[Page]]`), and **page properties** (YAML front-matter).
- **Right-click menus** everywhere — pages and blocks both have full
  context menus (turn-into, duplicate, move, open-in-split, …).

### Linking & navigation
- **`[[Wiki links]]`** — live autocomplete; `[[Page#Heading]]` jumps to a
  heading; clicking opens (or creates) the target.
- **Backlinks** *and* **outgoing links** panels, **hover preview** of any
  link, **back / forward** history, **graph view** (global *and* local),
  and a **Recent** sidebar section.

### Organisation & search
- **Folders & files** — real folders in the sidebar tree; drag to reorganise
  (it moves the file on disk), rename inline.
- **Nested `#tags`** — `#project/narrative` builds a collapsible tag tree.
- **Full-text search** — ranked snippets, plus operators: `tag:`, `title:`,
  `content:`, and `/regex/`.
- **Daily notes**, **pinning**, **archive**, **templates**, **export to
  Markdown**, **page icons**, **outline**.

### Workspace
- **Tabs** and a **split view** (read-only reference pane).
- **Find in note** (`⌘F`), **command palette** (`⌘K`), **random note**,
  light / dark / auto **theme**, persisted window state.

### AI assistant
- A streaming **chat drawer** (`⌘J`) that can ground answers in the page
  you're reading *and/or* **your whole vault** (RAG), plus one-tap **page
  summarisation**.
- **RAG retrieval** — "Search my vault" pulls the most relevant pages into
  context. Keyword retrieval works for every provider out of the box; turn
  on the **semantic index** (Settings) and it upgrades to embedding-based
  cosine similarity. Answers cite the pages they used.
- Provider-agnostic — **Anthropic**, **OpenAI**, **Ollama** (local),
  **Ollama Cloud**, or any **OpenAI-compatible** server (Groq, OpenRouter,
  LM Studio, vLLM, …).
- A macOS-style **Settings** panel (`⌘,`) configures the provider, model,
  and per-provider **server URL**; API keys live in the **OS Keychain**,
  never in plain files.

### MCP server
- `src/mcp.ts` is a standalone **Model Context Protocol** server — point
  Claude Desktop, Cursor, or Claude Code at it and they can search, read,
  link-walk, and create pages in your vault. It opens the most-recently-used
  vault folder and writes `create-page` straight to a `.md` file (the running
  app's watcher picks it up live).
- Tools: `search-pages` (with operators), `get-page`, `list-pages`,
  `page-links`, `create-page`. Resources: `narrative://recent`,
  `narrative://tags`.
- Settings → AI shows a copy-paste config snippet; or register it manually:

  ```json
  {
    "mcpServers": {
      "narrative": { "command": "bun", "args": ["/path/to/narrative/src/mcp.ts"] }
    }
  }
  ```

### Plugins
- **Extensible plugin system** — Narrative loads community plugins from its
  plugins folder. A plugin is a folder with a `manifest.json`, a CommonJS
  `main.js`, and optional `styles.css` / `data.json`.
- A rich **plugin API** is provided to plugin code at runtime: `Plugin`,
  `Component`, `App`, `Vault` + `TFile`/`TFolder`, `Workspace`,
  `MetadataCache`, `Notice`, `Modal`, `Menu`, `Setting` + `PluginSettingTab`,
  `SuggestModal`/`FuzzySuggestModal`, `MarkdownRenderer`, `Editor`,
  `requestUrl`, `setIcon`, a `moment`-style date library, the
  `el.createDiv()` / `arr.first()` DOM helpers, and more.
- Plugins contribute **commands** (into the `⌘K` palette), **ribbon icons**,
  **status-bar items**, **settings tabs**, **custom views**, and **markdown
  post-/code-block processors** — all torn down cleanly on disable.
- The **vault adapter** maps the plugin `Vault` / `MetadataCache` API onto
  the real file-backed vault, so `vault.read/modify/create/delete` and the
  `create`/`modify`/`rename` events all operate on actual `.md` files.
- **Settings → Plugins** installs, enables, disables, and removes plugins. A
  built-in **Sample Plugin** ships enabled on first run as a working example.
- **Known limits:** the webview has no Node, so plugins that reach for
  filesystem / process modules won't work; custom views render in one side
  panel; the `Editor` adapter is best-effort over the block editor;
  `parseYaml` is frontmatter-grade, not full YAML; plugins are app-global,
  shared across every vault.

## Develop

```bash
bun install
bun run dev        # opens the native window with hot reload
```

## Build

```bash
bun run build      # -> dist/narrative  (single-file binary)
bun run bundle     # -> .app bundle (macOS)
```

## Project layout

```
src/
  mcp.ts       standalone MCP server (run with `bun src/mcp.ts`)
  shared/      types.ts + IPC channel contract (host <-> webview)
  host/        node repo (file ops + index sync), links/tags/graph, FTS, RAG, AI, menu
    vault/     scan, in-memory index build, file I/O, watcher, recents, sidecar
    plugins/   plugin scan/store, IPC handlers, the seeded sample plugin
  app/         React webview
    state/     external store + actions
    lib/       markdown + math renderers, blocks, tree/tag/date helpers
    components/ sidebar, editor, graph, search, tags, vault picker, settings, …
    plugins/   the plugin runtime — API module, loader, vault adapter, registries
```

## Quality

```bash
bun run typecheck   # tsc --noEmit
bun run check       # biome
```
