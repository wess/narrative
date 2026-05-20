// The suggester family: `SuggestModal`, `FuzzySuggestModal` and the
// input-attached `AbstractInputSuggest` / `PopoverSuggest`. Plugins use these
// for quick pickers (choose a file, choose a tag, …). They're built on the
// `Modal` shim plus the fuzzy matcher from `util.ts`.

import type { App } from "./app.ts";
import { Modal } from "./ui.ts";
import { prepareFuzzySearch, type SearchResult } from "./util.ts";

export type FuzzyMatch<T> = { item: T; match: SearchResult };
export type Instruction = { command: string; purpose: string };

export abstract class SuggestModal<T> extends Modal {
  inputEl: HTMLInputElement;
  resultContainerEl: HTMLElement;
  limit = 50;
  emptyStateText = "No results found.";

  private _items: T[] = [];
  private _selected = 0;
  private _instructionsEl: HTMLElement;

  constructor(app: App) {
    super(app);
    this.modalEl.addClass("narrative-suggest-modal");
    this.contentEl.empty();
    this.inputEl = this.contentEl.createEl("input", {
      type: "text",
      cls: "narrative-suggest-input",
    });
    this.resultContainerEl = this.contentEl.createDiv({ cls: "narrative-suggest-results" });
    this._instructionsEl = this.contentEl.createDiv({ cls: "narrative-suggest-instructions" });

    this.inputEl.addEventListener("input", () => void this.updateSuggestions());
    this.inputEl.addEventListener("keydown", (e) => this.onKey(e));
  }

  abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;

  setPlaceholder(placeholder: string): void {
    this.inputEl.placeholder = placeholder;
  }

  setInstructions(instructions: Instruction[]): void {
    this._instructionsEl.empty();
    for (const ins of instructions) {
      const row = this._instructionsEl.createDiv({ cls: "narrative-suggest-instruction" });
      row.createSpan({ cls: "narrative-suggest-command", text: ins.command });
      row.createSpan({ cls: "narrative-suggest-purpose", text: ins.purpose });
    }
  }

  override onOpen(): void {
    this.inputEl.focus();
    void this.updateSuggestions();
  }

  private async updateSuggestions(): Promise<void> {
    const items = await this.getSuggestions(this.inputEl.value);
    this._items = items.slice(0, this.limit);
    this._selected = 0;
    this.renderResults();
  }

  private renderResults(): void {
    this.resultContainerEl.empty();
    if (this._items.length === 0) {
      this.resultContainerEl.createDiv({
        cls: "narrative-suggest-empty",
        text: this.emptyStateText,
      });
      return;
    }
    this._items.forEach((item, idx) => {
      const el = this.resultContainerEl.createDiv({ cls: "narrative-suggest-item" });
      el.toggleClass("is-selected", idx === this._selected);
      this.renderSuggestion(item, el);
      el.addEventListener("mouseenter", () => {
        this._selected = idx;
        this.highlight();
      });
      el.addEventListener("click", (e) => this.choose(item, e));
    });
  }

  private highlight(): void {
    const children = Array.from(this.resultContainerEl.children);
    children.forEach((child, idx) => {
      child.toggleClass("is-selected", idx === this._selected);
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this._selected = Math.min(this._selected + 1, this._items.length - 1);
      this.highlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this._selected = Math.max(this._selected - 1, 0);
      this.highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = this._items[this._selected];
      if (item !== undefined) this.choose(item, e);
    }
  }

  private choose(item: T, evt: MouseEvent | KeyboardEvent): void {
    this.onChooseSuggestion(item, evt);
    this.close();
  }
}

export abstract class FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>> {
  abstract getItems(): T[];
  abstract getItemText(item: T): string;
  abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;

  getSuggestions(query: string): FuzzyMatch<T>[] {
    const matcher = prepareFuzzySearch(query);
    const out: FuzzyMatch<T>[] = [];
    for (const item of this.getItems()) {
      const match = matcher(this.getItemText(item));
      if (match) out.push({ item, match });
    }
    out.sort((a, b) => b.match.score - a.match.score);
    return out;
  }

  renderSuggestion(value: FuzzyMatch<T>, el: HTMLElement): void {
    el.setText(this.getItemText(value.item));
  }

  onChooseSuggestion(value: FuzzyMatch<T>, evt: MouseEvent | KeyboardEvent): void {
    this.onChooseItem(value.item, evt);
  }
}

// A suggestion popover bound to an existing `<input>`.
export abstract class AbstractInputSuggest<T> {
  app: App;
  protected inputEl: HTMLInputElement | HTMLDivElement;
  private _popover: HTMLElement | null = null;
  private _selectCb: ((value: T, evt: MouseEvent | KeyboardEvent) => unknown) | null = null;
  private _limit = 20;

  constructor(app: App, inputEl: HTMLInputElement | HTMLDivElement) {
    this.app = app;
    this.inputEl = inputEl;
    inputEl.addEventListener("input", () => void this.refresh());
    inputEl.addEventListener("blur", () => window.setTimeout(() => this.close(), 120));
  }

  abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;

  limit(limit: number): this {
    this._limit = limit;
    return this;
  }

  onSelect(cb: (value: T, evt: MouseEvent | KeyboardEvent) => unknown): this {
    this._selectCb = cb;
    return this;
  }

  getValue(): string {
    return "value" in this.inputEl ? this.inputEl.value : (this.inputEl.textContent ?? "");
  }

  setValue(value: string): void {
    if ("value" in this.inputEl) this.inputEl.value = value;
    else this.inputEl.textContent = value;
  }

  close(): void {
    this._popover?.detach();
    this._popover = null;
  }

  private async refresh(): Promise<void> {
    const items = (await this.getSuggestions(this.getValue())).slice(0, this._limit);
    this.close();
    if (items.length === 0) return;
    const rect = this.inputEl.getBoundingClientRect();
    const popover = document.body.createDiv({ cls: "narrative-input-suggest" });
    popover.style.left = `${rect.left}px`;
    popover.style.top = `${rect.bottom + 2}px`;
    popover.style.minWidth = `${rect.width}px`;
    for (const item of items) {
      const el = popover.createDiv({ cls: "narrative-suggest-item" });
      this.renderSuggestion(item, el);
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.selectSuggestion(item, e);
        this._selectCb?.(item, e);
        this.close();
      });
    }
    this._popover = popover;
  }
}

// Older base class name some plugins still extend.
export abstract class PopoverSuggest<T> {
  app: App;
  constructor(app: App) {
    this.app = app;
  }
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;
  open(): void {}
  close(): void {}
}
