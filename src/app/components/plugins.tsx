// The React mount points for plugin-contributed UI. Plugins build their
// ribbon icons, status-bar items and views as real DOM elements (that's the
// plugin contract); these components just portal those elements into the
// app shell and re-render when the registries change.

import { X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  getActivePluginLeaf,
  getOpenPluginLeaves,
  getWorkspaceVersion,
  setActivePluginLeaf,
  subscribeWorkspace,
} from "../plugins/obsidian/workspace.ts";
import { useRegistry } from "../plugins/registry.ts";

// The horizontal strip of plugin ribbon icons, shown in the topbar.
export const PluginRibbon = () => {
  const reg = useRegistry();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren(...reg.ribbon.map((item) => item.el));
  }, [reg.ribbon]);

  if (reg.ribbon.length === 0) return null;
  return <div className="plugin-ribbon" ref={ref} />;
};

// Plugin status-bar items, pinned to the bottom edge of the workspace.
export const PluginStatusBar = () => {
  const reg = useRegistry();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren(...reg.statusBar.map((item) => item.el));
  }, [reg.statusBar]);

  if (reg.statusBar.length === 0) return null;
  return <footer className="plugin-status-bar" ref={ref} />;
};

// Hosts plugin-registered custom views. A full workspace tiles leaves freely; we show
// them in one side panel with a tab per open view.
export const PluginPanel = () => {
  useSyncExternalStore(subscribeWorkspace, getWorkspaceVersion, getWorkspaceVersion);
  const leaves = getOpenPluginLeaves();
  const active = getActivePluginLeaf();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = bodyRef.current;
    if (!host) return;
    host.replaceChildren();
    if (active) host.appendChild(active.view.containerEl);
  }, [active]);

  if (leaves.length === 0) return null;

  return (
    <aside className="plugin-panel">
      <div className="plugin-panel-tabs">
        {leaves.map((leaf) => (
          <div key={leaf.id} className="plugin-panel-tab" data-active={leaf === active}>
            <button type="button" onClick={() => setActivePluginLeaf(leaf)}>
              {leaf.getDisplayText()}
            </button>
            <button
              type="button"
              className="plugin-panel-close"
              title="Close view"
              onClick={() => leaf.detach()}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="plugin-panel-body" ref={bodyRef} />
    </aside>
  );
};
