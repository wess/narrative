# MCP server

Bethink ships a standalone **Model Context Protocol (MCP)** server. Point an
MCP-aware client at it, and that client can search, read, walk links, inspect
agents/channels/projects, read memory, manage agent harness scenarios, and view
Bethink's table/canvas data.

Where the [built-in AI assistant](ai.md) brings a model *into* Bethink, the
MCP server does the reverse: it exposes your vault *to* the tools you already
use.

## How it works

The server lives at `src/mcp.ts` and runs as its own process, separate from the
Bethink app. When it starts it:

1. Finds the **most-recently-used vault** (the same one Bethink opens on
   launch).
2. Builds its own in-memory index of that vault.
3. Serves MCP requests over stdio.

By default the server is read-only. Write tools require
`BETHINK_MCP_ALLOW_WRITES=true` in the MCP server environment.

> Open a vault in Bethink at least once before using the MCP server, so it
> knows which folder to serve.

## Registering it

The launch command is `bun` with the absolute path to `src/mcp.ts`:

```json
{
  "mcpServers": {
    "bethink": {
      "command": "bun",
      "args": ["/absolute/path/to/bethink/src/mcp.ts"]
    }
  }
}
```

Add that to your client's MCP configuration. **Settings → AI** inside Bethink
shows a ready-made snippet with the correct path already filled in — copy it
straight into your client.

## Permissions

Read tools work by default. Project file tools also respect each project's
**Read files** permission. Write tools return a structured `writes_disabled`
error until you opt in:

```json
{
  "mcpServers": {
    "bethink": {
      "command": "bun",
      "args": ["/absolute/path/to/bethink/src/mcp.ts"],
      "env": {
        "BETHINK_MCP_ALLOW_WRITES": "true"
      }
    }
  }
}
```

## Tools

The server exposes these tools:

| Tool | What it does |
|---|---|
| `server-status` | Shows the active vault and permission flags. |
| `refresh-index` | Rebuilds the MCP server's in-memory vault index from disk. |
| `search-pages` | Full-text search across the vault. Supports the same operators as in-app search — `tag:`, `title:`, `content:`, and `/regex/`. |
| `search-all` | Unified search across pages, agents, channels, projects, memory, captures, runs, transcripts, and proposals. |
| `get-page` | Fetch a page's full Markdown by id or by exact (case-insensitive) title. |
| `list-pages` | List pages — id, title, path, and parent id. |
| `page-links` | The backlinks *and* outgoing links for a page. |
| `create-page` | Create a new page. Requires `BETHINK_MCP_ALLOW_WRITES=true`. |
| `list-agents` | List Bethink agents, model/provider hints, and tool allowlists. |
| `list-channels` | List channels, member agents, linked projects, context, and briefs. |
| `channel-messages` | List recent durable transcript messages for a channel. |
| `list-projects` | List registered project folders. |
| `project-tree` | Read a project's visible file tree. |
| `project-read-file` | Read a text file inside a registered project folder. |
| `project-diff-file` | Show the latest saved before-and-after view for a project file. |
| `project-run-history` | List recent stored command runs for a project. |
| `agent-run-history` | List recent durable agent runs across agents and channels. |
| `harness-scenarios` | List saved agent harness scenarios. |
| `harness-create-scenario` | Create a replayable agent harness scenario. Requires `BETHINK_MCP_ALLOW_WRITES=true`. |
| `harness-run-history` | List recorded harness results. |
| `harness-record-run` | Record a harness result with score, stop reason, and loop iterations. Requires `BETHINK_MCP_ALLOW_WRITES=true`. |
| `project-review-queue` | List pending project write proposals awaiting user review. |
| `project-propose-file` | Queue a proposed project file change for in-app review. Requires `BETHINK_MCP_ALLOW_WRITES=true`. |
| `memory-list` | List global or channel memory. |
| `table-view` | Return the table view across pages, projects, agents, and channels. |
| `canvas-view` | Return canvas nodes and edges. |
| `capture-web` | Capture a URL into a Markdown page. Requires `BETHINK_MCP_ALLOW_WRITES=true`. |
| `capture-history` | List recent web captures and the pages they created. |

## Resources

It also publishes two read-only resources:

| Resource | Contents |
|---|---|
| `bethink://recent` | The 15 most recently updated pages, as Markdown. |
| `bethink://tags` | Every tag in the vault with its page count. |

## What you can do with it

- Ask an MCP-aware client to find your notes on the Q3 roadmap and summarise
  them.
- Draft a page from a conversation and write it into your vault with
  `create-page` after enabling MCP writes.
- Let an assistant walk your link graph — "what connects to my *Architecture*
  page?" — using `page-links`.
- Let an external tool inspect project context without granting write access.

## Next

- **[AI assistant](ai.md)** — the in-app chat that works the other direction.
- **[Plugins](plugins.md)** — extend Bethink itself.
