# Course 5 — AI in Bethink

Goal: use AI as a grounded assistant for your notes, not as an unchecked source
of truth.

## Lesson 1: Pick the right provider

Bethink supports hosted, local, and OpenAI-compatible providers.

| Provider style | Good for | Watch out for |
|---|---|---|
| Hosted | Strong reasoning, low setup. | API keys and usage cost. |
| Local Ollama | Privacy and offline work. | Model quality and machine speed. |
| Ollama Cloud | Hosted Ollama models. | API key required. |
| OpenAI-compatible | Flexibility across providers. | You must know the base URL and model. |

Use **Settings -> AI -> Test** after configuring a provider. Do not troubleshoot
prompts until the provider connection is known to work.

## Lesson 2: Choose the right grounding mode

The chat drawer has two important context choices:

- **Use current page**: best when you are editing or reviewing one page.
- **Search my vault**: best when the answer should draw from many pages.

Ask yourself: "Should the model read this page, the whole vault, or neither?"

Examples:

| Goal | Context |
|---|---|
| Rewrite a paragraph. | Current page. |
| Find prior decisions about pricing. | Vault search. |
| Brainstorm names. | No vault context needed. |
| Compare meeting notes. | Vault search, then inspect cited pages. |

## Lesson 3: Ask grounded questions

Weak prompt:

> What should I do about onboarding?

Better prompt:

> Search my vault for onboarding notes. Summarize the top three recurring
> problems, cite the page titles, and separate evidence from guesses.

Strong prompts include:

- The scope.
- The desired output shape.
- A request for citations.
- A request to say when evidence is missing.

## Lesson 4: Use semantic retrieval when keyword search is not enough

Keyword retrieval matches exact words. Semantic retrieval matches meaning. Use
semantic retrieval when:

- You ask conceptual questions.
- Your notes use inconsistent vocabulary.
- You want related ideas, not exact terms.

Use keyword retrieval when:

- You know the exact phrase.
- You need predictable matching.
- Your provider does not support embeddings.

## Lesson 5: Build an AI review habit

Good AI workflows are narrow and repeatable.

Try these:

### Summarize a page

Prompt:

```text
Summarize this page in five bullets. Keep decisions, risks, and next actions
separate.
```

### Extract decisions

Prompt:

```text
Find decisions in this page. For each one, include the decision, reason, date
if present, and open follow-up.
```

### Find contradictions

Prompt:

```text
Search my vault for notes about <topic>. Identify contradictions or stale
assumptions. Cite page titles.
```

### Create a project brief

Prompt:

```text
Using the linked notes and current page, draft a project brief with goal,
constraints, stakeholders, risks, and next actions.
```

## Lesson 6: Verify AI output

Every serious AI answer should be checked:

- Did it cite the right pages?
- Did it invent facts not present in the vault?
- Did it confuse old notes with current decisions?
- Did it separate evidence from inference?
- Did it give a concrete next action?

If the answer matters, open the cited pages.

## Exercises

1. Configure an AI provider and run the Test button.
2. Ask one question using current-page context.
3. Ask one question using vault search.
4. Ask for citations and verify them.
5. Turn one useful answer into a normal Bethink page.

## Power-user checkpoint

You are using AI well when:

- You choose context intentionally.
- You ask for source titles.
- You verify important answers.
- You save durable results back into the vault.
- You know when to use an agent instead of plain chat.

## Next

Continue to [Agents, channels, and memory](agents.md).
