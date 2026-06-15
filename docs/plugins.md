# Plugins

Bethink has an **extensible plugin system**. Plugins add commands, views,
ribbon icons, settings, and Markdown processors — and the API is
**Obsidian-compatible**, so the existing world of Obsidian plugin knowledge and
much of its code applies directly.

This page covers using and managing plugins. To *write* one, see the
**[plugin tutorial](tutorial/plugin.md)**.

## What a plugin is

A plugin is a folder containing:

| File | Required | Purpose |
|---|---|---|
| `manifest.json` | Yes | Plugin metadata — id, name, version, … |
| `main.js` | Yes | The plugin code, as a CommonJS module |
| `styles.css` | No | CSS injected while the plugin is enabled |
| `data.json` | No | The plugin's persisted settings/data |

A minimal `manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "What this plugin does.",
  "author": "Your Name",
  "isDesktopOnly": false
}
```

Plugins are **app-global** — installed once and shared across every vault, not
stored per-vault.

## Managing plugins

Everything lives under **Settings → Plugins** (`⌘,`):

- **Install** a plugin folder you've downloaded.
- **Enable / disable** a plugin — loaded and torn down live, no restart.
- **Remove** a plugin entirely.
- **Open the plugins folder** in your file manager, to add or edit plugins by
  hand.

A built-in **Sample Plugin** ships enabled on first run. It's a real, working
plugin that exercises the whole API — read its code in the plugins folder as a
reference.

> **No in-app plugin browser (v1).** Plugins are installed by adding a folder,
> not from a searchable registry, and there's no automatic update check. This
> is a deliberate v1 boundary — get a plugin folder however you like (download,
> `git clone`, build your own) and drop it in.

## What a plugin can contribute

A plugin's `onload` can register any of:

- **Commands** — they appear in the command palette (`⌘K`), so users run them
  the same way as built-in commands.
- **Ribbon icons** — buttons in the top bar.
- **Status-bar items** — text or indicators in the status bar.
- **Settings tabs** — a panel under Settings, built with the `Setting` API.
- **Custom views** — plugin-rendered panels.
- **Markdown processors** — post-processors that transform rendered Markdown,
  and code-block processors that render a fenced block (e.g. ` ```mermaid `)
  however the plugin likes.

Everything a plugin registers is **torn down cleanly when it's disabled** — no
leftover commands, styles, or listeners.

## The plugin API

A plugin's `require("obsidian")` resolves to Bethink's API module. The
surface includes, among much else:

- `Plugin`, `Component` — the lifecycle base classes.
- `App`, `Vault` (with `TFile` / `TFolder`), `Workspace`, `MetadataCache` —
  access to the vault and workspace.
- `Notice`, `Modal`, `Menu` — UI primitives.
- `Setting`, `PluginSettingTab` — settings UIs.
- `SuggestModal`, `FuzzySuggestModal` — pickers.
- `MarkdownRenderer`, `Editor` — content rendering and editing.
- `requestUrl` — HTTP from plugin code (proxied via the host, so it isn't
  blocked by the webview's CORS rules).
- `setIcon`, a `moment`-style date library, and the `el.createDiv()` /
  `arr.first()` DOM helpers.

## The vault adapter

The plugin `Vault` and `MetadataCache` APIs are wired onto Bethink's **real
file-backed vault**. When a plugin calls `vault.read`, `vault.modify`,
`vault.create`, or `vault.delete`, it operates on actual `.md` files; the
`create` / `modify` / `rename` events fire from genuine filesystem activity.
Plugins written against Obsidian's vault model behave as expected.

## Where plugins run

Plugins run **inside the webview**, alongside the React UI. A failing plugin is
isolated — a bad `onload` is caught and reported in Settings without taking
down the app.

## Known limits

The compatibility layer is broad but not total. Be aware:

- **No Node in the webview.** Plugins that reach for `fs`, `child_process`, or
  other Node built-ins won't work. Use `vault.*` for files and `requestUrl`
  for HTTP.
- **Custom views** render in a single side panel rather than as freely
  arrangeable workspace leaves.
- **The `Editor` adapter is best-effort** over the block editor — most editing
  APIs work, but it isn't a byte-for-byte CodeMirror.
- **`parseYaml` is front-matter-grade**, not a full YAML parser.
- **Plugins are app-global**, shared across every vault.

## Next

- **[Tutorial: Writing your first plugin](tutorial/plugin.md)** — build one
  from scratch.
- **[MCP server](mcp.md)** — the other extension point.
