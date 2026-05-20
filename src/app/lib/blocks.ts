// The block model. Pages are still stored as markdown — `parseBlocks`
// turns a page body into editable blocks on load and `serializeBlocks`
// turns them back on save, so the whole host (links, tags, FTS, graph,
// export) keeps working against plain markdown.

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bulleted"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "divider"
  | "image"
  | "table"
  | "embed"
  | "callout"
  | "math"
  | "properties";

export type PageProp = { key: string; value: string };

export type Block = {
  id: string;
  type: BlockType;
  text: string; // inline markdown for text blocks; raw source for "code"/"math"
  checked?: boolean;
  lang?: string;
  src?: string;
  alt?: string;
  indent?: number;
  rows?: string[][]; // table: row 0 is the header
  target?: string; // embed: the `![[Page]]` target title
  calloutKind?: string; // callout: note | tip | warning | danger | success
  props?: PageProp[]; // properties: front-matter key/value pairs
};

let counter = 0;
export const newId = (): string => `b${++counter}-${Math.random().toString(36).slice(2, 8)}`;

export const emptyBlock = (type: BlockType = "paragraph"): Block => ({
  id: newId(),
  type,
  text: "",
});

export const TEXT_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bulleted",
  "numbered",
  "todo",
  "quote",
]);

export const LIST_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
  "bulleted",
  "numbered",
  "todo",
]);

// --- parsing --------------------------------------------------------------

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^(```|~~~)(.*)$/;
const HR_RE = /^\s*([-*_])\s*(\1\s*){2,}$/;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const EMBED_RE = /^!\[\[([^\]]+)\]\]\s*$/;
const MATH_RE = /^\$\$\s*$/;
const CALLOUT_RE = /^\[!(\w+)\][+-]?\s*(.*)$/;
const VALID_CALLOUTS = new Set(["note", "tip", "warning", "danger", "success", "info"]);

const isTableSep = (line: string): boolean =>
  /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");

const splitRow = (line: string): string[] =>
  line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export const parseBlocks = (md: string): Block[] => {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const push = (b: Omit<Block, "id">) => blocks.push({ id: newId(), ...b });
  let i = 0;

  // YAML-ish front matter: a `---` fence at the very top → properties block.
  if ((lines[0] ?? "").trim() === "---") {
    let j = 1;
    const props: PageProp[] = [];
    while (j < lines.length && (lines[j] ?? "").trim() !== "---") {
      const m = /^([^:]+):\s*(.*)$/.exec(lines[j] ?? "");
      if (m) props.push({ key: (m[1] ?? "").trim(), value: (m[2] ?? "").trim() });
      j++;
    }
    if (j < lines.length) {
      push({ type: "properties", text: "", props });
      i = j + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }

    if (MATH_RE.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !MATH_RE.test(lines[i] ?? "")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++;
      push({ type: "math", text: buf.join("\n") });
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[1] ?? "```";
      const lang = (fence[2] ?? "").trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith(marker)) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++;
      push({ type: "code", text: buf.join("\n"), lang });
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = Math.min((heading[1] ?? "#").length, 3);
      push({ type: `h${level}` as BlockType, text: (heading[2] ?? "").trim() });
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      push({ type: "divider", text: "" });
      i++;
      continue;
    }

    const embed = EMBED_RE.exec(line);
    if (embed) {
      push({ type: "embed", text: "", target: (embed[1] ?? "").trim() });
      i++;
      continue;
    }

    const image = IMAGE_RE.exec(line);
    if (image) {
      push({ type: "image", text: "", alt: image[1] ?? "", src: image[2] ?? "" });
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const stripped = line.replace(/^\s*>\s?/, "");
      const callout = CALLOUT_RE.exec(stripped);
      if (callout && VALID_CALLOUTS.has((callout[1] ?? "").toLowerCase())) {
        const buf = [callout[2] ?? ""];
        i++;
        while (i < lines.length && /^\s*>/.test(lines[i] ?? "")) {
          buf.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
          i++;
        }
        push({
          type: "callout",
          calloutKind: (callout[1] ?? "note").toLowerCase(),
          text: buf.join(" ").trim(),
        });
        continue;
      }
      push({ type: "quote", text: stripped });
      i++;
      continue;
    }

    if (line.includes("|") && isTableSep(lines[i + 1] ?? "")) {
      const header = splitRow(line);
      const rows: string[][] = [header];
      i += 2; // header + separator
      while (i < lines.length && (lines[i] ?? "").includes("|")) {
        rows.push(splitRow(lines[i] ?? ""));
        i++;
      }
      push({ type: "table", text: "", rows });
      continue;
    }

    const li = LIST_RE.exec(line);
    if (li) {
      const indent = Math.floor((li[1] ?? "").replace(/\t/g, "  ").length / 2);
      const ordered = /\d/.test(li[2] ?? "");
      const content = li[3] ?? "";
      const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
      if (task) {
        push({
          type: "todo",
          text: task[2] ?? "",
          checked: (task[1] ?? "").toLowerCase() === "x",
          indent,
        });
      } else {
        push({ type: ordered ? "numbered" : "bulleted", text: content, indent });
      }
      i++;
      continue;
    }

    // paragraph — gather consecutive plain lines into one block
    const buf: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (
        l.trim() === "" ||
        HEADING_RE.test(l) ||
        FENCE_RE.test(l) ||
        MATH_RE.test(l) ||
        HR_RE.test(l) ||
        IMAGE_RE.test(l) ||
        EMBED_RE.test(l) ||
        /^\s*>/.test(l) ||
        LIST_RE.test(l) ||
        (l.includes("|") && isTableSep(lines[i + 1] ?? ""))
      ) {
        break;
      }
      buf.push(l);
      i++;
    }
    push({ type: "paragraph", text: buf.join(" ").trim() });
  }

  if (blocks.length === 0) blocks.push(emptyBlock());
  return blocks;
};

