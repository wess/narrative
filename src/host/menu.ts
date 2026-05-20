import { item, type Menu, section, separator } from "@basket/menu";

// Native menu. Standard Edit actions map straight to the OS; everything
// else is an IPC action handled in host/index.ts (`onMenu`).
const menu: Menu = [
  section("File", [
    item("New Page", "page:new", { shortcut: "CmdOrCtrl+N" }),
    item("New Daily Note", "daily:new", { shortcut: "CmdOrCtrl+D" }),
    separator(),
    item("Open Vault…", "vault:open", { shortcut: "CmdOrCtrl+O" }),
    item("New Vault…", "vault:create"),
    item("Switch Vault…", "vault:switch"),
    separator(),
    item("Export Page…", "page:export", { shortcut: "CmdOrCtrl+E" }),
    item("Settings…", "app:settings", { shortcut: "CmdOrCtrl+," }),
    separator(),
    // NB: the action must not contain the literal substring `"quit"` — the
    // macOS shim's pollTimer treats any control message matching that as a
    // hard quit, and the menu definition itself travels as a control message.
    item("Quit", "app:quit", { shortcut: "CmdOrCtrl+Q" }),
  ]),
  section("Edit", [
    // The `edit:` prefix is required — the native shim maps these to the
    // native cut:/copy:/paste:/… responder selectors. Bare names ("copy")
    // fall through to custom-IPC handling and never reach the clipboard.
    item("Undo", "edit:undo", { shortcut: "CmdOrCtrl+Z" }),
    item("Redo", "edit:redo", { shortcut: "CmdOrCtrl+Shift+Z" }),
    separator(),
    item("Cut", "edit:cut", { shortcut: "CmdOrCtrl+X" }),
    item("Copy", "edit:copy", { shortcut: "CmdOrCtrl+C" }),
    item("Paste", "edit:paste", { shortcut: "CmdOrCtrl+V" }),
    item("Select All", "edit:selectall", { shortcut: "CmdOrCtrl+A" }),
  ]),
  section("View", [
    item("Search", "view:search", { shortcut: "CmdOrCtrl+Shift+F" }),
    item("Graph View", "view:graph", { shortcut: "CmdOrCtrl+Shift+G" }),
    item("Tags", "view:tags", { shortcut: "CmdOrCtrl+Shift+T" }),
    item("AI Assistant", "view:ai", { shortcut: "CmdOrCtrl+J" }),
    separator(),
    item("Command Palette", "view:palette", { shortcut: "CmdOrCtrl+K" }),
    item("Toggle Theme", "theme:toggle", { shortcut: "CmdOrCtrl+Shift+L" }),
  ]),
];

export default menu;
