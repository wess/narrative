// `Vault` + the file types (`TFile`, `TFolder`, `TAbstractFile`). This is the
// plugin-API face of Bethink's page store: the `bridge` projects pages onto a
// virtual `.md` filesystem, and the Vault keeps stable `TFile` / `TFolder`
// instances over that projection (plugins compare files by identity) plus
// re-emits the bridge's create/modify/delete/rename signals as `Events`.

import {
  type BridgeListener,
  getBridge,
  type VaultBridge,
  type VaultFileRecord,
  type VaultIndex,
} from "../bridge.ts";
import { Events } from "./events.ts";
import { normalizePath } from "./util.ts";

export type FileStats = { ctime: number; mtime: number; size: number };

export abstract class TAbstractFile {
  vault!: Vault;
  path = "";
  name = "";
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
  stat: FileStats = { ctime: 0, mtime: 0, size: 0 };
  /** Bethink's page id — the real key behind the virtual path. */
  id = 0;
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  /** The page that *is* this folder, or null for the vault root. */
  id: number | null = null;
  isRoot(): boolean {
    return this.parent === null;
  }
}

// `app.vault.adapter` — the low-level path API. We have no real filesystem,
// so it delegates to the same page projection the Vault uses.
class BethinkDataAdapter {
  constructor(private vault: Vault) {}
  getName(): string {
    return "bethink";
  }
  async exists(path: string): Promise<boolean> {
    return this.vault.getAbstractFileByPath(path) !== null;
  }
  async read(path: string): Promise<string> {
    const file = this.vault.getFileByPath(path);
    if (!file) throw new Error(`adapter.read: no file at "${path}"`);
    return this.vault.read(file);
  }
  async readBinary(path: string): Promise<ArrayBuffer> {
    return new TextEncoder().encode(await this.read(path)).buffer as ArrayBuffer;
  }
  async write(path: string, data: string): Promise<void> {
    const file = this.vault.getFileByPath(path);
    if (file) await this.vault.modify(file, data);
    else await this.vault.create(path, data);
  }
  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    await this.write(path, new TextDecoder().decode(data));
  }
  async stat(path: string): Promise<FileStats | null> {
    const file = this.vault.getFileByPath(path);
    return file ? file.stat : null;
  }
  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    const folder = this.vault.getFolderByPath(path) ?? this.vault.getRoot();
    return {
      files: folder.children.filter((c) => c instanceof TFile).map((c) => c.path),
      folders: folder.children.filter((c) => c instanceof TFolder).map((c) => c.path),
    };
  }
  async mkdir(path: string): Promise<void> {
    await this.vault.createFolder(path);
  }
  async remove(path: string): Promise<void> {
    const file = this.vault.getFileByPath(path);
    if (file) await this.vault.delete(file);
  }
  async rename(from: string, to: string): Promise<void> {
    const file = this.vault.getFileByPath(from);
    if (file) await this.vault.rename(file, to);
  }
  getResourcePath(path: string): string {
    return path;
  }
}

export class Vault extends Events {
  adapter: BethinkDataAdapter;
  configDir = "/.narrative";

  private bridge: VaultBridge;
  private filesById = new Map<number, TFile>();
  private foldersByPath = new Map<string, TFolder>(); // key: lower path, "" = root

  constructor(bridge?: VaultBridge) {
    super();
    this.bridge = bridge ?? getBridge();
    this.adapter = new BethinkDataAdapter(this);
    this.reconcile(this.bridge.index());

    const listener: BridgeListener = {
      onIndex: (index) => this.reconcile(index),
      onDiff: (diff) => {
        for (const rec of diff.created) {
          const file = this.filesById.get(rec.id);
          if (file) this.trigger("create", file);
        }
        for (const { record, oldPath } of diff.renamed) {
          const file = this.filesById.get(record.id);
          if (file) this.trigger("rename", file, oldPath);
        }
        for (const rec of diff.deleted) {
          this.trigger("delete", this.buildDetachedFile(rec));
        }
      },
      onModify: (rec) => {
        const file = this.filesById.get(rec.id);
        if (file) this.trigger("modify", file);
      },
    };
    this.bridge.subscribe(listener);
  }

  // --- index reconciliation ----------------------------------------------

  private buildDetachedFile(rec: VaultFileRecord): TFile {
    const file = new TFile();
    file.vault = this;
    this.applyFileRecord(file, rec);
    return file;
  }

  private applyFileRecord(file: TFile, rec: VaultFileRecord): void {
    file.id = rec.id;
    file.path = rec.path;
    file.name = rec.name;
    file.basename = rec.basename;
    file.extension = rec.extension;
    file.stat = { ctime: rec.ctime, mtime: rec.mtime, size: rec.size };
  }

