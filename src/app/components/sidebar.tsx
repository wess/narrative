import {
  Archive,
  Bot,
  Calendar,
  ChevronDown,
  FileText,
  FolderPlus,
  Hash,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import type { PageMeta } from "../../shared/types.ts";
import { openMenu } from "../lib/contextmenu.ts";
import { buildTagTree } from "../lib/tags.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";
import { buildPageMenu } from "./contextmenu.tsx";
import { PageIcon } from "./icon.tsx";
import { TagTree } from "./tagtree.tsx";
import { Tree } from "./tree.tsx";
import { VaultSwitcher } from "./vaultswitcher.tsx";

const Section = ({
  label,
  count,
  action,
  children,
  defaultOpen = true,
}: {
  label: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="side-section">
      <div className="side-section-head">
        <button type="button" className="side-section-toggle" onClick={() => setOpen((v) => !v)}>
          <ChevronDown size={12} style={{ transform: open ? "none" : "rotate(-90deg)" }} />
          <span>{label}</span>
          {count !== undefined ? <span className="side-count">{count}</span> : null}
        </button>
        {action}
      </div>
      {open ? <div className="side-section-body">{children}</div> : null}
    </div>
  );
};

const FlatItem = ({ page }: { page: PageMeta }) => {
  const { activeId } = useApp();
  return (
    <button
      type="button"
      className="flat-item"
      data-active={page.id === activeId}
      onClick={() => void actions.openPage(page.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, buildPageMenu(page));
      }}
    >
      <PageIcon icon={page.icon} size={14} />
      <span>{page.title || "Untitled"}</span>
    </button>
  );
};

export const Sidebar = () => {
  const { tree, pinned, recents, dailies, templates, tags, stats, search } = useApp();
  const tagTree = useMemo(() => buildTagTree(tags), [tags]);

  return (
    <aside className="sidebar">
      <header className="sidebar-head">
        <VaultSwitcher />
        <div className="sidebar-head-actions">
          <button type="button" title="New page (⌘N)" onClick={() => void actions.createPage(null)}>
            <Plus size={16} />
          </button>
          <button type="button" title="Collapse sidebar" onClick={() => actions.toggleSidebar()}>
            <PanelLeftClose size={16} />
          </button>
        </div>
      </header>

      <div className="sidebar-search">
        <Search size={14} />
        <input
          placeholder="Search everything…"
          value={search.query}
          onChange={(e) => {
            actions.openSearch();
            void actions.runSearch(e.target.value);
          }}
          onFocus={() => actions.openSearch()}
        />
      </div>

      <div className="sidebar-scroll">
        {pinned.length > 0 ? (
          <Section label="Pinned" count={pinned.length}>
            {pinned.map((p) => (
              <FlatItem key={p.id} page={p} />
            ))}
          </Section>
        ) : null}

        {recents.length > 0 ? (
          <Section label="Recent" count={recents.length} defaultOpen={false}>
            {recents.slice(0, 12).map((p) => (
              <FlatItem key={p.id} page={p} />
            ))}
          </Section>
        ) : null}

        {dailies.length > 0 ? (
          <Section label="Daily Notes" count={dailies.length} defaultOpen={false}>
            {dailies.map((p) => (
              <FlatItem key={p.id} page={p} />
            ))}
          </Section>
        ) : null}

        {templates.length > 0 ? (
          <Section label="Templates" count={templates.length} defaultOpen={false}>
            {templates.map((p) => (
              <FlatItem key={p.id} page={p} />
            ))}
          </Section>
        ) : null}

        <Section
          label="Files"
          action={
            <span className="side-section-actions">
              <button
                type="button"
                className="side-section-add"
                title="New folder"
                onClick={() => void actions.createFolder(null)}
              >
                <FolderPlus size={13} />
              </button>
              <button
                type="button"
                className="side-section-add"
                title="New page"
                onClick={() => void actions.createPage(null)}
              >
                <Plus size={13} />
              </button>
            </span>
          }
        >
          {tree.length > 0 ? (
            <Tree nodes={tree} />
          ) : (
            <p className="side-empty">No pages yet — press ⌘N</p>
          )}
        </Section>

        {tags.length > 0 ? (
          <Section label="Tags" count={tags.length} defaultOpen={false}>
            <TagTree nodes={tagTree} onPick={(t) => void actions.openTag(t)} />
          </Section>
        ) : null}
      </div>

      <footer className="sidebar-foot">
        <div className="foot-row">
          <button type="button" className="foot-btn" onClick={() => void actions.createDaily()}>
            <Calendar size={14} />
            Daily note
          </button>
          <button
            type="button"
            className="foot-icon"
            title="AI assistant (⌘J)"
            onClick={() => actions.toggleAi()}
          >
            <Bot size={15} />
          </button>
          <button
            type="button"
            className="foot-icon"
            title="Settings (⌘,)"
            onClick={() => actions.openSettings()}
          >
            <Settings size={15} />
          </button>
        </div>
        {stats ? (
          <div className="foot-stats">
            <span>
              <FileText size={11} /> {stats.pages}
            </span>
            <span>
              <Hash size={11} /> {stats.tags}
            </span>
            <span>
              <Archive size={11} /> {stats.words.toLocaleString()} words
            </span>
          </div>
        ) : null}
      </footer>
    </aside>
  );
};
