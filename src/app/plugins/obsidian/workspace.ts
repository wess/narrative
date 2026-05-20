// `Workspace`, `WorkspaceLeaf`, `View` / `ItemView` / `MarkdownView`. This is
// the loosest part of the shim: a full workspace tiles an arbitrary layout of leaves,
// while Narrative has one editor area plus tabs. We model a single main leaf
// (proxying the editor) and a pool of plugin leaves that custom `ItemView`s
// mount into — rendered by the app shell in a dedicated side panel. Honest
// about the constraint, faithful for the common "open my view" pattern.

import { actions } from "../../state/actions.ts";
import { getState } from "../../state/store.ts";
import { registry } from "../registry.ts";
import type { App } from "./app.ts";
import { Component } from "./component.ts";
import { Editor } from "./editor.ts";
import { Events } from "./events.ts";
import type { Scope } from "./keymap.ts";
import type { TFile } from "./vault.ts";

export type ViewState = {
  type: string;
  state?: Record<string, unknown>;
  active?: boolean;
  pinned?: boolean;
  group?: WorkspaceLeaf;
};

export type OpenViewState = {
  state?: Record<string, unknown>;
  eState?: Record<string, unknown>;
  active?: boolean;
};

export type PaneType = "tab" | "split" | "window";

// --- View hierarchy -------------------------------------------------------

export abstract class View extends Component {
  app: App;
  icon = "document";
  navigation = false;
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;
  scope: Scope | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super();
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "narrative-view";
  }

  abstract getViewType(): string;
  abstract getDisplayText(): string;

  getIcon(): string {
    return this.icon;
  }

  override onload(): void {
    void this.onOpen();
  }

  override onunload(): void {
    void this.onClose();
  }

  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}

  getState(): Record<string, unknown> {
    return {};
  }

  async setState(_state: unknown, _result: unknown): Promise<void> {}

  getEphemeralState(): Record<string, unknown> {
    return {};
  }

  setEphemeralState(_state: unknown): void {}
}

export abstract class ItemView extends View {
  contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.containerEl.addClass("narrative-item-view");
    this.containerEl.createDiv({ cls: "narrative-view-header" });
    this.contentEl = this.containerEl.createDiv({ cls: "narrative-view-content" });
  }

  // Adds a clickable action to the view header; returns the element.
  addAction(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement {
    const header =
      this.containerEl.querySelector<HTMLElement>(".narrative-view-header") ?? this.containerEl;
    const el = header.createDiv({ cls: "narrative-view-action", attr: { "aria-label": title } });
    el.dataset.icon = icon;
    el.addEventListener("click", callback);
    return el;
  }
}

// A read-only view onto Narrative's active page — what
// `getActiveViewOfType(MarkdownView)` hands back.
export class MarkdownView extends ItemView {
  file: TFile | null = null;
  editor: Editor;
  private _mode: "source" | "preview" = "source";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.icon = "document";
    this.editor = new Editor("", (value) => {
      const id = getState().activeId;
      if (id !== null) void actions.savePage({ id, body: value });
    });
  }

  override getViewType(): string {
    return "markdown";
  }

  override getDisplayText(): string {
    return getState().activePage?.title ?? "Markdown";
  }

  getMode(): "source" | "preview" {
    return this._mode;
  }

  get currentMode(): { type: "source" | "preview" } {
    return { type: this._mode };
  }

  getViewData(): string {
    return getState().activePage?.body ?? "";
  }

  setViewData(data: string, _clear: boolean): void {
    const id = getState().activeId;
    if (id !== null) void actions.savePage({ id, body: data });
  }

  clear(): void {}

  // Re-seed the editor adapter against whatever page is currently active.
  syncToActivePage(file: TFile | null): void {
    this.file = file;
    this.editor = new Editor(getState().activePage?.body ?? "", (value) => {
      const id = getState().activeId;
      if (id !== null) void actions.savePage({ id, body: value });
    });
  }
}

// --- Leaves ---------------------------------------------------------------

let leafSeq = 0;

export class WorkspaceLeaf extends Events {
  app: App;
  view: View;
  containerEl: HTMLElement;
  readonly id: string;
  readonly kind: "main" | "plugin";
  pinned = false;
  group: string | null = null;

  constructor(app: App, kind: "main" | "plugin") {
    super();
    this.app = app;
    this.kind = kind;
    this.id = `leaf-${++leafSeq}`;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "narrative-leaf";
    // A placeholder view until something is opened into the leaf.
    this.view = new EmptyView(this);
  }

