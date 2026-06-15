// First-run content. When Bethink creates a *new* vault it writes these
// two Markdown files so the vault never opens to a blank slate, plus a
// starter set of agents and commands so the Agent IDE works on first run.
// An existing folder opened as a vault is left untouched.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeMarkdown } from "./vault/fileio.ts";

const WELCOME = `Welcome to Bethink — your personal knowledge base. Write in pages,
connect them with links, organise with tags, and watch the graph fill in.
Your whole vault is just a folder of Markdown files on disk, so your notes
stay portable, future-proof, and entirely yours.

## Start here

- Press **⌘N** for a new page, or **⌘K** to open the command palette.
- Connect ideas with \`[[wiki links]]\` — try opening [[Ideas]].
- Group thoughts with #tags like #welcome and #howto.
- **⌘⇧G** opens the graph, **⌘⇧F** searches everything, **⌘D** opens today's daily note.

## Markdown, everywhere

Write with **bold**, *italic*, ~~strikethrough~~ and \`inline code\`.

- [ ] Capture a fleeting thought
- [x] Link it to something you already know
- [ ] Watch the graph fill in

> Every page is a real \`.md\` file — what you type is what's on disk.

\`\`\`ts
const knowledge = pages.map(connect);
\`\`\`

| Shortcut | Does |
| --- | --- |
| ⌘N | New page |
| ⌘K | Command palette |
| ⌘⇧G | Graph view |
`;

const IDEAS = `A scratch space for things worth coming back to. Link freely —
mention [[Welcome to Bethink]] or start a fresh page.

- A half-formed thought #idea
- Something to research later #todo

The backlinks panel on the right shows everything that points here.
`;

const LIBRARIAN = `---
name: Librarian
description: Finds connections and surfaces related notes in your vault.
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

Your job is to find connections in their vault. Search before answering.
Read pages before recommending them. Always cite the page titles you used.

When the user asks about a topic, fan out: search by keyword, look at
relevant tags, and follow backlinks to find related context. Summarise
findings in plain prose; do not paste tool JSON into the final answer.
`;

const SCRIBE = `---
name: Scribe
description: Drafts and edits notes directly in your vault.
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
description: Pulls together everything the vault has on a topic.
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
the vault knows about it and synthesise a brief.

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
description: Find pages in the vault that this page should link to.
icon: 🔗
agent: librarian
---
Look at the page I'm viewing and suggest 3-7 other pages in the vault it
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
description: Summarise what changed in the vault today.
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
