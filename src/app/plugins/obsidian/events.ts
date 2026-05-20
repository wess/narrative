// `Events` — the tiny pub/sub base class. `Vault`, `Workspace`,
// `MetadataCache` and many plugin objects extend it. An `EventRef` is the
// opaque handle returned by `on()`; `Component.registerEvent` keeps one so it
// can be torn down with the plugin.

export type EventRef = {
  readonly e: Events;
  readonly name: string;
  readonly fn: (...args: unknown[]) => unknown;
  readonly ctx?: unknown;
};

export class Events {
  private _handlers = new Map<string, EventRef[]>();

  on(name: string, callback: (...args: never[]) => unknown, ctx?: unknown): EventRef {
    const ref: EventRef = { e: this, name, fn: callback as (...a: unknown[]) => unknown, ctx };
    const list = this._handlers.get(name);
    if (list) list.push(ref);
    else this._handlers.set(name, [ref]);
    return ref;
  }

  off(name: string, callback: (...args: never[]) => unknown): void {
    const list = this._handlers.get(name);
    if (!list) return;
    const next = list.filter((ref) => ref.fn !== callback);
    if (next.length > 0) this._handlers.set(name, next);
    else this._handlers.delete(name);
  }

  offref(ref: EventRef): void {
    const list = this._handlers.get(ref.name);
    if (!list) return;
    const next = list.filter((r) => r !== ref);
    if (next.length > 0) this._handlers.set(ref.name, next);
    else this._handlers.delete(ref.name);
  }

  trigger(name: string, ...args: unknown[]): void {
    const list = this._handlers.get(name);
    if (!list) return;
    for (const ref of list.slice()) {
      try {
        ref.fn.apply(ref.ctx, args);
      } catch (e) {
        console.error(`[narrative] plugin event handler for "${name}" threw`, e);
      }
    }
  }

  tryTrigger(evt: EventRef, args: unknown[]): void {
    try {
      evt.fn.apply(evt.ctx, args);
    } catch (e) {
      console.error(`[narrative] plugin event handler for "${evt.name}" threw`, e);
    }
  }
}
