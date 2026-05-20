# AI assistant

Narrative includes a streaming **AI chat assistant** that can ground its
answers in your own notes — the page you're reading, or your entire vault. It
is provider-agnostic: use a hosted model, a local one, or anything in between.

## Opening the assistant

Press `⌘J` to toggle the **chat drawer**. Type a question, send it, and the
answer streams back token by token. You can cancel a response mid-stream.

## Grounding answers in your vault

The drawer has two grounding toggles:

- **Use current page** — the page you're viewing is added to the model's
  context, so you can ask "summarise this", "what am I missing here?", or
  "rewrite this section" about the note in front of you.
- **Search my vault (RAG)** — Narrative retrieves the most relevant pages from
  your *whole* vault and feeds them to the model. Ask a question that spans
  many notes — "what did I decide about pricing?" — and the assistant answers
  from what you've actually written. **It cites the pages it used**, so you can
  click straight through to the source.

## RAG retrieval: keyword vs. semantic

"Search my vault" can retrieve pages two ways:

- **Keyword retrieval** — the default. Works with **every provider**, needs no
  setup, and uses the same ranked full-text search the rest of the app uses.
- **Semantic retrieval** — opt-in. When the **semantic index** is enabled,
  Narrative embeds your pages as vectors and retrieves by *meaning* (cosine
  similarity), so a question finds relevant pages even when they don't share
  the question's exact words.

Each answer tells you which mode produced its sources.

## Page summarisation

Beyond chat, there's one-tap **page summarisation** — from the command palette,
"Summarise current page with AI" produces a short plain-language summary of the
note you're viewing.

## Providers

Narrative speaks three wire protocols across five presets. Choose one in
**Settings → AI** (`⌘,`).

| Provider | Default model | API key | Notes |
|---|---|---|---|
| **Anthropic** | `claude-sonnet-4-6` | Required | Key from console.anthropic.com |
| **OpenAI** | `gpt-4o-mini` | Required | Key from platform.openai.com; embeddings supported |
| **Ollama (local)** | `llama3.2` | None | Talks to a local Ollama at `127.0.0.1:11434` |
| **Ollama Cloud** | `gpt-oss:120b` | Required | Key from ollama.com/settings/keys |
| **OpenAI-compatible** | *you choose* | Optional | Any OpenAI-API server — Groq, OpenRouter, Together, LM Studio, vLLM, … |

For each provider you can set the **model** and a per-provider **server URL**.
The *OpenAI-compatible* preset is a manual entry: you supply the base URL and
model yourself, and the key is optional (local servers usually need none).

## Where API keys live

API keys are stored in your **operating system's keychain** — macOS Keychain,
libsecret on Linux, Credential Manager on Windows — never in a plain file in
the vault or the app's config. The vault stays free of secrets, so it's safe to
commit and sync.

## Enabling the semantic index

In **Settings → AI**, turn on **Semantic index**, then run a one-time
**re-index** of the vault. Narrative asks your provider to embed every page and
stores the vectors in the in-memory index.

A few things to know:

- The provider must offer an **embeddings API**. Anthropic chat works for
  retrieval via keyword search, but for semantic retrieval pick a provider with
  embeddings (OpenAI, Ollama, and Ollama Cloud all ship embedding models).
- New and edited pages are **re-embedded automatically** in the background as
  you work — best-effort, and never blocking your save.
- If embedding ever fails (offline, missing key), RAG quietly falls back to
  keyword retrieval. It always works.

## Verifying your setup

**Settings → AI** has a **Test** button that sends a tiny prompt to your
configured provider and reports success or the exact error — the quickest way
to confirm a key and URL are right.

## Next

- **[MCP server](mcp.md)** — let external AI tools work with your vault.
- **[Tutorial: Using the AI assistant](tutorial/ai.md)** — connect a model
  step by step.
