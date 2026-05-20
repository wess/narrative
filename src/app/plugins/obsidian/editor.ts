// `Editor` — the plugin editing-surface API. A full `Editor` wraps a single
// CodeMirror document; Narrative's editor is block-based, so this is a
// best-effort adapter: it operates on the active page's *markdown string*
// with a simple line/ch cursor model. `getValue` / `setValue` / `getLine` /
// range ops are exact; selection ops fall back to the tracked cursor. Edits
// commit straight to the page — the open block editor refreshes them on its
// next load (a documented v1 limitation).

export type EditorPosition = { line: number; ch: number };
export type EditorRange = { from: EditorPosition; to: EditorPosition };
export type EditorSelection = { anchor: EditorPosition; head: EditorPosition };
export type EditorChange = { from: EditorPosition; to?: EditorPosition; text: string };
export type EditorTransaction = {
  changes?: EditorChange[];
  selection?: EditorRange;
  replaceSelection?: string;
};

const clampPos = (lines: string[], pos: EditorPosition): EditorPosition => {
  const line = Math.max(0, Math.min(pos.line, lines.length - 1));
  const ch = Math.max(0, Math.min(pos.ch, (lines[line] ?? "").length));
  return { line, ch };
};

const comparePos = (a: EditorPosition, b: EditorPosition): number =>
  a.line !== b.line ? a.line - b.line : a.ch - b.ch;

export class Editor {
  private _value: string;
  private _cursor: EditorPosition = { line: 0, ch: 0 };
  private _commit: (value: string) => void;

  constructor(initial: string, commit: (value: string) => void) {
    this._value = initial;
    this._commit = commit;
    const lines = initial.split("\n");
    this._cursor = { line: lines.length - 1, ch: (lines[lines.length - 1] ?? "").length };
  }

  private lines(): string[] {
    return this._value.split("\n");
  }

  private flush(): void {
    this._commit(this._value);
  }

  getValue(): string {
    return this._value;
  }

  setValue(value: string): void {
    this._value = value;
    this.flush();
  }

  getDoc(): this {
    return this;
  }

  refresh(): void {}

  lineCount(): number {
    return this.lines().length;
  }

  lastLine(): number {
    return this.lines().length - 1;
  }

  getLine(n: number): string {
    return this.lines()[n] ?? "";
  }

  setLine(n: number, text: string): void {
    const lines = this.lines();
    if (n < 0 || n >= lines.length) return;
    lines[n] = text;
    this._value = lines.join("\n");
    this.flush();
  }

  posToOffset(pos: EditorPosition): number {
    const lines = this.lines();
    let offset = 0;
    for (let i = 0; i < pos.line && i < lines.length; i++) offset += (lines[i] ?? "").length + 1;
    return offset + pos.ch;
  }

  offsetToPos(offset: number): EditorPosition {
    const lines = this.lines();
    let remaining = offset;
    for (let line = 0; line < lines.length; line++) {
      const len = (lines[line] ?? "").length;
      if (remaining <= len) return { line, ch: remaining };
      remaining -= len + 1;
    }
    return { line: lines.length - 1, ch: (lines[lines.length - 1] ?? "").length };
  }

  getRange(from: EditorPosition, to: EditorPosition): string {
    const start = this.posToOffset(from);
    const end = this.posToOffset(to);
    return this._value.slice(Math.min(start, end), Math.max(start, end));
  }

  replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition): void {
    const start = this.posToOffset(from);
    const end = to ? this.posToOffset(to) : start;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    this._value = this._value.slice(0, lo) + replacement + this._value.slice(hi);
    this._cursor = this.offsetToPos(lo + replacement.length);
    this.flush();
  }

  getSelection(): string {
    return "";
  }

  somethingSelected(): boolean {
    return false;
  }

  replaceSelection(replacement: string): void {
    this.replaceRange(replacement, this._cursor);
  }

  getCursor(_string?: "from" | "to" | "head" | "anchor"): EditorPosition {
    return { ...this._cursor };
  }

  setCursor(pos: EditorPosition | number, ch?: number): void {
    const next = typeof pos === "number" ? { line: pos, ch: ch ?? 0 } : pos;
    this._cursor = clampPos(this.lines(), next);
  }

  listSelections(): EditorSelection[] {
    return [{ anchor: { ...this._cursor }, head: { ...this._cursor } }];
  }

  setSelection(anchor: EditorPosition, head?: EditorPosition): void {
    this._cursor = clampPos(this.lines(), head ?? anchor);
  }

  setSelections(ranges: EditorSelection[]): void {
    const first = ranges[0];
    if (first) this._cursor = clampPos(this.lines(), first.head);
  }

  wordAt(pos: EditorPosition): EditorRange | null {
    const line = this.getLine(pos.line);
    if (!line) return null;
    let start = pos.ch;
    let end = pos.ch;
    const isWord = (c: string): boolean => /\w/.test(c);
    while (start > 0 && isWord(line[start - 1] ?? "")) start--;
    while (end < line.length && isWord(line[end] ?? "")) end++;
    if (start === end) return null;
    return { from: { line: pos.line, ch: start }, to: { line: pos.line, ch: end } };
  }

  getScrollInfo(): { top: number; left: number } {
    return { top: 0, left: 0 };
  }

  scrollTo(): void {}
  scrollIntoView(): void {}

  focus(): void {}
  blur(): void {}
  hasFocus(): boolean {
    return false;
  }

  // CodeMirror's built-in command names — we cover the obvious ones.
  exec(command: string): void {
    if (command === "goEnd") {
      const lines = this.lines();
      this._cursor = { line: lines.length - 1, ch: (lines[lines.length - 1] ?? "").length };
    } else if (command === "goStart") {
      this._cursor = { line: 0, ch: 0 };
    }
  }

  transaction(tx: EditorTransaction): void {
    if (tx.changes) {
      // Apply back-to-front so earlier offsets stay valid.
      const sorted = [...tx.changes].sort((a, b) => comparePos(b.from, a.from));
      for (const change of sorted) this.replaceRange(change.text, change.from, change.to);
    }
    if (tx.replaceSelection !== undefined) this.replaceSelection(tx.replaceSelection);
    if (tx.selection) this._cursor = clampPos(this.lines(), tx.selection.to);
  }

  undo(): void {}
  redo(): void {}

  // A full editor would expose its CodeMirror instance here; we have none.
  readonly cm: undefined = undefined;
}
