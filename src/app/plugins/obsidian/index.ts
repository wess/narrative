// The plugin API module — exactly what a plugin's `require("obsidian")`
// resolves to — the public API surface, re-exported from the focused shim
// files in this folder. Anything a plugin imports from that module should
// be findable here.

// `Command` is part of the public API (plugins type their command objects).
export type { Command, Hotkey } from "../registry.ts";
export type { PluginsApi } from "./app.ts";
export { App, TFile, TFolder } from "./app.ts";
export { Component } from "./component.ts";
export type {
  EditorChange,
  EditorPosition,
  EditorRange,
  EditorSelection,
  EditorTransaction,
} from "./editor.ts";
export { Editor } from "./editor.ts";
export type { EventRef } from "./events.ts";
export { Events } from "./events.ts";
export { addIcon, getIcon, getIconIds, setIcon } from "./icons.ts";
export type { KeymapContext, KeymapEventHandler, KeymapEventListener, Modifier } from "./keymap.ts";
export { Keymap, Scope } from "./keymap.ts";
export type {
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
  MarkdownSectionInformation,
} from "./markdown.ts";

export {
  MarkdownPreviewView,
  MarkdownRenderChild,
  MarkdownRenderer,
  runMarkdownProcessors,
} from "./markdown.ts";
export type {
  CachedMetadata,
  EmbedCache,
  FrontmatterCache,
  HeadingCache,
  LinkCache,
  Loc,
  Pos,
  TagCache,
} from "./metadata.ts";
export { MetadataCache, parseCache } from "./metadata.ts";
export { moment } from "./moment.ts";
export { Plugin } from "./plugin.ts";
export type { RequestUrlParam, RequestUrlResponse } from "./request.ts";
export { request, requestUrl } from "./request.ts";
export {
  BaseComponent,
  ButtonComponent,
  ColorComponent,
  DropdownComponent,
  ExtraButtonComponent,
  MomentFormatComponent,
  PluginSettingTab,
  ProgressBarComponent,
  SearchComponent,
  Setting,
  SettingTab,
  SliderComponent,
  TextAreaComponent,
  TextComponent,
  ToggleComponent,
  ValueComponent,
} from "./setting.ts";
export {
  EditableFileView,
  FileView,
  HoverPopover,
  requireApiVersion,
  TextFileView,
  WorkspaceContainer,
  WorkspaceItem,
  WorkspaceMobileDrawer,
  WorkspaceParent,
  WorkspaceRoot,
  WorkspaceSidedock,
  WorkspaceSplit,
  WorkspaceTabs,
  WorkspaceWindow,
} from "./stubs.ts";
export type { FuzzyMatch, Instruction } from "./suggest.ts";
export {
  AbstractInputSuggest,
  FuzzySuggestModal,
  PopoverSuggest,
  SuggestModal,
} from "./suggest.ts";
export { Menu, MenuItem, Modal, Notice } from "./ui.ts";
export type {
  PreparedQuery,
  SearchMatcher,
  SearchMatchPart,
  SearchResult,
} from "./util.ts";
export {
  apiVersion,
  debounce,
  fuzzySearch,
  getAllTags,
  getLinkpath,
  htmlToMarkdown,
  normalizePath,
  Platform,
  parseFrontMatterAliases,
  parseFrontMatterEntry,
  parseFrontMatterTags,
  parseYaml,
  prepareFuzzySearch,
  prepareQuery,
  prepareSimpleSearch,
  sanitizeHTMLToDom,
  sortSearchResults,
  stringifyYaml,
} from "./util.ts";
export type { FileStats } from "./vault.ts";
export { TAbstractFile, Vault } from "./vault.ts";
export type { OpenViewState, PaneType, ViewState } from "./workspace.ts";
export {
  getActivePluginLeaf,
  getOpenPluginLeaves,
  ItemView,
  MarkdownView,
  subscribeWorkspace,
  View,
  Workspace,
  WorkspaceLeaf,
} from "./workspace.ts";
