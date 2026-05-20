# MCP server

Narrative ships a standalone **Model Context Protocol (MCP)** server. Point an
MCP-aware client — Claude Desktop, Cursor, Claude Code, and others — at it, and
that client can search, read, walk the links of, and create pages in your
vault.

Where the [built-in AI assistant](ai.md) brings a model *into* Narrative, the
MCP server does the reverse: it exposes your vault *to* the tools you already
use.

## How it works

The server lives at `src/mcp.ts` and runs as its own process, separate from the
Narrative app. When it starts it:

1. Finds the **most-recently-used vault** (the same one Narrative opens on
   launch).
2. Builds its own in-memory index of that vault.
3. Serves MCP requests over stdio.

Because every change is written straight to a `.md` file, anything the server
creates appears live in a running Narrative app — its filesystem watcher picks
the new file up immediately.

> Open a vault in Narrative at least once before using the MCP server, so it
> knows which folder to serve.

## Registering it

The launch command is `bun` with the absolute path to `src/mcp.ts`:

```json
{
  "mcpServers": {
    "narrative": {
      "command": "bun",
      "args": ["/absolute/path/to/narrative/src/mcp.ts"]
    }
  }
}
```

Add that to your client's MCP configuration. **Settings → AI** inside Narrative
shows a ready-made snippet with the correct path already filled in — copy it
straight into your client.

## Tools

The server exposes five tools:

| Tool | What it does |
|---|---|
| `search-pages` | Full-text search across the vault. Supports the same operators as in-app search — `tag:`, `title:`, `content:`, and `/regex/`. |
| `get-page` | Fetch a page's full Markdown by id or by exact (case-insensitive) title. |
| `list-pages` | List every page — id, title, path, and parent id. |
| `page-links` | The backlinks *and* outgoing links for a page. |
| `create-page` | Create a new page — a real `.md` file. `[[wiki links]]` and `#tags` in the body are indexed automatically. |

## Resources

It also publishes two read-only resources:

| Resource | Contents |
|---|---|
| `narrative://recent` | The 15 most recently updated pages, as Markdown. |
| `narrative://tags` | Every tag in the vault with its page count. |

## What you can do with it

- Ask Claude Desktop to "find my notes on the Q3 roadmap and summarise them."
- Have Claude Code draft a page from a conversation and write it into your
  vault with `create-page`.
- Let an assistant walk your link graph — "what connects to my *Architecture*
  page?" — using `page-links`.

## Next

- **[AI assistant](ai.md)** — the in-app chat that works the other direction.
- **[Plugins](plugins.md)** — extend Narrative itself.