// --- serialising ----------------------------------------------------------

const serializeTable = (rows: string[][]): string[] => {
  if (rows.length === 0) return [];
  const cols = rows[0]?.length ?? 0;
  const out = [`| ${(rows[0] ?? []).join(" | ")} |`];
  out.push(`| ${Array.from({ length: cols }, () => "---").join(" | ")} |`);
  for (const row of rows.slice(1)) out.push(`| ${row.join(" | ")} |`);
  return out;
};

export const serializeBlocks = (blocks: readonly Block[]): string => {
  const lines: string[] = [];

  blocks.forEach((b, idx) => {
    const indent = "  ".repeat(b.indent ?? 0);
    switch (b.type) {
      case "h1":
        lines.push(`# ${b.text}`);
        break;
      case "h2":
        lines.push(`## ${b.text}`);
        break;
      case "h3":
        lines.push(`### ${b.text}`);
        break;
      case "bulleted":
        lines.push(`${indent}- ${b.text}`);
        break;
      case "numbered":
        lines.push(`${indent}1. ${b.text}`);
        break;
      case "todo":
        lines.push(`${indent}- [${b.checked ? "x" : " "}] ${b.text}`);
        break;
      case "quote":
        lines.push(`> ${b.text}`);
        break;
      case "callout":
        lines.push(`> [!${b.calloutKind ?? "note"}] ${b.text}`);
        break;
      case "divider":
        lines.push("---");
        break;
      case "code":
        lines.push(`\`\`\`${b.lang ?? ""}`, b.text, "```");
        break;
      case "math":
        lines.push("$$", b.text, "$$");
        break;
      case "properties":
        lines.push("---", ...(b.props ?? []).map((p) => `${p.key}: ${p.value}`), "---");
        break;
      case "image":
        lines.push(`![${b.alt ?? ""}](${b.src ?? ""})`);
        break;
      case "embed":
        lines.push(`![[${b.target ?? ""}]]`);
        break;
      case "table":
        lines.push(...serializeTable(b.rows ?? []));
        break;
      default:
        lines.push(b.text);
        break;
    }

    // Blank line between blocks, except runs of list items / quotes.
    const next = blocks[idx + 1];
    if (next) {
      const bothLists = LIST_TYPES.has(b.type) && LIST_TYPES.has(next.type);
      const bothQuotes = b.type === "quote" && next.type === "quote";
      if (!bothLists && !bothQuotes) lines.push("");
    }
  });

  return lines.join("\n");
};
