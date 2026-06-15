import { subscribe } from "@basket/ipc/client";
import { Palette, type PaletteCommand } from "@basket/ui/palette";
import { Toaster } from "@basket/ui/toast";
import { useEffect, useMemo } from "react";
import * as ch from "../shared/channels.ts";
import { AgentEditor } from "./components/agenteditor.tsx";
import { AgentGuide } from "./components/agentguide.tsx";
import { AgentProfile } from "./components/agentprofile.tsx";
import { AgentWizard } from "./components/agentwizard.tsx";
import { AiChat } from "./components/aichat.tsx";
import { Backlinks } from "./components/backlinks.tsx";
import { BasesView } from "./components/basesview.tsx";
import { CanvasView } from "./components/canvasview.tsx";
import { CaptureHistory } from "./components/capturehistory.tsx";
import { CaptureModal } from "./components/capturemodal.tsx";
import { ChannelProfile } from "./components/channelprofile.tsx";
import { ChannelWizard } from "./components/channelwizard.tsx";
import { CommandPalette } from "./components/commandpalette.tsx";
import { ContextMenuHost } from "./components/contextmenu.tsx";
import { Editor } from "./components/editor.tsx";
import { FindBar } from "./components/findbar.tsx";
import { FirstSetup } from "./components/firstsetup.tsx";
import { GraphView } from "./components/graphview.tsx";
import { HoverPreview } from "./components/hoverpreview.tsx";
import { Kanban } from "./components/kanban.tsx";
import { MemoryManager } from "./components/memorymanager.tsx";
import { Outgoing } from "./components/outgoing.tsx";
import { Outline } from "./components/outline.tsx";
import { PluginPanel, PluginStatusBar } from "./components/plugins.tsx";
import { ProjectInspector } from "./components/projectinspector.tsx";
import { ReadingPane } from "./components/readingpane.tsx";
import { ReviewQueue } from "./components/reviewqueue.tsx";
import { RunTimeline } from "./components/runtimeline.tsx";
import { SearchView } from "./components/searchview.tsx";
import { Settings } from "./components/settings.tsx";
import { Sidebar } from "./components/sidebar.tsx";
import { TabBar } from "./components/tabbar.tsx";
import { TagsView } from "./components/tagsview.tsx";
import { Topbar } from "./components/topbar.tsx";
import { VaultPicker } from "./components/vaultpicker.tsx";
import { Workflows } from "./components/workflows.tsx";
import { flattenTree } from "./lib/tree.ts";
import { useRegistry } from "./plugins/registry.ts";
import { pluginRuntime } from "./plugins/runtime.ts";
import { actions } from "./state/actions.ts";
import { getState, setState, type Theme, useApp } from "./state/store.ts";

const systemDark = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

const resolveTheme = (theme: Theme): "light" | "dark" =>
  theme === "auto" ? (systemDark() ? "dark" : "light") : theme;

const applyTheme = (resolved: "light" | "dark"): void => {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.basketTheme = resolved;
};

// Native menu items emit `runCommand` events — this maps them to actions.
const handleCommand = (cmd: string): void => {
  switch (cmd) {
    case "search":
      actions.setView("search");
      break;
    case "graph":
      void actions.openGraph();
      break;
    case "tags":
      actions.setView("tags");
      break;
    case "palette":
      actions.setPalette(true);
      break;
    case "theme":
      actions.cycleTheme();
      break;
    case "export":
      void actions.exportActive();
      break;
    case "settings":
      actions.openSettings();
      break;
    case "ai":
      actions.toggleAi();
      break;
    case "vault-open":
    case "vault-switch":
      void actions.pickVault("open");
      break;
    case "vault-create":
      void actions.pickVault("create");
      break;
    default:
      break;
  }
};

