# Changelog

All notable changes to Narrative are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to adhere to [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-06-04

### Added

- App icon (`assets/icon.icns`) wired through `window.icon`, shown on the
  bundled `.app`, in the Dock, and in Finder.
- Signed + notarized macOS distribution: a `release.yml` workflow that
  compiles, bundles, signs with a Developer ID Application certificate
  (hardened runtime + JIT entitlements), notarizes, staples, and publishes a
  DMG — installable without the "unidentified developer" Gatekeeper warning —
  plus a Homebrew cask.

- **Stohr vault sync** — a two-way reconcile of the vault folder with a
  [Stohr](https://github.com/wess/stohr) account. Files are pushed and pulled
  on launch, after connecting, on a timer, and via a **Sync now** button in
  Settings → Stohr; conflicting edits keep both copies. See
  [docs/stohr.md](docs/stohr.md).
- **Image attachments** — paste an image into a page and it's saved into the
  vault's `attachments/` folder; the Markdown stores a portable relative path.
- **External-edit conflict handling** — when a page changes on disk while the
  editor holds unsaved edits, a banner offers *Keep my version* or *Load from
  disk* instead of silently overwriting.
- **Test suite** — `bun run test` covers the Markdown ↔ block round-trip,
  link/tag parsing, and search operators.
- **Cross-platform packaging** — a `bun run package` script and documentation
  for building on macOS, Linux, and Windows.
- Project hygiene: `CONTRIBUTING.md`, this changelog, and a GitHub Actions CI
  workflow that runs the type-check, linter, and tests.

### Changed

- Accessibility lint rules are enabled again; interactive elements (tabs, tree
  rows, the editor surface) gained proper keyboard and ARIA support.

## [0.1.0]

### Added

- Initial release: a native desktop knowledge base where every page is a plain
  Markdown file in a folder you own.
- File-backed vaults with a live filesystem watcher and a recent-vaults
  switcher.
- A Notion-style block editor that round-trips to Markdown — headings, lists,
  to-dos, quotes, callouts, code, math (KaTeX), tables, images, page embeds,
  and YAML page properties.
- `[[Wiki links]]` with autocomplete, backlinks and outgoing-links panels,
  hover previews, and a global / local graph view.
- Folders, nested `#tags`, ranked full-text search with `tag:` / `title:` /
  `content:` / `/regex/` operators, daily notes, pinning, archive, templates,
  and Markdown export.
- A streaming AI assistant with current-page and whole-vault (RAG) grounding,
  page summarisation, and support for Anthropic, OpenAI, Ollama, Ollama Cloud,
  and any OpenAI-compatible provider.
- A standalone Model Context Protocol server exposing the vault to AI clients.
- An Obsidian-compatible plugin system.

[Unreleased]: https://github.com/wess/narrative/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/wess/narrative/releases/tag/v0.1.0
