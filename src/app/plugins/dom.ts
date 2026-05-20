// Installs the DOM + prototype helpers Obsidian's runtime injects and that
// community plugins lean on everywhere (`el.createDiv`, `el.empty()`,
// `arr.first()`, …). Idempotent. Every definition is non-enumerable so the
// Array / Object additions never leak into `for…in` loops.

let installed = false;

const define = (target: object, name: string, value: unknown): void => {
  if (Object.hasOwn(target, name)) return;
  Object.defineProperty(target, name, {
    value,
    enumerable: false,
    writable: true,
    configurable: true,
  });
};

const defineGetter = (target: object, name: string, get: (this: Node) => unknown): void => {
  if (Object.hasOwn(target, name)) return;
  Object.defineProperty(target, name, { get, enumerable: false, configurable: true });
};

const SVG_NS = "http://www.w3.org/2000/svg";

// `info` is either a class-string shorthand or the full options object.
const applyInfo = (el: Element, info?: DomElementInfo | string): void => {
  if (info === undefined) return;
  if (typeof info === "string") {
    el.className = info;
    return;
  }
  if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls;
  if (info.text !== undefined) {
    if (typeof info.text === "string") el.textContent = info.text;
    else el.appendChild(info.text);
  }
  if (info.attr) {
    for (const [k, v] of Object.entries(info.attr)) {
      if (v === null || v === false) continue;
      el.setAttribute(k, String(v));
    }
  }
  const anyEl = el as unknown as Record<string, unknown>;
  if (info.title !== undefined) anyEl.title = info.title;
  if (info.value !== undefined && "value" in el) anyEl.value = info.value;
  if (info.type !== undefined && "type" in el) anyEl.type = info.type;
  if (info.placeholder !== undefined && "placeholder" in el) anyEl.placeholder = info.placeholder;
  if (info.href !== undefined) el.setAttribute("href", info.href);
};

const mountInto = (el: Element, parent: Node | null, info?: DomElementInfo | string): void => {
  const target = (typeof info === "object" && info?.parent) || parent;
  if (!target) return;
  if (typeof info === "object" && info?.prepend) target.insertBefore(el, target.firstChild);
  else target.appendChild(el);
};

const makeEl = (
  parent: Node | null,
  tag: string,
  info?: DomElementInfo | string,
  cb?: (el: HTMLElement) => void,
): HTMLElement => {
  const el = document.createElement(tag);
  applyInfo(el, info);
  mountInto(el, parent, info);
  cb?.(el);
  return el;
};

// Delegated-listener registry so `el.off(...)` can find the wrapper `el.on(...)`
// installed for the same (type, selector, listener) triple.
type DelegateKey = string;
const delegates = new WeakMap<Element, Map<DelegateKey, EventListener>>();

