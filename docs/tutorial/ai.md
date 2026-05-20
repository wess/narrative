# Tutorial 5 — Using the AI assistant

Narrative has a built-in AI assistant that can answer questions grounded in
**your own notes**. In this tutorial you'll connect a provider and chat with a
model that actually knows what you've written.

## Step 1 — Open Settings

Press **`⌘,`** and go to the **AI** section.

## Step 2 — Choose a provider

Narrative works with five provider presets. Pick whichever suits you:

| Provider | Needs a key? | Good for |
|---|---|---|
| **Anthropic** | Yes | Hosted Claude models |
| **OpenAI** | Yes | Hosted GPT models + embeddings |
| **Ollama (local)** | No | Models running locally — fully offline |
| **Ollama Cloud** | Yes | Hosted open models |
| **OpenAI-compatible** | Optional | Groq, OpenRouter, LM Studio, vLLM, … |

If you just want to try it with **no API key and no cloud**, install
[Ollama](https://ollama.com), pull a model (`ollama pull llama3.2`), and choose
the **Ollama (local)** preset.

## Step 3 — Add your key (if needed)

For a hosted provider, paste your API key into the key field. Narrative stores
it in your **operating system's keychain** — never in a file in the vault — so
your vault stays safe to sync and commit.

Set the **model** if you want something other than the default, and the
**server URL** if your provider needs one (the *OpenAI-compatible* preset
requires you to supply both).

## Step 4 — Test the connection

Click **Test**. Narrative sends a tiny prompt and reports either success or the
exact error. Don't move on until this passes.

## Step 5 — Open the chat drawer

Press **`⌘J`**. The AI chat drawer slides in. Ask it anything — the answer
streams back as it's generated.

## Step 6 — Ground answers in the current page

Open one of your notes, then in the chat drawer turn on **Use current page**.

Now ask about *that note*:

- "Summarise this page."
- "What questions does this note leave open?"
- "Rewrite the second paragraph more concisely."

The model sees the page you're reading and answers about it specifically.

## Step 7 — Ask across your whole vault (RAG)

Turn on **Search my vault**. Now the assistant retrieves the most relevant
pages from your *entire vault* and answers from them.

Ask something that spans several notes — "what have I written about linking?"
or "summarise my project ideas." The answer **cites the pages it used**, and
you can click straight through to each source.

This works with **every provider out of the box** using keyword retrieval — no
extra setup.

## Step 8 — Upgrade to semantic search (optional)

Keyword retrieval matches words. **Semantic retrieval** matches *meaning* — it
finds relevant pages even when they don't share the question's exact wording.

To enable it:

1. In **Settings → AI**, turn on **Semantic index**.
2. Run the **re-index** action once. Narrative embeds every page as a vector.

Your provider must offer an **embeddings API** — OpenAI, Ollama, and Ollama
Cloud all do. After that, new and edited pages are re-embedded automatically in
the background. If embedding ever fails, RAG quietly falls back to keyword
search, so it always works.

## Step 9 — Summarise a page in one tap

Open the command palette (`⌘K`) and run **"Summarise current page with AI"**
for an instant plain-language summary of the note you're viewing.

## What you learned

- Connect a provider in **Settings → AI**; keys live in the OS keychain.
- **`⌘J`** opens the chat; **Use current page** grounds it in the open note.
- **Search my vault** answers from your whole vault (RAG) and cites its
  sources.
- The optional **semantic index** upgrades retrieval from keywords to meaning.

## Next

→ **[Tutorial 6 — Writing your first plugin](plugin.md)**
