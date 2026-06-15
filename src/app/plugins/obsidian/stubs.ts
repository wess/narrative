// Less-used corners of the plugin API: the `FileView` chain a plugin might
// extend, the workspace-layout classes plugins occasionally `instanceof`, and
// `requireApiVersion`. These are deliberately thin — present so plugins load
// and type-check, faithful enough for the common cases.

import { Events } from "./events.ts";
import { apiVersion } from "./util.ts";
import type { TFile } from "./vault.ts";
import { ItemView, type WorkspaceLeaf } from "./workspace.ts";

// --- FileView chain -------------------------------------------------------

export abstract class FileView extends ItemView {
  file: TFile | null = null;
  allowNoFile = false;

  async onLoadFile(_file: TFile): Promise<void> {}
  async onUnloadFile(_file: TFile): Promise<void> {}

  override async onOpen(): Promise<void> {}

  canAcceptExtension(extension: string): boolean {
    return extension === "md";
  }
}

export abstract class EditableFileView extends FileView {}

export abstract class TextFileView extends EditableFileView {
  data = "";

  abstract getViewData(): string;
  abstract setViewData(data: string, clear: boolean): void;
  abstract clear(): void;

  requestSave(): void {
    // Bethink persists eagerly elsewhere — nothing queued here.
  }
}

// --- workspace layout classes (mostly for `instanceof`) -------------------

export class WorkspaceItem extends Events {
  getRoot(): WorkspaceItem {
    return this;
  }
  getContainer(): WorkspaceItem {
    return this;
  }
}

export class WorkspaceParent extends WorkspaceItem {}
export class WorkspaceContainer extends WorkspaceParent {
  get win(): Window {
    return window;
  }
  get doc(): Document {
    return document;
  }
}
export class WorkspaceSplit extends WorkspaceParent {}
export class WorkspaceTabs extends WorkspaceParent {}
export class WorkspaceRoot extends WorkspaceContainer {}
export class WorkspaceSidedock extends WorkspaceSplit {
  collapsed = false;
  expand(): void {}
  collapse(): void {}
  toggle(): void {}
}
export class WorkspaceMobileDrawer extends WorkspaceParent {}
export class WorkspaceWindow extends WorkspaceContainer {}

// --- hover popover --------------------------------------------------------

export class HoverPopover extends Events {
  hoverEl: HTMLElement;
  constructor(_parent: unknown, _targetEl: HTMLElement | null, _waitTime?: number) {
    super();
    this.hoverEl = document.createElement("div");
    this.hoverEl.className = "narrative-hover-popover";
  }
  hide(): void {
    this.hoverEl.detach();
  }
}

// Re-export so the type is reachable from here too.
export type { WorkspaceLeaf };

// --- version gate ---------------------------------------------------------

const parseVersion = (v: string): number[] =>
  v.split(".").map((part) => Number.parseInt(part, 10) || 0);

export const requireApiVersion = (version: string): boolean => {
  const want = parseVersion(version);
  const have = parseVersion(apiVersion);
  for (let i = 0; i < Math.max(want.length, have.length); i++) {
    const a = have[i] ?? 0;
    const b = want[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
};