  private reconcile(index: VaultIndex): void {
    // Folders first so files can attach to a live parent.
    const nextFolders = new Map<string, TFolder>();
    for (const [key, rec] of index.folders) {
      const existing = this.foldersByPath.get(key);
      const folder = existing ?? new TFolder();
      folder.vault = this;
      folder.id = rec.id;
      folder.path = rec.path;
      folder.name = rec.name;
      folder.children = []; // refilled below
      nextFolders.set(key, folder);
    }

    const nextFiles = new Map<number, TFile>();
    for (const rec of index.files) {
      const existing = this.filesById.get(rec.id);
      const file = existing ?? new TFile();
      file.vault = this;
      this.applyFileRecord(file, rec);
      nextFiles.set(rec.id, file);
    }

    // Wire parents + children.
    for (const [key, rec] of index.folders) {
      const folder = nextFolders.get(key);
      if (!folder) continue;
      folder.parent =
        rec.parentPath === null ? null : (nextFolders.get(rec.parentPath.toLowerCase()) ?? null);
    }
    for (const rec of index.files) {
      const file = nextFiles.get(rec.id);
      if (!file) continue;
      const parent = nextFolders.get(rec.parentPath.toLowerCase()) ?? nextFolders.get("");
      file.parent = parent ?? null;
      parent?.children.push(file);
    }
    for (const [key, rec] of index.folders) {
      const folder = nextFolders.get(key);
      if (!folder || rec.parentPath === null) continue;
      nextFolders.get(rec.parentPath.toLowerCase())?.children.push(folder);
    }

    this.filesById = nextFiles;
    this.foldersByPath = nextFolders;
  }

  // --- reads --------------------------------------------------------------

  getName(): string {
    return "Bethink";
  }

  getRoot(): TFolder {
    let root = this.foldersByPath.get("");
    if (!root) {
      root = new TFolder();
      root.vault = this;
      root.path = "/";
      this.foldersByPath.set("", root);
    }
    return root;
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    const norm = normalizePath(path);
    const key = norm.toLowerCase();
    for (const file of this.filesById.values()) {
      if (file.path.toLowerCase() === key) return file;
    }
    return this.foldersByPath.get(key) ?? (key === "/" ? this.getRoot() : null);
  }

  getFileByPath(path: string): TFile | null {
    const file = this.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  getFolderByPath(path: string): TFolder | null {
    const file = this.getAbstractFileByPath(path);
    return file instanceof TFolder ? file : null;
  }

  getFiles(): TFile[] {
    return [...this.filesById.values()];
  }

  getMarkdownFiles(): TFile[] {
    return this.getFiles();
  }

  getAllLoadedFiles(): TAbstractFile[] {
    return [...this.foldersByPath.values(), ...this.filesById.values()];
  }

  async read(file: TFile): Promise<string> {
    return this.bridge.readPage(file.id);
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.bridge.readPage(file.id);
  }

  async readBinary(file: TFile): Promise<ArrayBuffer> {
    const text = await this.read(file);
    return new TextEncoder().encode(text).buffer as ArrayBuffer;
  }

  getResourcePath(_file: TFile): string {
    return "";
  }

  // --- mutations ----------------------------------------------------------

  async create(path: string, data: string): Promise<TFile> {
    const rec = await this.bridge.createPage(path, data);
    const existing = this.filesById.get(rec.id);
    if (existing) return existing;
    const file = this.buildDetachedFile(rec);
    this.filesById.set(rec.id, file);
    return file;
  }

  async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
    return this.create(path, new TextDecoder().decode(data));
  }

  async createFolder(path: string): Promise<TFolder> {
    await this.bridge.createFolder(path);
    const folder = this.getFolderByPath(path);
    if (folder) return folder;
    const stub = new TFolder();
    stub.vault = this;
    stub.path = normalizePath(path);
    stub.name = stub.path.split("/").pop() ?? stub.path;
    return stub;
  }

  async modify(file: TFile, data: string): Promise<void> {
    await this.bridge.modifyPage(file.id, data);
  }

  async modifyBinary(file: TFile, data: ArrayBuffer): Promise<void> {
    await this.modify(file, new TextDecoder().decode(data));
  }

  async append(file: TFile, data: string): Promise<void> {
    const current = await this.read(file);
    await this.modify(file, current + data);
  }

  // The atomic read-modify-write helper.
  async process(file: TFile, fn: (data: string) => string): Promise<string> {
    const current = await this.read(file);
    const next = fn(current);
    await this.modify(file, next);
    return next;
  }

  async delete(file: TAbstractFile, _force?: boolean): Promise<void> {
    const id = file instanceof TFile ? file.id : file instanceof TFolder ? file.id : null;
    if (id !== null) await this.bridge.deletePage(id);
  }

  async trash(file: TAbstractFile, _system?: boolean): Promise<void> {
    await this.delete(file);
  }

  async rename(file: TAbstractFile, newPath: string): Promise<void> {
    const id = file instanceof TFile ? file.id : file instanceof TFolder ? file.id : null;
    if (id !== null) await this.bridge.renamePage(id, newPath);
  }

  async copy(file: TFile, newPath: string): Promise<TFile> {
    const data = await this.read(file);
    return this.create(newPath, data);
  }
}
