import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Columns2,
  Download,
  Hash,
  Network,
  PanelLeftOpen,
  PanelRight,
  Pin,
  Search,
  Trash2,
} from "lucide-react";
import type { TreeNode } from "../../shared/types.ts";
import { findNode } from "../lib/tree.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";
import { PageIcon } from "./icon.tsx";
import { PluginRibbon } from "./plugins.tsx";

const breadcrumb = (tree: readonly TreeNode[], id: number): TreeNode[] => {
  const chain: TreeNode[] = [];
  let node = findNode(tree, id);
  while (node) {
    chain.unshift(node);
    node = node.parentId === null ? undefined : findNode(tree, node.parentId);
  }
  return chain;
};

export const Topbar = () => {
  const {
    view,
    activePage,
    tree,
    panelOpen,
    sidebarCollapsed,
    tagFilter,
    search,
    aiOpen,
    history,
    historyAt,
    splitId,
  } = useApp();

  const crumbs = view === "editor" && activePage ? breadcrumb(tree, activePage.id) : [];
  const canBack = historyAt > 0;
  const canForward = historyAt < history.length - 1;

  return (
    <header className="topbar">
      <div className="topbar-left">
        {sidebarCollapsed ? (
          <button
            type="button"
            className="icon-btn"
            title="Open sidebar"
            onClick={() => actions.toggleSidebar()}
          >
            <PanelLeftOpen size={16} />
          </button>
        ) : null}

        <div className="nav-buttons">
          <button
            type="button"
            className="icon-btn"
            title="Back"
            disabled={!canBack}
            onClick={() => void actions.goBack()}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Forward"
            disabled={!canForward}
            onClick={() => void actions.goForward()}
          >
            <ArrowRight size={16} />
          </button>
        </div>

        {view === "editor" && activePage ? (
          <nav className="breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.id} className="crumb">
                {i > 0 ? <span className="crumb-sep">/</span> : null}
                <button type="button" onClick={() => void actions.openPage(c.id)}>
                  <PageIcon icon={c.icon} size={14} />
                  {c.title || "Untitled"}
                </button>
              </span>
            ))}
          </nav>
        ) : null}

        {view === "graph" ? (
          <span className="view-label">
            <Network size={15} /> Knowledge Graph
          </span>
        ) : null}
        {view === "search" ? (
          <span className="view-label">
            <Search size={15} /> {search.query ? `Results for “${search.query}”` : "Search"}
          </span>
        ) : null}
        {view === "tags" ? (
          <span className="view-label">
            <Hash size={15} /> {tagFilter.tag ?? "Tags"}
          </span>
        ) : null}
      </div>

      <div className="topbar-right">
        {view === "editor" && activePage ? (
          <>
            <button
              type="button"
              className="icon-btn"
              title="Summarise with AI"
              onClick={() => void actions.summarizePage(activePage.id)}
            >
              <Bot size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              data-on={activePage.pinned}
              title={activePage.pinned ? "Unpin" : "Pin"}
              onClick={() => void actions.togglePin(activePage.id, !activePage.pinned)}
            >
              <Pin size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Export as Markdown (⌘E)"
              onClick={() => void actions.exportActive()}
            >
              <Download size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              data-on={splitId !== null}
              title={splitId !== null ? "Close split view" : "Open split view"}
              onClick={() => actions.setSplit(splitId !== null ? null : activePage.id)}
            >
              <Columns2 size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Delete page"
              onClick={() => void actions.deletePage(activePage.id)}
            >
              <Trash2 size={15} />
            </button>

            <button
              type="button"
              className="icon-btn"
              data-on={panelOpen}
              title="Toggle backlinks panel"
              onClick={() => actions.togglePanel()}
            >
              <PanelRight size={15} />
            </button>
          </>
        ) : null}

        {view !== "editor" ? (
          <button type="button" className="text-btn" onClick={() => actions.setView("editor")}>
            Back to editor
          </button>
        ) : null}

        <PluginRibbon />

        <button
          type="button"
          className="icon-btn"
          data-on={aiOpen}
          title="AI assistant (⌘J)"
          onClick={() => actions.toggleAi()}
        >
          <Bot size={15} />
        </button>
      </div>
    </header>
  );
};
