# Vaults

A **vault** is a folder of Markdown files. That folder is your entire knowledge
base, and it is the single source of truth — Narrative is a viewer and editor
for it, not a container that owns it.

## What's in a vault

- **Every `.md` file is a page.** The filename (minus `.md`) is the page title.
- **Every subfolder is a folder** in the sidebar tree.
- **`.narrative/ui.json`** is a small *sidecar* file — see below.

That's it. Point Narrative at any folder of Markdown — a folder you already
keep, a git repository, a synced directory — and it becomes a working vault
with nothing to import and nothing to convert.

## The index is derived, the files are not

When you open a vault, Narrative:

1. **Scans** the folder for `.md` files and subfolders.
2. **Builds an in-memory index** (an SQLite database held only in RAM) of
   pages, the `[[links]]` between them, the `#tags` in them, and a full-text
   search table.
3. **Starts a filesystem watcher** so changes made *outside* Narrative show up
   live.

The index makes search, backlinks, and the graph instant. But it is **purely
derived** — it is rebuilt from scratch every time you open the vault. If you
delete it (you can't, it only lives in memory), nothing is lost. Your knowledge
is the files; the index is just an accelerator.

This is the key guarantee: **nothing about your vault is proprietary.** Close
Narrative and you have a tidy folder of Markdown, exactly as portable as before.

## Writes go to disk first

Every change you make — creating a page, editing a body, renaming, moving,
deleting — is **written to the filesystem first**, and only then reflected in
the index. Creating a page writes a new `.md` file. Renaming a page renames the
file. Moving a page to another folder moves the file on disk. Deleting a folder
removes the directory.

Because the files are always authoritative, Narrative can never drift out of
sync with what's on disk.

## Live filesystem sync

A recursive watcher folds in any change made to the vault folder while
Narrative is open — by git pulling a branch, by another editor, or by a sync
client like iCloud, Dropbox, or Syncthing. New files appear, edited files
refresh in open editors, and the watcher correlates renames and moves so links
and history survive them.

This means you can keep your vault in version control or a sync folder and edit
it from anywhere; Narrative simply keeps up.

## The sidecar

Some things aren't part of a note's content but still belong to the vault:
which pages are **pinned**, their **icons**, manual **sort order**, and which
pages are **archived** or marked as **templates**.

Narrative keeps this app-level metadata in a single small file,
**`.narrative/ui.json`**, inside the vault. It is keyed by vault-relative path,
so it travels with the vault — but it never touches your Markdown. Your `.md`
files stay clean: they contain only what you wrote.

## Switching vaults

You can have many vaults and switch between them without restarting:

- **Open Vault…** (`⌘O`) — pick an existing folder.
- **New Vault…** — create a folder; if it's empty, Narrative seeds it with a
  short welcome page so it doesn't open blank.
- **Switch Vault…** — jump to a recent vault.

These live in the **File** menu and the command palette (`⌘K`). The list of
recent vaults is remembered between launches; on startup Narrative reopens the
vault you used last.

## First run

The very first time you launch Narrative — with no vaults yet — it creates a
default vault and seeds it with two pages, *Welcome to Narrative* and *Ideas*,
so you have something real to explore. Opening an existing non-empty folder as
a vault never adds or changes files.

## Optional cloud sync (Stohr)

Narrative can connect to a [Stohr](https://github.com/wess/stohr) instance —
self-hostable cloud storage — from **Settings**. This is optional: a vault is
fully functional as a local folder, and the simplest way to sync is still to
keep the folder in git or any file-sync service.

## Next

- **[The editor](editor.md)** — writing pages.
- **[Search & organisation](search.md)** — folders, tags, daily notes.
- **[Tutorial: Getting started](tutorial/gettingstarted.md)** — open your first
  vault step by step.
