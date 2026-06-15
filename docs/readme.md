# Bethink Documentation

Welcome to the Bethink docs. Bethink is a native desktop knowledge base
where every note is a plain Markdown file you own.

## Start here

If you've never used Bethink, work through the **[tutorials](tutorial/readme.md)** —
they take you from a fresh install to writing your own plugin, one short step
at a time.

If you want to become a power user, use **[Bethink Learning](learning/index.md)**.
It is a course-style path with lessons, exercises, review routines, AI/agent
workflows, project safety, automation, and mastery checklists.

## Guides

| Guide | What it covers |
|---|---|
| [Bethink Learning](learning/index.md) | Courses and exercises for becoming a power user |
| [Overview](overview.md) | What Bethink is, and the architecture behind it |
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
| [Getting started](tutorial/gettingstarted.md) | Install Bethink and open your first vault |
| [Writing your first notes](tutorial/writing.md) | Use the block editor and Markdown shortcuts |
| [Linking & the graph](tutorial/linking.md) | Connect pages and explore the graph |
| [Organising a vault](tutorial/organizing.md) | Folders, tags, daily notes, search, templates |
| [Using the AI assistant](tutorial/ai.md) | Connect a model and chat with your vault |
| [Writing your first plugin](tutorial/plugin.md) | Build and load a working plugin |

## Learning courses

| Course | You'll learn to |
|---|---|
| [Bethink Basics](learning/basics.md) | Understand vaults, pages, navigation, and the command palette |
| [Writing in Bethink](learning/writing.md) | Use blocks, page shapes, properties, and searchable notes |
| [Organization](learning/organization.md) | Combine folders, links, tags, search, daily notes, and tables |
| [Review routines](learning/review.md) | Keep a growing vault clean, current, and useful |
| [AI in Bethink](learning/ai.md) | Ground AI answers in your vault and verify outputs |
| [Agents and channels](learning/agents.md) | Build focused agents, channels, memory, run history, and harnesses |
| [Projects](learning/projects.md) | Work safely with real folders, permissions, proposals, and commands |
| [Automation and MCP](learning/automation.md) | Use MCP and repeatable workflows without losing control |
| [Plugins](learning/plugins.md) | Evaluate, manage, and start writing plugins |
| [Mastery](learning/mastery.md) | Combine the habits into a durable power-user workflow |

## A one-paragraph mental model

A **vault** is a folder of Markdown files on disk — that folder *is* your
knowledge base, and it is the source of truth. When Bethink opens a vault it
scans the folder and builds a fast in-memory index for search, links, and the
graph; that index is disposable and rebuilt on every open. You edit pages in a
block editor that round-trips to Markdown, and everything you do — creating a
page, linking, tagging — writes straight to files. Close Bethink and your
vault is just a tidy folder of `.md` files, exactly as portable as the day you
started.
