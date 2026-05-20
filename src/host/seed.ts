// First-run content. When Narrative creates a *new* vault it writes these
// two Markdown files so the vault never opens to a blank slate. An existing
// folder opened as a vault is left untouched.

import { writeMarkdown } from "./vault/fileio.ts";

const WELCOME = `Welcome to Narrative — your personal knowledge base. Write in pages,
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
mention [[Welcome to Narrative]] or start a fresh page.

- A half-formed thought #idea
- Something to research later #todo

The backlinks panel on the right shows everything that points here.
`;

export const seedVault = async (root: string): Promise<void> => {
  await writeMarkdown(root, "Welcome to Narrative.md", WELCOME);
  await writeMarkdown(root, "Ideas.md", IDEAS);
};