export const App = () => {
  const state = useApp();
  const registry = useRegistry();
  const { view, activePage, paletteOpen, sidebarCollapsed, panelOpen, theme, loading } = state;

  useEffect(() => {
    void actions.init().then(() => {
      // Plugins load once the vault tree is in place — the bridge builds its
      // page↔path index off it.
      void pluginRuntime.start().then(() => pluginRuntime.markLayoutReady());
    });
  }, []);

  // Webview-only keyboard shortcuts (not covered by the native menu).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        actions.toggleFind();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        actions.setCommandPalette(true);
      } else if (mod && e.key.toLowerCase() === "w" && getState().tabs.length > 1) {
        const id = getState().activeId;
        if (id !== null) {
          e.preventDefault();
          actions.closeTab(id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Host -> webview events.
  useEffect(() => {
    const offs = [
      subscribe(ch.treeChanged, () => {
        void actions.refreshTree();
        if (getState().view === "graph") void actions.openGraph();
      }),
      subscribe(ch.pageSaved, (page) => {
        // Keep the open editor in step with the file on disk — covers our
        // own saves and external edits the vault watcher picked up.
        if (getState().activeId === page.id) {
          setState({ activePage: page });
          void actions.reloadBacklinks(page.id);
        }
      }),
      subscribe(ch.focusPage, ({ id }) => {
        void actions.openPage(id);
      }),
      subscribe(ch.vaultChanged, () => {
        void actions.reloadVault();
      }),
      subscribe(ch.runCommand, (cmd) => handleCommand(cmd)),
      subscribe(ch.aiChunk, ({ requestId, delta }) => {
        actions.applyAiChunk(requestId, delta);
      }),
      subscribe(ch.aiSources, ({ requestId, titles }) => {
        actions.applyAiSources(requestId, titles);
      }),
      subscribe(ch.aiToolCall, ({ requestId, call }) => {
        actions.applyAiToolCall(requestId, call);
      }),
      subscribe(ch.agentsChanged, () => {
        void actions.refreshAgents();
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);

  // Theme: apply now, and track the system setting while on "auto".
  useEffect(() => {
    applyTheme(resolveTheme(theme));
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const base: PaletteCommand[] = [
      { id: "cmd-new", label: "New page", hint: "⌘N", action: () => void actions.createPage(null) },
      {
        id: "cmd-daily",
        label: "Open today's daily note",
        hint: "⌘D",
        action: () => void actions.createDaily(),
      },
      {
        id: "cmd-search",
        label: "Search pages",
        hint: "⌘⇧F",
        action: () => actions.setView("search"),
      },
      {
        id: "cmd-graph",
        label: "Open graph view",
        hint: "⌘⇧G",
        action: () => void actions.openGraph(),
      },
      { id: "cmd-tags", label: "Browse tags", hint: "⌘⇧T", action: () => actions.setView("tags") },
      {
        id: "cmd-bases",
        label: "Open table",
        keywords: ["properties", "metadata", "tables", "bases"],
        action: () => void actions.openBases(),
      },
      {
        id: "cmd-canvas",
        label: "Open canvas",
        keywords: ["map", "workspace", "agents", "projects"],
        action: () => void actions.openCanvas(),
      },
      {
        id: "cmd-kanban",
        label: "Open Kanban board",
        keywords: ["project", "cards", "tasks", "agents"],
        action: () => void actions.openKanban(),
      },
      {
        id: "cmd-workflows",
        label: "Open workflows",
        keywords: ["automation", "n8n", "canvas", "triggers"],
        action: () => void actions.openWorkflows(),
      },
      {
        id: "cmd-capture",
        label: "Capture web page",
        keywords: ["clip", "web", "url"],
        action: () => actions.openCapture(),
      },
      {
        id: "cmd-random",
        label: "Open a random page",
        keywords: ["shuffle", "surprise"],
        action: () => actions.openRandomPage(),
      },
      {
        id: "cmd-find",
        label: "Find in page",
        hint: "⌘F",
        keywords: ["search note"],
        action: () => actions.toggleFind(),
      },
      {
        id: "cmd-ai",
        label: "Toggle AI assistant",
        hint: "⌘J",
        keywords: ["chat", "assistant"],
        action: () => actions.toggleAi(),
      },
      {
        id: "cmd-summarize",
        label: "Summarise current page with AI",
        keywords: ["ai", "summary"],
        action: () => {
          const id = getState().activeId;
          if (id !== null) void actions.summarizePage(id);
        },
      },
      {
        id: "cmd-settings",
        label: "Open settings",
        hint: "⌘,",
        keywords: ["preferences", "ai", "provider"],
        action: () => actions.openSettings(),
      },
      { id: "cmd-theme", label: "Toggle theme", hint: "⌘⇧L", action: () => actions.cycleTheme() },
      {
        id: "cmd-export",
        label: "Export current page",
        hint: "⌘E",
        action: () => void actions.exportActive(),
      },
    ];
    const pages = flattenTree(state.tree)
      .filter((node) => node.kind === "file")
      .map<PaletteCommand>((node) => ({
        id: `page-${node.id}`,
        label: node.title || "Untitled",
        hint: "page",
        keywords: ["go", "open", "page"],
        icon: node.icon || undefined,
        action: () => void actions.openPage(node.id),
      }));
    // Plugin-contributed commands land in the same palette as Bethink's own.
    const pluginCommands = registry.commands.map<PaletteCommand>((cmd) => ({
      id: `plugin-${cmd.id}`,
      label: cmd.name,
      hint: "plugin",
      keywords: ["plugin", cmd.pluginId],
      action: () => {
        pluginRuntime.getApp().commands.executeCommandById(cmd.id);
      },
    }));
    return [...base, ...pluginCommands, ...pages];
  }, [state.tree, registry.commands]);

  // No vault open — the picker takes over the whole window.
  if (!state.vault) return <VaultPicker />;

  return (
    <div
      className="app"
      data-sidebar={sidebarCollapsed ? "collapsed" : "open"}
      data-ai={state.aiOpen ? "open" : "closed"}
      data-loading={loading}
    >
      {sidebarCollapsed ? null : <Sidebar />}

      <main className="main">
        <Topbar />
        {view === "editor" ? <TabBar /> : null}
        {state.findOpen ? <FindBar /> : null}
        <div className="workspace">
          {view === "editor" ? (
            <>
              <div className="workspace-doc">
                <Editor />
                {state.splitId !== null ? <ReadingPane /> : null}
              </div>
              {panelOpen && activePage ? (
                <aside className="panel">
                  <div className="panel-section">
                    <h3>Outline</h3>
                    <Outline body={activePage.body} />
                  </div>
                  <div className="panel-section">
                    <h3>Links from here</h3>
                    <Outgoing />
                  </div>
                  <div className="panel-section panel-grow">
                    <h3>Backlinks</h3>
                    <Backlinks />
                  </div>
                </aside>
              ) : null}
            </>
          ) : null}
          {view === "graph" ? <GraphView /> : null}
          {view === "search" ? <SearchView /> : null}
          {view === "tags" ? <TagsView /> : null}
          {view === "bases" ? <BasesView /> : null}
          {view === "canvas" ? <CanvasView /> : null}
          <PluginPanel />
        </div>
        <PluginStatusBar />
      </main>

      {state.aiOpen ? <AiChat /> : null}

      <Palette
        open={paletteOpen}
        onClose={() => actions.setPalette(false)}
        commands={commands}
        placeholder="Jump to a page or run a command…"
      />
      <Settings />
      <CommandPalette />
      <AgentEditor />
      <AgentGuide />
      <AgentProfile />
      <AgentWizard />
      <ChannelProfile />
      <ChannelWizard />
      <ProjectInspector />
      <Kanban />
      <Workflows />
      <CaptureHistory />
      <CaptureModal />
      <FirstSetup />
      <RunTimeline />
      <MemoryManager />
      <ReviewQueue />
      <ContextMenuHost />
      <HoverPreview />
      <Toaster />
    </div>
  );
};
