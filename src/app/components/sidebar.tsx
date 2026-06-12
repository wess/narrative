import {
  Archive,
  Bot,
  Calendar,
  ChevronDown,
  FileText,
  FolderOpen,
  FolderPlus,
  Hash,
  Info,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import type { AgentDef, ChannelDef, PageMeta, ProjectDef } from "../../shared/types.ts";
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

const AgentItem = ({ agent }: { agent: AgentDef }) => {
  const { chat } = useApp();
  const active = chat.agentSlug === agent.slug;
  return (
    <div className="side-agent" data-active={active}>
      <button
        type="button"
        className="side-agent-main"
        title={agent.description || agent.name}
        onClick={() => actions.openAgentProfile(agent.slug)}
      >
        <span className="side-agent-icon">{agent.icon || "\u{1F916}"}</span>
        <span className="side-agent-text">
          <span>{agent.name}</span>
          {agent.provider || agent.model ? (
            <small>{[agent.provider, agent.model].filter(Boolean).join(" / ")}</small>
          ) : (
            <small>App default model</small>
          )}
        </span>
      </button>
      <button
        type="button"
        className="side-agent-edit"
        title="Agent profile"
        onClick={() => actions.openAgentProfile(agent.slug)}
      >
        <Info size={11} />
      </button>
      <button
        type="button"
        className="side-agent-edit"
        title="Edit agent"
        onClick={() => void actions.openAgentEditor("agent", agent.slug)}
      >
        <Pencil size={11} />
      </button>
    </div>
  );
};

const ChannelItem = ({ channel }: { channel: ChannelDef }) => {
  const { chat, agents } = useApp();
  const active = chat.channelSlug === channel.slug;
  const memberNames = channel.agents
    .map((slug) => agents.find((agent) => agent.slug === slug)?.name)
    .filter(Boolean)
    .join(", ");
  return (
    <div className="side-agent" data-active={active}>
      <button
        type="button"
        className="side-agent-main"
        title={channel.description || channel.name}
        onClick={() => actions.openChannelProfile(channel.slug)}
      >
        <span className="side-agent-icon">{channel.icon || "\u{1F4AC}"}</span>
        <span className="side-agent-text">
          <span>{channel.name}</span>
          <small>{memberNames || "No agents assigned"}</small>
        </span>
      </button>
      <button
        type="button"
        className="side-agent-edit"
        title="Channel profile"
        onClick={() => actions.openChannelProfile(channel.slug)}
      >
        <Info size={11} />
      </button>
    </div>
  );
};

const ProjectItem = ({ project }: { project: ProjectDef }) => {
  const { channels } = useApp();
  const linked = project.channelSlug
    ? (channels.find((channel) => channel.slug === project.channelSlug) ?? null)
    : null;
  return (
    <div className="side-agent">
      <button
        type="button"
        className="side-agent-main"
        title={project.path}
        onClick={() => {
          if (linked) actions.openChannelProfile(linked.slug);
        }}
      >
        <span className="side-agent-icon">
          <FolderOpen size={13} />
        </span>
        <span className="side-agent-text">
          <span>{project.name}</span>
          <small>{linked ? `Channel: ${linked.name}` : project.path}</small>
        </span>
      </button>
      <button
        type="button"
        className="side-agent-edit"
        title="Suggest channel"
        onClick={() => void actions.suggestChannelForProject(project.slug)}
      >
        <Sparkles size={11} />
      </button>
      <button
        type="button"
        className="side-agent-edit"
        title="Remove project"
        onClick={() => {
          if (window.confirm(`Remove ${project.name}?`)) void actions.deleteProject(project.slug);
        }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
};

export const Sidebar = () => {
  const {
    tree,
    pinned,
    recents,
    dailies,
    templates,
    tags,
    stats,
    search,
    agents,
    channels,
    projects,
  } = useApp();
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
        <Section
          label="Projects"
          count={projects.length}
          defaultOpen
          action={
            <button
              type="button"
              className="side-section-add"
              title="Add project folder"
              onClick={() => void actions.addProject()}
            >
              <Plus size={13} />
            </button>
          }
        >
          <div className="side-agents">
            {projects.length > 0 ? (
              projects.map((project) => <ProjectItem key={project.slug} project={project} />)
            ) : (
              <button
                type="button"
                className="side-agent-empty"
                onClick={() => void actions.addProject()}
              >
                <FolderOpen size={13} />
                Add a project folder
              </button>
            )}
          </div>
        </Section>
        <Section
          label="Agents"
          count={agents.length}
          defaultOpen
          action={
            <button
              type="button"
              className="side-section-add"
              title="Create agent"
              onClick={() => actions.openAgentWizard()}
            >
              <Plus size={13} />
            </button>
          }
        >
          <div className="side-agents">
            {agents.length > 0 ? (
              agents.map((agent) => <AgentItem key={agent.slug} agent={agent} />)
            ) : (
              <button
                type="button"
                className="side-agent-empty"
                onClick={() => actions.openAgentWizard()}
              >
                <Bot size={13} />
                Create your first agent
              </button>
            )}
          </div>
        </Section>
        <Section
          label="Channels"
          count={channels.length}
          defaultOpen
          action={
            <button
              type="button"
              className="side-section-add"
              title="Create channel"
              onClick={() => actions.openChannelWizard()}
            >
              <Plus size={13} />
            </button>
          }
        >
          <div className="side-agents">
            {channels.length > 0 ? (
              channels.map((channel) => <ChannelItem key={channel.slug} channel={channel} />)
            ) : (
              <button
                type="button"
                className="side-agent-empty"
                onClick={() => actions.openChannelWizard()}
              >
                <Hash size={13} />
                Create your first channel
              </button>
            )}
          </div>
        </Section>
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
