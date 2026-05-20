// `Scope` / `Keymap` — the plugin keyboard plumbing. Plugins use a `Scope`
// mostly inside modals (to bind Enter / arrows). We keep a real, working
// implementation that's small: a `Scope` installs one keydown listener while
// it has handlers registered.

export type Modifier = "Mod" | "Ctrl" | "Meta" | "Shift" | "Alt";

export type KeymapEventHandler = {
  readonly scope: Scope;
  readonly modifiers: string;
  readonly key: string | null;
  readonly func: KeymapEventListener;
};

// biome-ignore lint/suspicious/noConfusingVoidType: matches the plugin KeymapEventListener signature
export type KeymapEventListener = (evt: KeyboardEvent, ctx: KeymapContext) => false | void;

export type KeymapContext = {
  readonly modifiers: string;
  readonly key: string | null;
};

const isMac = navigator.platform.toUpperCase().includes("MAC");

const eventModifiers = (evt: KeyboardEvent): Set<string> => {
  const mods = new Set<string>();
  if (evt.ctrlKey) mods.add("Ctrl");
  if (evt.metaKey) mods.add("Meta");
  if (evt.shiftKey) mods.add("Shift");
  if (evt.altKey) mods.add("Alt");
  return mods;
};

const normalizeModifiers = (modifiers: Modifier[]): Set<string> => {
  const set = new Set<string>();
  for (const m of modifiers) set.add(m === "Mod" ? (isMac ? "Meta" : "Ctrl") : m);
  return set;
};

export class Scope {
  parent: Scope | null;
  private _handlers: KeymapEventHandler[] = [];
  private _listener: ((evt: KeyboardEvent) => void) | null = null;

  constructor(parent?: Scope) {
    this.parent = parent ?? null;
  }

  register(
    modifiers: Modifier[],
    key: string | null,
    func: KeymapEventListener,
  ): KeymapEventHandler {
    const handler: KeymapEventHandler = {
      scope: this,
      modifiers: [...normalizeModifiers(modifiers)].sort().join(","),
      key,
      func,
    };
    this._handlers.push(handler);
    this._ensureListener();
    return handler;
  }

  unregister(handler: KeymapEventHandler): void {
    const idx = this._handlers.indexOf(handler);
    if (idx > -1) this._handlers.splice(idx, 1);
    if (this._handlers.length === 0 && this._listener) {
      document.removeEventListener("keydown", this._listener, true);
      this._listener = null;
    }
  }

  private _ensureListener(): void {
    if (this._listener) return;
    this._listener = (evt: KeyboardEvent) => {
      const mods = [...eventModifiers(evt)].sort().join(",");
      for (const h of this._handlers) {
        if (h.modifiers !== mods) continue;
        if (h.key !== null && h.key.toLowerCase() !== evt.key.toLowerCase()) continue;
        const result = h.func(evt, { modifiers: mods, key: evt.key });
        if (result === false) {
          evt.preventDefault();
          evt.stopPropagation();
        }
      }
    };
    document.addEventListener("keydown", this._listener, true);
  }
}

export const Keymap = {
  isModifier: (evt: KeyboardEvent | MouseEvent, modifier: Modifier): boolean => {
    switch (modifier) {
      case "Mod":
        return isMac ? evt.metaKey : evt.ctrlKey;
      case "Ctrl":
        return evt.ctrlKey;
      case "Meta":
        return evt.metaKey;
      case "Shift":
        return evt.shiftKey;
      case "Alt":
        return evt.altKey;
      default:
        return false;
    }
  },
  // True when the event asks for a "open in new context" gesture.
  isModEvent: (evt?: MouseEvent | KeyboardEvent | null): boolean => {
    if (!evt) return false;
    return isMac ? evt.metaKey : evt.ctrlKey;
  },
};
