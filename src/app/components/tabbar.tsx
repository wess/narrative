import { X } from "lucide-react";
import { findNode } from "../lib/tree.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";
import { PageIcon } from "./icon.tsx";

// Open documents as tabs. Click to switch, middle-click or × to close.
export const TabBar = () => {
  const { tabs, activeId, tree } = useApp();
  if (tabs.length <= 1) return null;

  return (
    <div className="tabbar">
      {tabs.map((id) => {
        const node = findNode(tree, id);
        return (
          <div
            key={id}
            className="tab"
            data-active={id === activeId}
            onClick={() => void actions.openPage(id)}
            onAuxClick={(e) => {
              if (e.button === 1) actions.closeTab(id);
            }}
          >
            <PageIcon icon={node?.icon ?? ""} size={13} />
            <span className="tab-title">{node?.title || "Untitled"}</span>
            <button
              type="button"
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                actions.closeTab(id);
              }}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