  getViewState(): ViewState {
    return { type: this.view.getViewType() };
  }

  async setViewState(state: ViewState, _eState?: unknown): Promise<void> {
    const reg = registry.viewCreator(state.type);
    if (reg) {
      this.view.unload();
      this.view = reg.creator(this);
      this.containerEl.empty();
      this.containerEl.appendChild(this.view.containerEl);
      this.view.load();
      notifyWorkspace();
    }
  }

  async open(view: View): Promise<View> {
    this.view.unload();
    this.view = view;
    this.containerEl.empty();
    this.containerEl.appendChild(view.containerEl);
    view.load();
    notifyWorkspace();
    return view;
  }

  async openFile(file: TFile, _state?: OpenViewState): Promise<void> {
    if (this.kind === "main") await actions.openPage(file.id);
  }

  getDisplayText(): string {
    return this.view.getDisplayText();
  }

  getIcon(): string {
    return this.view.getIcon();
  }

  getEphemeralState(): Record<string, unknown> {
    return {};
  }

  setEphemeralState(_state: unknown): void {}

  setPinned(pinned: boolean): void {
    this.pinned = pinned;
    this.trigger("pinned-change", pinned);
  }

  togglePinned(): void {
    this.setPinned(!this.pinned);
  }

  setGroup(group: string): void {
    this.group = group;
  }

  detach(): void {
    this.view.unload();
    this.containerEl.detach();
    const idx = pluginLeaves.indexOf(this);
    if (idx > -1) pluginLeaves.splice(idx, 1);
    if (activePluginLeaf === this) activePluginLeaf = pluginLeaves[pluginLeaves.length - 1] ?? null;
    notifyWorkspace();
  }
}

// The empty placeholder a fresh leaf shows before a view is opened.
class EmptyView extends ItemView {
  override getViewType(): string {
    return "empty";
  }
  override getDisplayText(): string {
    return "No view";
  }
}

// --- plugin-view host (module state the app shell renders) ---------------

const pluginLeaves: WorkspaceLeaf[] = [];
let activePluginLeaf: WorkspaceLeaf | null = null;
const workspaceListeners = new Set<() => void>();
let workspaceVersion = 0;

const notifyWorkspace = (): void => {
  workspaceVersion++;
  for (const l of workspaceListeners) l();
};

export const subscribeWorkspace = (listener: () => void): (() => void) => {
  workspaceListeners.add(listener);
  return () => workspaceListeners.delete(listener);
};

// A monotonically increasing snapshot value for `useSyncExternalStore` — the
// leaf arrays mutate in place, so components key off this instead.
export const getWorkspaceVersion = (): number => workspaceVersion;

export const getOpenPluginLeaves = (): readonly WorkspaceLeaf[] => pluginLeaves;
export const getActivePluginLeaf = (): WorkspaceLeaf | null => activePluginLeaf;
export const setActivePluginLeaf = (leaf: WorkspaceLeaf | null): void => {
  activePluginLeaf = leaf;
  notifyWorkspace();
};

// --- Workspace ------------------------------------------------------------

export class Workspace extends Events {
  app: App;
  leftSplit = { collapsed: false, expand: () => {}, collapse: () => {} };
  rightSplit = { collapsed: false, expand: () => {}, collapse: () => {} };
  containerEl: HTMLElement;
  private mainLeaf: WorkspaceLeaf;
  private _layoutReady = false;
  private _layoutReadyCbs: (() => void)[] = [];

  constructor(app: App) {
    super();
    this.app = app;
    this.containerEl = document.body;
    this.mainLeaf = new WorkspaceLeaf(app, "main");
    void this.mainLeaf.open(new MarkdownView(this.mainLeaf));
  }

  get activeLeaf(): WorkspaceLeaf {
    return activePluginLeaf ?? this.mainLeaf;
  }

  // Called by the runtime once the app shell has mounted.
  markLayoutReady(): void {
    if (this._layoutReady) return;
    this._layoutReady = true;
    for (const cb of this._layoutReadyCbs.splice(0)) {
      try {
        cb();
      } catch (e) {
        console.error("[narrative] onLayoutReady callback threw", e);
      }
    }
  }

  onLayoutReady(callback: () => unknown): void {
    if (this._layoutReady) callback();
    else this._layoutReadyCbs.push(() => callback());
  }

