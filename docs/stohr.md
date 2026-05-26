# Connecting to Stohr

[Stohr](https://github.com/wess/stohr) is **self-hostable cloud storage with a
federation layer**. Narrative can connect to a Stohr instance and act as its
companion editor — your Stohr files appear right in the sidebar alongside your
local pages.

This is **optional**. A Narrative vault is fully functional as a plain local
folder, and the simplest way to sync is still to keep that folder in git or any
file-sync service (see **[Vaults](vault.md)**). Connect to Stohr when you want
hosted, account-based storage you control.

## Opening the Stohr settings

Press `⌘,` to open **Settings** and select the **Stohr** tab. Everything below
happens there.

## The server URL

Narrative defaults to `https://stohr.io/api`. If you run your own Stohr
instance, enter its API URL instead — trailing slashes are trimmed
automatically. One Stohr connection is held per app.

## How authentication works

Stohr authenticates every request with a bearer token. Narrative obtains that
token in one of two ways, and once it has one:

- the **token is stored in your operating system's keychain** — never in a file
  in the vault or the app config;
- the **server URL and a cached snapshot of your account** are kept in the
  settings store, so the signed-in account still shows up even before the first
  network call (or on an offline launch).

You choose the sign-in method on the Stohr tab.

### Method 1 — Email & password

The default. Enter your Stohr **identity** (email or username) and **password**:

1. Narrative calls `POST /login` on your Stohr server.
2. If the account has **two-factor authentication**, the server returns an MFA
   challenge instead of a token. Narrative shows a code field — enter the code
   from your authenticator and it finishes sign-in via `POST /login/mfa`.
3. On success, Narrative verifies the token and stores the connection.

Your password is used only for that one sign-in call; it is never stored.

### Method 2 — Personal access token

If you'd rather not enter a password — or you want a scoped, revocable
credential — paste a **personal access token** (a `stohr_pat_…` string)
instead.

Create one in **Stohr → Settings → Apps**, then paste it into the token field
in Narrative. This is the recommended method for long-lived connections,
because you can revoke the token from Stohr at any time without changing your
password.

## Verifying a connection

Whenever Narrative connects — or re-checks an existing connection on launch —
it calls `/me` to confirm the token still works and fetch your account
details, and `/me/usage` for storage usage. Usage is a nice-to-have: if it
isn't available, the connection still counts as connected.

## Connection status

Once connected, the Stohr tab shows:

- your **account** — name, email, username, and an *owner* badge if you own the
  instance;
- your **storage usage** — used space against your quota (a quota of `0` means
  unlimited).

If a stored connection fails to verify later, Narrative reports the reason but
**keeps the token** — a `401` means you should re-authenticate, while a network
blip is transient and will recover on its own.

## Vault sync

Once connected, Narrative keeps the **whole vault folder** in two-way sync with
your Stohr account — every Markdown page and every attachment.

### When it syncs

- on launch, and whenever you switch vaults;
- right after you connect;
- automatically every couple of minutes;
- on demand — the **Sync now** button on the Stohr tab.

### How it works

The first sync creates a folder named after your vault on Stohr and uploads
everything into it. After that, each sync walks both sides and reconciles them
against a baseline recorded in `.narrative/stohr.json` inside the vault:

- a file changed only locally is **uploaded**;
- a file changed only on Stohr is **downloaded**;
- a file removed on one side is **removed on the other**;
- a brand-new file on either side is copied across.

Pulled files are written straight into the vault folder, so they appear in the
sidebar like any other page.

### Conflicts

If the **same file changed on both sides** since the last sync, Narrative keeps
your local copy and saves the Stohr copy next to it as
`<name> (stohr conflict <date>).md` — nothing is overwritten or lost. The Stohr
tab lists any conflicts after a manual sync so you can merge them by hand.

If a pulled change lands on a page you're **editing with unsaved work**, the
editor raises a conflict banner rather than discarding your edits — see
[Vaults](vault.md#external-edits-and-conflicts).

### What syncs

Markdown pages and common attachment types (`.png`, `.jpg`, `.gif`, `.webp`,
`.svg`, `.pdf`). The `.narrative/` folder — your pins, icons, and the sync
baseline — stays local and is never uploaded.

## Disconnecting

**Disconnect** on the Stohr tab removes the token from your keychain and clears
the cached account. Your local vault and its files are untouched — disconnecting
only ends the link to the Stohr server.

## Reference: the endpoints Narrative uses

Narrative talks to a small, fixed set of Stohr API endpoints. All requests are
made from the **host process**, so they aren't subject to the webview's CORS
rules.

| Endpoint | Purpose |
|---|---|
| `POST /login`, `POST /login/mfa` | Sign in, with optional two-factor |
| `GET /me`, `GET /me/usage` | Verify the token; fetch the account and storage usage |
| `GET /folders`, `POST /folders` | Walk and create the vault's folder tree |
| `GET /files`, `POST /files` | List files, and upload (or version) them |
| `GET /files/:id/download` | Download a file's bytes |
| `DELETE /files/:id` | Propagate a deletion to Stohr |

Authentication is an `Authorization: Bearer <token>` header, where the token is
either a `stohr_pat_…` personal access token or the JWT returned by sign-in.

## Next

- **[Vaults](vault.md)** — how local vaults and sync work.
- **[AI assistant](ai.md)** — another feature configured from Settings.
