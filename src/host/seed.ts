// First-run content. When Bethink creates a *new* vault it writes these
// two Markdown files so the vault never opens to a blank slate, plus a
// starter set of agents and commands so the Agent IDE works on first run.
// An existing folder opened as a vault is left untouched.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeMarkdown } from "./vault/fileio.ts";

const WELCOME = `Welcome to Bethink. This is a simple place to write notes,
connect them, and find them again later.

Your notes are plain Markdown files in a normal folder on your computer. Bethink
gives you a nicer writing surface, but the files stay yours.

## 1. Write a note

Click the title above and rename this page. Then type below it.

- Use **⌘N** for a new note.
- Use the **Daily note** button for today's running log.
- Bethink saves as you write.

## 2. Link notes together

Type \`[[Ideas]]\` to link to the Ideas page. Links help one note point to
another without forcing everything into folders.

Try this: open [[Ideas]], add one sentence, then come back here.

## 3. Search your notes

Use the search box in the sidebar to find text across your notes. Search for
\`idea\` after you edit the Ideas page.

That is enough to start: write, link, search. The AI assistant, graph, tags,
plugins, and workflows are there when you need more.
`;

const IDEAS = `A scratch space for things worth coming back to. Link freely —
mention [[Welcome to Bethink]] or start a fresh page.

- A half-formed thought #idea
- Something to research later #todo

The backlinks panel on the right shows everything that points here.
`;

const LIBRARIAN = `---
name: Librarian
description: Finds connections and surfaces related notes.
icon: 📚
tools:
  - vault.search
  - vault.semanticsearch
  - vault.read
  - vault.backlinks
  - vault.outgoing
  - vault.tags
  - vault.tagpages
  - vault.open
---
You are the Librarian inside Bethink — the user's personal knowledge base.

Your job is to find connections in their notes. Search before answering.
Read pages before recommending them. Always cite the page titles you used.

When the user asks about a topic, fan out: search by keyword, look at
relevant tags, and follow backlinks to find related context. Summarise
findings in plain prose; do not paste tool JSON into the final answer.
`;

const SCRIBE = `---
name: Scribe
description: Drafts and edits notes directly.
icon: ✍️
tools:
  - vault.search
  - vault.read
  - vault.create
  - vault.append
  - vault.update
  - vault.daily
  - vault.open
---
You are the Scribe inside Bethink. You help the user write — drafting
new pages, appending to existing ones, and tidying up prose.

Before writing into a page, read it first (vault.read) so you don't
overwrite context. Prefer vault.append when adding to a note; reserve
vault.update for full rewrites. After you change a page, open it
(vault.open) so the user sees the result.
`;

const RESEARCHER = `---
name: Researcher
description: Pulls together everything the notes have on a topic.
icon: 🔬
tools:
  - vault.search
  - vault.semanticsearch
  - vault.read
  - vault.tags
  - vault.tagpages
  - vault.create
---
You are the Researcher inside Bethink. Given a topic, gather everything
the notes contain on it and synthesise a brief.

Plan: search broadly first, read the most relevant pages, then write a
concise brief. If the user asks, save it as a new page with vault.create.
Cite source pages by title.
`;

const CMD_SUMMARIZE = `---
name: Summarize this page
description: 3-4 sentence summary of the current page.
icon: 📝
agent: librarian
---
Summarise the page I'm currently viewing in 3-4 plain sentences. Be
concrete — capture the key claims and any decisions. No preamble.
`;

const CMD_LINKRELATED = `---
name: Suggest related links
description: Find pages that this page should link to.
icon: 🔗
agent: librarian
---
Look at the page I'm viewing and suggest 3-7 other pages it
should link to (using [[Title]]). For each, say in one line why the link
makes sense. Don't edit the page — just suggest.
`;

const CMD_TODO = `---
name: Extract todos
description: Pull every unchecked task from this page into a clean list.
icon: ✅
agent: scribe
---
Read the page I'm currently viewing and extract every unchecked task
(\`- [ ]\` items, "todo:" lines, action verbs). Reply with a clean
bulleted list. If you find nothing, say so.
`;

const CMD_DAILYWRAP = `---
name: Daily wrap-up
description: Summarise what changed in the notes today.
icon: 🌙
agent: researcher
---
Look at pages updated today. Summarise what changed in 4-6 bullets. Group
by theme. If nothing changed, say so plainly.
`;

const seedAgents = async (root: string): Promise<void> => {
  const agentsDir = join(root, ".narrative", "agents");
  const commandsDir = join(root, ".narrative", "commands");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(commandsDir, { recursive: true });
  await Bun.write(join(agentsDir, "librarian.md"), LIBRARIAN);
  await Bun.write(join(agentsDir, "scribe.md"), SCRIBE);
  await Bun.write(join(agentsDir, "researcher.md"), RESEARCHER);
  await Bun.write(join(commandsDir, "summarize.md"), CMD_SUMMARIZE);
  await Bun.write(join(commandsDir, "linkrelated.md"), CMD_LINKRELATED);
  await Bun.write(join(commandsDir, "todo.md"), CMD_TODO);
  await Bun.write(join(commandsDir, "dailywrap.md"), CMD_DAILYWRAP);
};

export const seedVault = async (root: string): Promise<void> => {
  await writeMarkdown(root, "Welcome to Bethink.md", WELCOME);
  await writeMarkdown(root, "Ideas.md", IDEAS);
  await seedAgents(root);
};
