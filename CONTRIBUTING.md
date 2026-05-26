# Contributing to Narrative

Thanks for your interest in Narrative — a native, file-backed knowledge base.
This guide covers what you need to develop, test, and submit changes.

## Prerequisites

Narrative runs on **[Bun](https://bun.sh)** — it is Bun-only, with no
npm/Node build path. Install Bun first, then:

```bash
bun install
bun run dev        # opens the app with hot reload
```

## Quality gate

Every change must pass all three checks before it's merged — the same three
that [CI](.github/workflows/ci.yml) runs:

```bash
bun run typecheck   # tsc --noEmit — strict, no type errors
bun run check       # biome — lint + format
bun run test        # the test suite under test/
```

`bun run tidy` auto-fixes most formatting. New behaviour should come with
tests; the round-trip, parsing, and search tests in `test/` show the pattern.

## Architecture

Before changing much, read **[docs/overview.md](docs/overview.md)** — Narrative
runs as two processes (a Bun host and a React webview) that talk only over the
typed IPC contract in `src/shared/channels.ts`. The vault is a folder of
Markdown files and is always the source of truth; the SQLite index is derived
and disposable. **[docs/building.md](docs/building.md)** has the full layout.

## Conventions

These are enforced project-wide — match them:

- **Functional, no classes.** Use factory functions and tagged objects. The
  only exception is the Obsidian-compatible plugin API, where the upstream
  contract mandates classes.
- **Filenames are lowercase** with no spaces, hyphens, or underscores.
  Multi-word concepts become a folder: `host/vault/buildindex.ts`, never
  `host/vault-build-index.ts`.
- **Bun-native.** Prefer `Bun.file`, `Bun.write`, `bun:sqlite`, `Bun.spawn`
  over `node:*` equivalents. Bun loads `.env` automatically.
- **Explicit import extensions** (`./foo.ts`, `./bar.tsx`) — the project uses
  `verbatimModuleSyntax`, so use `import type` for type-only imports.
- **Biome** for lint and format: 2-space indent, 100-column lines, double
  quotes, semicolons, trailing commas. No Prettier, no ESLint.
- **Accessibility lint rules are on.** When an interactive element genuinely
  can't satisfy a rule, suppress it with a `biome-ignore` that explains why —
  don't disable the rule globally.
- Comments explain *why*, not *what*. Keep them sparse.

## Crossing the host ↔ webview boundary

Adding a feature that spans both processes? Declare the channel in
`src/shared/channels.ts` first, then add a `handle(...)` on the host and an
`invoke(...)` / `subscribe(...)` in the webview. The boundary stays fully
type-checked.

## Commits & pull requests

- Keep commits focused; write clear messages in the imperative mood.
- Make sure the quality gate passes before opening a PR.
- Describe what changed and why; link any related issue.
- Update the relevant docs under `docs/` and add an entry to
  [CHANGELOG.md](CHANGELOG.md) under `[Unreleased]`.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, what happened, and
your OS. For a crash, include any output from the terminal running
`bun run dev`.
