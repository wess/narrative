# Building & distribution

Narrative is a [butter](../butter/) desktop app built with
**[Bun](https://bun.sh)**. This guide covers running it in development,
compiling a binary, and bundling it for distribution.

## Prerequisites

- **[Bun](https://bun.sh)** — the runtime, package manager, and bundler.
  Narrative is Bun-only; there is no npm/Node build path.

Install dependencies once:

```bash
bun install
```

## Development

```bash
bun run dev
```

This runs `butter dev`: it compiles the native shim, opens the app in a native
window, and watches your source for changes with **hot reload**. Edit a file in
`src/` and the app updates in place.

On first launch, with no vaults yet, Narrative seeds a starter vault so you have
content to work with immediately.

## Quality checks

Narrative's quality gate is type-checking, linting, and tests:

```bash
bun run typecheck   # tsc --noEmit — full type check
bun run check       # biome — lint + format check on src/
bun run tidy        # biome — auto-fix what it can
bun run test        # the test suite under test/
```

Run `typecheck`, `check`, and `test` before committing — the same three
[CI](../.github/workflows/ci.yml) runs on every push. Formatting is **Biome**:
2-space indent, 100-column lines, double quotes, semicolons, trailing commas.

## Building a binary

```bash
bun run build
```

This runs `butter compile` and produces a **single-file binary** at
`dist/narrative` — the whole app, bundled webview included, in one executable.
It needs no separate runtime to run, and it targets whichever OS you build on.

## Bundling per platform

```bash
bun run bundle
```

This runs `butter bundle` and wraps the compiled binary in a native
application package for the OS you're on:

| Platform | `bun run bundle` produces |
|---|---|
| macOS | `dist/Narrative.app` — an `.app` bundle with `Info.plist` |
| Linux | `dist/Narrative.AppDir` — an AppDir with a `.desktop` file |
| Windows | `dist/Narrative/` — a folder with `Narrative.exe` |

The bundle's identity comes from `butter.yaml`:

```yaml
bundle:
  identifier: io.wess.narrative
  category: public.app-category.productivity
```

## Packaging an installer

```bash
bun run package
```

This runs `butter package`, which turns the bundle into a distributable
artifact:

| Platform | `bun run package` produces |
|---|---|
| macOS | a disk image / installer from the `.app` |
| Linux | `dist/Narrative-x86_64.AppImage` (`appimagetool` is fetched automatically) |
| Windows | `dist/Narrative-setup.exe` if NSIS is installed, otherwise a portable `.zip` |

## Cross-platform builds

Narrative builds on **macOS, Linux, and Windows** — the native webview is the
OS's own (WKWebView, WebKitGTK, WebView2), so there's no bundled browser on
any platform.

`butter compile` accepts a `--target darwin|linux|windows` flag, but a real
cross-compile needs the target platform's SDK and webview headers. In
practice that means **building each platform's artifact on that platform**
(or in a matching VM / CI runner). Each OS needs a C compiler and its webview
development package — `butter doctor` checks for them and tells you what's
missing:

```bash
bunx butter doctor
```

Linux additionally needs `libwebkit2gtk-4.1-dev` and `libgtk-3-dev`; Windows
needs the WebView2 runtime and MSVC (or MinGW). See butter's own
[CLI reference](../butter/docs/reference/cli.md) for the full matrix.

## App configuration

`butter.yaml` is the app manifest — window defaults, the build entry points,
and bundle metadata:

```yaml
window:
  title: "Narrative"
  width: 1340
  height: 860
  minWidth: 760
  minHeight: 480

build:
  entry: src/app/index.html   # the webview entry
  host: src/host/index.ts     # the host process entry
```

## The MCP server

The [MCP server](mcp.md) is a separate entry point. It isn't part of the app
bundle — it's run directly:

```bash
bun src/mcp.ts
```

See **[MCP server](mcp.md)** for registering it with an AI client.

## Project layout

```
src/
  mcp.ts       standalone MCP server
  shared/      types + the typed IPC channel contract
  host/        the Bun host process
    vault/     scan, in-memory index, file I/O, watcher, recents, sidecar
    plugins/   plugin scan/store, IPC handlers, the sample plugin
  app/         the React webview
    state/     the external store + actions
    lib/       markdown <-> blocks, math, tree/tag/date helpers
    components/ the UI
    plugins/   the plugin runtime — Obsidian API, loader, vault adapter
```

Narrative vendors two of its own libraries into the repo:

- **[butter](../butter/)** — the desktop framework (Bun host + native webview).
- **[basket](../basket/)** — the `@basket/*` packages used as the standard
  library (`db`, `ipc`, `ui`, `ai`, `menu`, `secrets`, `store`, …).

When working inside `butter/` or `basket/`, follow that subproject's own
conventions and docs.

## Next

- **[Overview](overview.md)** — how the two-process architecture fits together.
- **[Plugins](plugins.md)** — extend the app you just built.
