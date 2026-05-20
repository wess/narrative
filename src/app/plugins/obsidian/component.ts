// `Component` — the lifecycle + resource-tracking base class. The key
// contract: anything registered through `register*` while the component is
// loaded is automatically torn down on `unload()`. `Plugin`, `Modal`,
// `ItemView`, `MarkdownRenderChild` all extend it, so disabling a plugin and
// getting every listener / interval / child cleaned up "just works".

import type { EventRef } from "./events.ts";

export class Component {
  _loaded = false;
  private _children: Component[] = [];
  private _cleanups: (() => void)[] = [];

  load(): void {
    if (this._loaded) return;
    this._loaded = true;
    try {
      this.onload();
    } catch (e) {
      console.error("[narrative] component onload threw", e);
    }
    for (const child of this._children.slice()) child.load();
  }

  onload(): void {}

  unload(): void {
    if (!this._loaded) return;
    this._loaded = false;
    for (const child of this._children.slice()) child.unload();
    this._children = [];
    for (const cleanup of this._cleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch (e) {
        console.error("[narrative] component cleanup threw", e);
      }
    }
    try {
      this.onunload();
    } catch (e) {
      console.error("[narrative] component onunload threw", e);
    }
  }

  onunload(): void {}

  addChild<T extends Component>(child: T): T {
    this._children.push(child);
    if (this._loaded) child.load();
    return child;
  }

  removeChild<T extends Component>(child: T): T {
    const idx = this._children.indexOf(child);
    if (idx > -1) {
      this._children.splice(idx, 1);
      child.unload();
    }
    return child;
  }

  // Register an arbitrary teardown callback.
  register(cb: () => unknown): void {
    if (this._loaded) this._cleanups.push(() => void cb());
    else this._cleanups.push(() => void cb());
  }

  // Register an `Events` subscription so it's dropped on unload.
  registerEvent(eventRef: EventRef): void {
    this._cleanups.push(() => eventRef.e.offref(eventRef));
  }

  // Register a DOM listener bound to the component's lifetime.
  registerDomEvent(
    el: Window | Document | HTMLElement,
    type: string,
    callback: (this: HTMLElement, ev: Event) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void {
    el.addEventListener(type, callback as EventListener, options);
    this._cleanups.push(() => el.removeEventListener(type, callback as EventListener, options));
  }

  // Register a `setInterval` id so it's cleared on unload.
  registerInterval(id: number): number {
    this._cleanups.push(() => window.clearInterval(id));
    return id;
  }
}
