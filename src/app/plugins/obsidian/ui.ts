// Transient UI primitives: `Notice`, `Modal`, `Menu` / `MenuItem`. These are
// pure DOM — plugins build their interfaces imperatively, so the
// faithful move is to give them real elements (`noticeEl`, `contentEl`,
// `modalEl`) to manipulate rather than wrapping a React component.

import { Component } from "./component.ts";
import { setIcon } from "./icons.ts";
import { Scope } from "./keymap.ts";

// --- Notice ---------------------------------------------------------------

let noticeContainer: HTMLElement | null = null;
const getNoticeContainer = (): HTMLElement => {
  if (noticeContainer && document.body.contains(noticeContainer)) return noticeContainer;
  noticeContainer = document.body.createDiv({ cls: "narrative-notice-container" });
  return noticeContainer;
};

export class Notice {
  noticeEl: HTMLElement;
  private _timer: number | null = null;

  constructor(message: string | DocumentFragment, duration = 5000) {
    this.noticeEl = getNoticeContainer().createDiv({ cls: "narrative-notice" });
    this.setMessage(message);
    this.noticeEl.addEventListener("click", () => this.hide());
    // Allow the entry transition to run.
    requestAnimationFrame(() => this.noticeEl.addClass("is-shown"));
    if (duration > 0) {
      this._timer = window.setTimeout(() => this.hide(), duration);
    }
  }

  setMessage(message: string | DocumentFragment): this {
    this.noticeEl.empty();
    if (typeof message === "string") this.noticeEl.setText(message);
    else this.noticeEl.appendChild(message);
    return this;
  }

  hide(): void {
    if (this._timer !== null) {
      window.clearTimeout(this._timer);
      this._timer = null;
    }
    this.noticeEl.addClass("is-hiding");
    window.setTimeout(() => this.noticeEl.detach(), 200);
  }
}

// --- Modal ----------------------------------------------------------------

export class Modal extends Component {
  app: unknown;
  scope: Scope;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  shouldRestoreSelection = false;

  private _onEsc: (e: KeyboardEvent) => void;

  constructor(app: unknown) {
    super();
    this.app = app;
    this.scope = new Scope();

    this.containerEl = document.createElement("div");
    this.containerEl.className = "narrative-modal-container";
    this.modalEl = this.containerEl.createDiv({ cls: "narrative-modal" });
    this.titleEl = this.modalEl.createDiv({ cls: "narrative-modal-title" });
    this.contentEl = this.modalEl.createDiv({ cls: "narrative-modal-content" });

    this.containerEl.addEventListener("mousedown", (e) => {
      if (e.target === this.containerEl) this.close();
    });
    this._onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    };
  }

  setTitle(title: string): this {
    this.titleEl.setText(title);
    return this;
  }

  setContent(content: string | Node): this {
    this.contentEl.empty();
    if (typeof content === "string") this.contentEl.setText(content);
    else this.contentEl.appendChild(content);
    return this;
  }

  open(): void {
    document.body.appendChild(this.containerEl);
    document.addEventListener("keydown", this._onEsc, true);
    this.load();
    requestAnimationFrame(() => this.containerEl.addClass("is-open"));
    try {
      this.onOpen();
    } catch (e) {
      console.error("[narrative] modal onOpen threw", e);
    }
  }

  close(): void {
    document.removeEventListener("keydown", this._onEsc, true);
    try {
      this.onClose();
    } catch (e) {
      console.error("[narrative] modal onClose threw", e);
    }
    this.containerEl.detach();
    this.unload();
  }

  onOpen(): void {}
  onClose(): void {}
}

// --- Menu -----------------------------------------------------------------

export class MenuItem {
  dom: HTMLElement;
  private _title = "";
  private _icon: string | null = null;
  private _click: ((evt: MouseEvent | KeyboardEvent) => unknown) | null = null;
  private _disabled = false;
  private _checked = false;
  private _section: string | null = null;

  constructor(private menu: Menu) {
    this.dom = document.createElement("div");
    this.dom.className = "narrative-menu-item";
  }

  setTitle(title: string | DocumentFragment): this {
    this._title = typeof title === "string" ? title : (title.textContent ?? "");
    this.render();
    return this;
  }

  setIcon(icon: string | null): this {
    this._icon = icon;
    this.render();
    return this;
  }

  setChecked(checked: boolean): this {
    this._checked = checked;
    this.render();
    return this;
  }

  setDisabled(disabled: boolean): this {
    this._disabled = disabled;
    this.dom.toggleClass("is-disabled", disabled);
    return this;
  }

  setSection(section: string): this {
    this._section = section;
    return this;
  }

  setIsLabel(isLabel: boolean): this {
    this.dom.toggleClass("is-label", isLabel);
    return this;
  }

  get section(): string | null {
    return this._section;
  }

  onClick(callback: (evt: MouseEvent | KeyboardEvent) => unknown): this {
    this._click = callback;
    return this;
  }

  private render(): void {
    this.dom.empty();
    if (this._icon) {
      const iconEl = this.dom.createDiv({ cls: "narrative-menu-item-icon" });
      setIcon(iconEl, this._icon);
    }
    this.dom.createDiv({ cls: "narrative-menu-item-title", text: this._title });
    if (this._checked) this.dom.addClass("is-checked");
  }

  trigger(evt: MouseEvent | KeyboardEvent): void {
    if (this._disabled) return;
    this._click?.(evt);
    this.menu.hide();
  }
}

export class Menu {
  private items: (MenuItem | "separator")[] = [];
  private dom: HTMLElement | null = null;
  private _onHide: (() => void)[] = [];
  private _dismiss: ((e: MouseEvent) => void) | null = null;

  addItem(cb: (item: MenuItem) => unknown): this {
    const item = new MenuItem(this);
    cb(item);
    this.items.push(item);
    return this;
  }

  addSeparator(): this {
    this.items.push("separator");
    return this;
  }

  setNoIcon(): this {
    return this;
  }

  setUseNativeMenu(): this {
    return this;
  }

  onHide(cb: () => unknown): this {
    this._onHide.push(() => cb());
    return this;
  }

  showAtMouseEvent(evt: MouseEvent): this {
    return this.showAtPosition({ x: evt.clientX, y: evt.clientY });
  }

  showAtPosition(position: { x: number; y: number }): this {
    this.hide();
    const dom = document.body.createDiv({ cls: "narrative-menu" });
    this.dom = dom;
    for (const item of this.items) {
      if (item === "separator") {
        dom.createDiv({ cls: "narrative-menu-separator" });
      } else {
        dom.appendChild(item.dom);
        item.dom.addEventListener("click", (e) => item.trigger(e));
      }
    }
    // Keep the menu inside the viewport.
    const rect = dom.getBoundingClientRect();
    const x = Math.min(position.x, window.innerWidth - rect.width - 8);
    const y = Math.min(position.y, window.innerHeight - rect.height - 8);
    dom.style.left = `${Math.max(8, x)}px`;
    dom.style.top = `${Math.max(8, y)}px`;

    this._dismiss = (e: MouseEvent) => {
      if (this.dom && !this.dom.contains(e.target as Node)) this.hide();
    };
    // Defer so the opening click doesn't immediately dismiss it.
    window.setTimeout(() => {
      if (this._dismiss) window.addEventListener("mousedown", this._dismiss, true);
    }, 0);
    return this;
  }

  hide(): this {
    if (this._dismiss) {
      window.removeEventListener("mousedown", this._dismiss, true);
      this._dismiss = null;
    }
    if (this.dom) {
      this.dom.detach();
      this.dom = null;
      for (const cb of this._onHide) cb();
    }
    return this;
  }
}