const installElementHelpers = (proto: Element): void => {
  define(
    proto,
    "createEl",
    function (
      this: Element,
      tag: string,
      info?: DomElementInfo | string,
      cb?: (el: HTMLElement) => void,
    ) {
      return makeEl(this, tag, info, cb);
    },
  );
  define(
    proto,
    "createDiv",
    function (this: Element, info?: DomElementInfo | string, cb?: (el: HTMLElement) => void) {
      return makeEl(this, "div", info, cb);
    },
  );
  define(
    proto,
    "createSpan",
    function (this: Element, info?: DomElementInfo | string, cb?: (el: HTMLElement) => void) {
      return makeEl(this, "span", info, cb);
    },
  );
  define(proto, "createSvg", function (this: Element, tag: string, info?: DomElementInfo | string) {
    const el = document.createElementNS(SVG_NS, tag);
    if (typeof info === "string") el.setAttribute("class", info);
    else if (info) {
      if (info.cls)
        el.setAttribute("class", Array.isArray(info.cls) ? info.cls.join(" ") : info.cls);
      if (info.attr)
        for (const [k, v] of Object.entries(info.attr)) {
          if (v !== null && v !== false) el.setAttribute(k, String(v));
        }
    }
    mountInto(el, this, info);
    return el;
  });
  define(proto, "empty", function (this: Element) {
    while (this.firstChild) this.removeChild(this.firstChild);
  });
  define(proto, "detach", function (this: Element) {
    this.parentNode?.removeChild(this);
  });
  define(proto, "setText", function (this: Element, val: string | DocumentFragment) {
    while (this.firstChild) this.removeChild(this.firstChild);
    if (typeof val === "string") this.textContent = val;
    else this.appendChild(val);
  });
  define(proto, "getText", function (this: Element) {
    return this.textContent ?? "";
  });
  define(
    proto,
    "setAttr",
    function (this: Element, name: string, value: string | number | boolean | null) {
      if (value === null || value === false) this.removeAttribute(name);
      else this.setAttribute(name, value === true ? "" : String(value));
    },
  );
  define(proto, "getAttr", function (this: Element, name: string) {
    return this.getAttribute(name);
  });
  define(proto, "addClass", function (this: Element, ...classes: string[]) {
    this.classList.add(...classes.filter(Boolean));
  });
  define(proto, "removeClass", function (this: Element, ...classes: string[]) {
    this.classList.remove(...classes.filter(Boolean));
  });
  define(proto, "addClasses", function (this: Element, classes: string[]) {
    this.classList.add(...classes.filter(Boolean));
  });
  define(proto, "removeClasses", function (this: Element, classes: string[]) {
    this.classList.remove(...classes.filter(Boolean));
  });
  define(
    proto,
    "toggleClass",
    function (this: Element, classes: string | string[], value: boolean) {
      const list = Array.isArray(classes) ? classes : [classes];
      for (const c of list) this.classList.toggle(c, value);
    },
  );
  define(proto, "hasClass", function (this: Element, cls: string) {
    return this.classList.contains(cls);
  });
  define(proto, "appendText", function (this: Element, val: string) {
    this.appendChild(document.createTextNode(val));
  });
  define(proto, "insertAfter", function (this: Element, node: Node, child: Node | null) {
    this.insertBefore(node, child ? child.nextSibling : this.firstChild);
    return node;
  });
  define(proto, "indexOf", function (this: Element, other: Node) {
    return Array.prototype.indexOf.call(this.children, other);
  });
  define(proto, "setCssStyles", function (this: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
    Object.assign(this.style, styles);
  });
  define(proto, "setCssProps", function (this: HTMLElement, props: Record<string, string>) {
    for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
  });
  define(proto, "find", function (this: Element, selector: string) {
    return this.querySelector(selector);
  });
  define(proto, "findAll", function (this: Element, selector: string) {
    return Array.from(this.querySelectorAll(selector));
  });
  define(proto, "findAllSelf", function (this: Element, selector: string) {
    const all = Array.from(this.querySelectorAll(selector));
    if (this.matches(selector)) all.unshift(this);
    return all;
  });
  define(proto, "matchParent", function (this: Element, selector: string, lastParent?: Element) {
    let cur: Element | null = this;
    while (cur) {
      if (cur.matches(selector)) return cur;
      if (cur === lastParent) break;
      cur = cur.parentElement;
    }
    return null;
  });
  define(proto, "show", function (this: HTMLElement) {
    this.style.removeProperty("display");
  });
  define(proto, "hide", function (this: HTMLElement) {
    this.style.setProperty("display", "none");
  });
  define(proto, "toggleVisibility", function (this: HTMLElement, visible: boolean) {
    if (visible) this.style.removeProperty("display");
    else this.style.setProperty("display", "none");
  });
  define(proto, "isShown", function (this: HTMLElement) {
    return this.style.getPropertyValue("display") !== "none" && this.isConnected;
  });
  define(
    proto,
    "onClickEvent",
    function (this: Element, listener: EventListener, options?: boolean | AddEventListenerOptions) {
      this.addEventListener("click", listener, options);
    },
  );
  define(
    proto,
    "on",
    function (
      this: Element,
      type: string,
      selector: string,
      listener: (ev: Event, target: Element) => unknown,
      options?: boolean | AddEventListenerOptions,
    ) {
      const wrapped: EventListener = (ev) => {
        const target = (ev.target as Element | null)?.closest(selector);
        if (target && this.contains(target)) listener.call(target, ev, target);
      };
      let map = delegates.get(this);
      if (!map) {
        map = new Map();
        delegates.set(this, map);
      }
      map.set(`${type} ${selector} ${String(listener)}`, wrapped);
      this.addEventListener(type, wrapped, options);
    },
  );
  define(
    proto,
    "off",
    function (
      this: Element,
      type: string,
      selector: string,
      listener: (ev: Event, target: Element) => unknown,
      options?: boolean | AddEventListenerOptions,
    ) {
      const key = `${type} ${selector} ${String(listener)}`;
      const wrapped = delegates.get(this)?.get(key);
      if (wrapped) {
        this.removeEventListener(type, wrapped, options);
        delegates.get(this)?.delete(key);
      }
    },
  );
  defineGetter(proto, "doc", function (this: Node) {
    return this.ownerDocument ?? document;
  });
  defineGetter(proto, "win", function (this: Node) {
    return this.ownerDocument?.defaultView ?? window;
  });
};

