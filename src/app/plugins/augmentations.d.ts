// Ambient declarations for the DOM / prototype helpers the plugin runtime
// injects and that community plugins call constantly. The implementations
// live in `src/app/plugins/dom.ts`; this file only teaches TypeScript about
// them. No imports/exports — this is a global script so the `interface`
// merges land on the lib types.

interface DomElementInfo {
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  parent?: Node;
  value?: string;
  type?: string;
  prepend?: boolean;
  placeholder?: string;
  href?: string;
}

type DomElementCallback<T> = (el: T) => void;

interface Element {
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: DomElementInfo | string,
    callback?: DomElementCallback<HTMLElementTagNameMap[K]>,
  ): HTMLElementTagNameMap[K];
  createDiv(
    o?: DomElementInfo | string,
    callback?: DomElementCallback<HTMLDivElement>,
  ): HTMLDivElement;
  createSpan(
    o?: DomElementInfo | string,
    callback?: DomElementCallback<HTMLSpanElement>,
  ): HTMLSpanElement;
  createSvg(tag: string, o?: DomElementInfo | string): SVGElement;
  empty(): void;
  detach(): void;
  setText(val: string | DocumentFragment): void;
  getText(): string;
  setAttr(qualifiedName: string, value: string | number | boolean | null): void;
  getAttr(qualifiedName: string): string | null;
  addClass(...classes: string[]): void;
  removeClass(...classes: string[]): void;
  toggleClass(classes: string | string[], value: boolean): void;
  hasClass(cls: string): boolean;
  addClasses(classes: string[]): void;
  removeClasses(classes: string[]): void;
  appendText(val: string): void;
  insertAfter<T extends Node>(node: T, child: Node | null): T;
  indexOf(other: Node): number;
  setCssStyles(styles: Partial<CSSStyleDeclaration>): void;
  setCssProps(props: Record<string, string>): void;
  find(selector: string): HTMLElement | null;
  findAll(selector: string): HTMLElement[];
  findAllSelf(selector: string): HTMLElement[];
  matchParent(selector: string, lastParent?: Element): HTMLElement | null;
  show(): void;
  hide(): void;
  toggleVisibility(visible: boolean): void;
  isShown(): boolean;
  onClickEvent(
    listener: (this: HTMLElement, ev: MouseEvent) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on(
    type: string,
    selector: string,
    listener: (this: HTMLElement, ev: Event, delegateTarget: HTMLElement) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  off(
    type: string,
    selector: string,
    listener: (this: HTMLElement, ev: Event, delegateTarget: HTMLElement) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  readonly doc: Document;
  readonly win: Window;
}

interface Document {
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: DomElementInfo | string,
    callback?: DomElementCallback<HTMLElementTagNameMap[K]>,
  ): HTMLElementTagNameMap[K];
  createDiv(
    o?: DomElementInfo | string,
    callback?: DomElementCallback<HTMLDivElement>,
  ): HTMLDivElement;
  createSpan(
    o?: DomElementInfo | string,
    callback?: DomElementCallback<HTMLSpanElement>,
  ): HTMLSpanElement;
}

interface DocumentFragment {
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: DomElementInfo | string,
    callback?: DomElementCallback<HTMLElementTagNameMap[K]>,
  ): HTMLElementTagNameMap[K];
  createDiv(
    o?: DomElementInfo | string,
    callback?: DomElementCallback<HTMLDivElement>,
  ): HTMLDivElement;
  createSpan(
    o?: DomElementInfo | string,
    callback?: DomElementCallback<HTMLSpanElement>,
  ): HTMLSpanElement;
  empty(): void;
  appendText(val: string): void;
}

interface Node {
  instanceOf<T>(type: new (...args: never[]) => T): this is T;
}

interface Array<T> {
  first(): T | undefined;
  last(): T | undefined;
  contains(target: T): boolean;
  remove(target: T): void;
}

interface Math {
  clamp(value: number, min: number, max: number): number;
}

interface String {
  contains(target: string): boolean;
}

interface Window {
  // The running `App` is exposed here; plugins occasionally read it.
  app?: unknown;
}

declare function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  o?: DomElementInfo | string,
  callback?: DomElementCallback<HTMLElementTagNameMap[K]>,
): HTMLElementTagNameMap[K];
declare function createDiv(
  o?: DomElementInfo | string,
  callback?: DomElementCallback<HTMLDivElement>,
): HTMLDivElement;
declare function createSpan(
  o?: DomElementInfo | string,
  callback?: DomElementCallback<HTMLSpanElement>,
): HTMLSpanElement;
declare function createFragment(callback?: (el: DocumentFragment) => void): DocumentFragment;