  // The runtime calls this when Narrative's active page changes, so the main
  // leaf's MarkdownView tracks it and `file-open` fires for plugins.
  notifyActiveFile(file: TFile | null): void {
    const view = this.mainLeaf.view;
    if (view instanceof MarkdownView) view.syncToActivePage(file);
    this.trigger("file-open", file);
    this.trigger("active-leaf-change", this.mainLeaf);
  }

  notifyLayoutChange(): void {
    this.trigger("layout-change");
  }

  getActiveFile(): TFile | null {
    const id = getState().activeId;
    if (id === null) return null;
    return this.app.vault.getFiles().find((f) => f.id === id) ?? null;
  }

  getActiveViewOfType<T extends View>(type: new (...args: never[]) => T): T | null {
    const candidates = [this.activeLeaf.view, this.mainLeaf.view];
    for (const view of candidates) {
      if (view instanceof type) return view;
    }
    return null;
  }

  getLeaf(newLeaf?: boolean | PaneType): WorkspaceLeaf {
    if (newLeaf) {
      const leaf = new WorkspaceLeaf(this.app, "plugin");
      pluginLeaves.push(leaf);
      activePluginLeaf = leaf;
      notifyWorkspace();
      return leaf;
    }
    return this.mainLeaf;
  }

  getMostRecentLeaf(): WorkspaceLeaf {
    return this.mainLeaf;
  }

  getLeftLeaf(_split: boolean): WorkspaceLeaf {
    return this.getLeaf(true);
  }

  getRightLeaf(_split: boolean): WorkspaceLeaf {
    return this.getLeaf(true);
  }

  getLeafById(id: string): WorkspaceLeaf | null {
    if (id === this.mainLeaf.id) return this.mainLeaf;
    return pluginLeaves.find((l) => l.id === id) ?? null;
  }

  getLeavesOfType(viewType: string): WorkspaceLeaf[] {
    const out: WorkspaceLeaf[] = [];
    if (this.mainLeaf.view.getViewType() === viewType) out.push(this.mainLeaf);
    for (const leaf of pluginLeaves) {
      if (leaf.view.getViewType() === viewType) out.push(leaf);
    }
    return out;
  }

  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => unknown): void {
    callback(this.mainLeaf);
    for (const leaf of pluginLeaves) callback(leaf);
  }

  iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => unknown): void {
    callback(this.mainLeaf);
  }

  detachLeavesOfType(viewType: string): void {
    for (const leaf of [...pluginLeaves]) {
      if (leaf.view.getViewType() === viewType) leaf.detach();
    }
  }

  async revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
    if (leaf.kind === "plugin") setActivePluginLeaf(leaf);
  }

  setActiveLeaf(leaf: WorkspaceLeaf, _params?: unknown): void {
    if (leaf.kind === "plugin") setActivePluginLeaf(leaf);
    else setActivePluginLeaf(null);
    this.trigger("active-leaf-change", leaf);
  }

  async openLinkText(
    linktext: string,
    _sourcePath: string,
    _newLeaf?: boolean | PaneType,
  ): Promise<void> {
    const hash = linktext.indexOf("#");
    const title = (hash < 0 ? linktext : linktext.slice(0, hash)).split("|")[0]?.trim() ?? "";
    const anchor = hash < 0 ? null : linktext.slice(hash + 1).trim();
    await actions.openWikilink(title, anchor);
  }

  // `ensureSideLeaf` — plugins call this to guarantee their view is showing.
  async ensureSideLeaf(
    type: string,
    _side: "left" | "right",
    _options?: unknown,
  ): Promise<WorkspaceLeaf> {
    const existing = this.getLeavesOfType(type)[0];
    if (existing) {
      await this.revealLeaf(existing);
      return existing;
    }
    const leaf = this.getLeaf(true);
    await leaf.setViewState({ type, active: true });
    return leaf;
  }

  getLayout(): Record<string, unknown> {
    return {};
  }

  async changeLayout(_layout: unknown): Promise<void> {}

  requestSaveLayout = (): void => {};

  updateOptions(): void {}

  // Saved-search style helpers some plugins call — harmless no-ops here.
  getGroupLeaves(_group: string): WorkspaceLeaf[] {
    return [];
  }

  async openPopoutLeaf(): Promise<WorkspaceLeaf> {
    return this.getLeaf(true);
  }
}