const installFragmentHelpers = (proto: DocumentFragment): void => {
  define(
    proto,
    "createEl",
    function (
      this: DocumentFragment,
      tag: string,
      info?: DomElementInfo | string,
      cb?: (el: HTMLElement) => void,
    ) {
      return makeEl(this, tag, info, cb);
    },
  );
  define(
    proto,
    "createDiv",
    function (
      this: DocumentFragment,
      info?: DomElementInfo | string,
      cb?: (el: HTMLElement) => void,
    ) {
      return makeEl(this, "div", info, cb);
    },
  );
  define(
    proto,
    "createSpan",
    function (
      this: DocumentFragment,
      info?: DomElementInfo | string,
      cb?: (el: HTMLElement) => void,
    ) {
      return makeEl(this, "span", info, cb);
    },
  );
  define(proto, "empty", function (this: DocumentFragment) {
    while (this.firstChild) this.removeChild(this.firstChild);
  });
  define(proto, "appendText", function (this: DocumentFragment, val: string) {
    this.appendChild(document.createTextNode(val));
  });
};

export const installDomAugmentations = (): void => {
  if (installed) return;
  installed = true;

  installElementHelpers(Element.prototype);
  installFragmentHelpers(DocumentFragment.prototype);

  // Document gets the detached-element factories.
  define(
    Document.prototype,
    "createEl",
    function (
      this: Document,
      tag: string,
      info?: DomElementInfo | string,
      cb?: (el: HTMLElement) => void,
    ) {
      return makeEl(null, tag, info, cb);
    },
  );
  define(
    Document.prototype,
    "createDiv",
    function (this: Document, info?: DomElementInfo | string, cb?: (el: HTMLElement) => void) {
      return makeEl(null, "div", info, cb);
    },
  );
  define(
    Document.prototype,
    "createSpan",
    function (this: Document, info?: DomElementInfo | string, cb?: (el: HTMLElement) => void) {
      return makeEl(null, "span", info, cb);
    },
  );

  // Globals — these always create *detached* nodes.
  const g = globalThis as Record<string, unknown>;
  g.createEl = (tag: string, info?: DomElementInfo | string, cb?: (el: HTMLElement) => void) =>
    makeEl(null, tag, info, cb);
  g.createDiv = (info?: DomElementInfo | string, cb?: (el: HTMLElement) => void) =>
    makeEl(null, "div", info, cb);
  g.createSpan = (info?: DomElementInfo | string, cb?: (el: HTMLElement) => void) =>
    makeEl(null, "span", info, cb);
  g.createFragment = (cb?: (el: DocumentFragment) => void) => {
    const frag = document.createDocumentFragment();
    cb?.(frag);
    return frag;
  };

  define(
    Node.prototype,
    "instanceOf",
    function (this: Node, type: new (...args: never[]) => unknown) {
      return this instanceof type;
    },
  );

  define(Array.prototype, "first", function (this: unknown[]) {
    return this.length > 0 ? this[0] : undefined;
  });
  define(Array.prototype, "last", function (this: unknown[]) {
    return this.length > 0 ? this[this.length - 1] : undefined;
  });
  define(Array.prototype, "contains", function (this: unknown[], target: unknown) {
    return this.includes(target);
  });
  define(Array.prototype, "remove", function (this: unknown[], target: unknown) {
    const idx = this.indexOf(target);
    if (idx > -1) this.splice(idx, 1);
  });

  define(Math, "clamp", (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max),
  );

  define(String.prototype, "contains", function (this: string, target: string) {
    return this.includes(target);
  });
};
