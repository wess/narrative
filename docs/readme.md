# Narrative Documentation

Welcome to the Narrative docs. Narrative is a native desktop knowledge base
where every note is a plain Markdown file you own.

## Start here

If you've never used Narrative, work through the **[tutorials](tutorial/readme.md)** —
they take you from a fresh install to writing your own plugin, one short step
at a time.

## Guides

| Guide | What it covers |
|---|---|
| [Overview](overview.md) | What Narrative is, and the architecture behind it |
| [Vaults](vault.md) | The file-backed vault model, the sidecar, switching, sync |
| [The editor](editor.md) | The block editor, the slash menu, every block type |
| [Linking & the graph](linking.md) | Wiki links, backlinks, hover previews, the graph |
| [Search & organisation](search.md) | Search operators, tags, daily notes, templates |
| [AI assistant](ai.md) | Connecting a provider, RAG, the semantic index |
| [Connecting to Stohr](stohr.md) | Optional self-hostable cloud storage |
| [MCP server](mcp.md) | Exposing your vault to Claude Desktop, Cursor, and others |
| [Plugins](plugins.md) | Installing, managing, and writing plugins |
| [Keyboard shortcuts](shortcuts.md) | The complete shortcut reference |
| [Building & distribution](building.md) | Running, compiling, and bundling the app |

## Tutorials

| Tutorial | You'll learn to |
|---|---|
| [Getting started](tutorial/gettingstarted.md) | Install Narrative and open your first vault |
| [Writing your first notes](tutorial/writing.md) | Use the block editor and Markdown shortcuts |
| [Linking & the graph](tutorial/linking.md) | Connect pages and explore the graph |
| [Organising a vault](tutorial/organizing.md) | Folders, tags, daily notes, search, templates |
| [Using the AI assistant](tutorial/ai.md) | Connect a model and chat with your vault |
| [Writing your first plugin](tutorial/plugin.md) | Build and load a working plugin |

## A one-paragraph mental model

A **vault** is a folder of Markdown files on disk — that folder *is* your
knowledge base, and it is the source of truth. When Narrative opens a vault it
scans the folder and builds a fast in-memory index for search, links, and the
graph; that index is disposable and rebuilt on every open. You edit pages in a
block editor that round-trips to Markdown, and everything you do — creating a
page, linking, tagging — writes straight to files. Close Narrative and your
vault is just a tidy folder of `.md` files, exactly as portable as the day you
started.
