import { Plus, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flattenTree } from "../lib/tree.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

type QuickItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly kind: string;
  readonly search: string;
  readonly action: () => void;
};

export const CommandPalette = () => {
  const { commandPaletteOpen, commands, agents, channels, projects, tags, tree } = useApp();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [commandPaletteOpen]);

  const items = useMemo<QuickItem[]>(() => {
    const pages = flattenTree(tree)
      .filter((node) => node.kind === "file")
      .map<QuickItem>((node) => ({
        id: `page-${node.id}`,
        name: node.title || "Untitled",
        description: "Open note",
        icon: node.icon || "📄",
        kind: "note",
        search: `${node.title} note page`,
        action: () => void actions.openPage(node.id),
      }));
    return [
      ...commands.map<QuickItem>((command) => {
        const agent = command.agent ? agents.find((item) => item.slug === command.agent) : null;
        return {
          id: `command-${command.slug}`,
          name: command.name,
          description: command.description || "Run assistant command",
          icon: command.icon,
          kind: agent ? `command · ${agent.name}` : "command",
          search: `${command.name} ${command.description} ${command.slug} command assistant`,
          action: () => void actions.runCommand(command.slug),
        };
      }),
      ...pages,
      ...agents.map<QuickItem>((agent) => ({
        id: `agent-${agent.slug}`,
        name: agent.name,
        description: agent.description || "Chat with this agent",
        icon: agent.icon,
        kind: "agent",
        search: `${agent.name} ${agent.description} ${agent.slug} agent assistant`,
        action: () => {
          actions.setAgent(agent.slug);
          actions.openAi();
          actions.openAgentProfile(agent.slug);
        },
      })),
      ...channels.map<QuickItem>((channel) => ({
        id: `channel-${channel.slug}`,
        name: channel.name,
        description: channel.description || "Open this agent channel",
        icon: channel.icon || "#",
        kind: "channel",
        search: `${channel.name} ${channel.description} ${channel.slug} channel agents`,
        action: () => {
          actions.setChannel(channel.slug);
          actions.openAi();
          void actions.openChannelProfile(channel.slug);
        },
      })),
      ...projects.map<QuickItem>((project) => ({
        id: `project-${project.slug}`,
        name: project.name,
        description: project.path,
        icon: "▣",
        kind: "project",
        search: `${project.name} ${project.path} ${project.slug} project files`,
        action: () => void actions.openProjectInspector(project.slug),
      })),
      ...tags.map<QuickItem>((tag) => ({
        id: `tag-${tag.tag}`,
        name: `#${tag.tag}`,
        description: `${tag.count} note${tag.count === 1 ? "" : "s"}`,
        icon: "#",
        kind: "tag",
        search: `${tag.tag} tag notes`,
        action: () => void actions.openTag(tag.tag),
      })),
      {
        id: "inbox",
        name: "Agent inbox",
        description: "Review runs and proposed changes",
        icon: "!",
        kind: "activity",
        search: "agent inbox notifications unread activity review",
        action: () => void actions.openInbox(),
      },
      {
        id: "settings-ai",
        name: "AI settings",
        description: "Choose local AI or an API key",
        icon: "⚙",
        kind: "settings",
        search: "settings preferences ai provider model key",
        action: () => actions.openSettings("ai"),
      },
    ];
  }, [commands, agents, channels, projects, tags, tree]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.search.toLowerCase().includes(q));
  }, [query, items]);

  useEffect(() => {
    if (selected >= filtered.length) setSelected(0);
  }, [filtered.length, selected]);

  if (!commandPaletteOpen) return null;

  const close = () => actions.setCommandPalette(false);
  const run = (item: QuickItem | null) => {
    close();
    item?.action();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (filtered.length === 0 ? 0 : (s + 1) % filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (filtered.length === 0 ? 0 : (s - 1 + filtered.length) % filtered.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = filtered[selected];
      if (chosen) run(chosen);
    }
  };

  const createNew = async () => {
    close();
    const name = window.prompt("Command name:", "New Command");
    if (name?.trim()) await actions.createCommandFile(name.trim());
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes on click — fully replaced by escape/enter for keyboard users
    // biome-ignore lint/a11y/useKeyWithClickEvents: same — the input below owns keyboard
    <div className="cmdpal-overlay" onClick={close}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by inner input */}
      <div className="cmdpal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="cmdpal-head">
          <Sparkles size={14} />
          <input
            ref={inputRef}
            className="cmdpal-input"
            placeholder="Jump to notes, agents, projects, or commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <ul className="cmdpal-list">
          {filtered.length === 0 ? (
            <li className="cmdpal-empty">No matching item.</li>
          ) : (
            filtered.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="cmdpal-item"
                  data-active={idx === selected}
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => run(item)}
                >
                  <span className="cmdpal-icon">{item.icon}</span>
                  <span className="cmdpal-text">
                    <span className="cmdpal-name">{item.name}</span>
                    <span className="cmdpal-desc">{item.description}</span>
                  </span>
                  <span className="cmdpal-tag">{item.kind}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="cmdpal-foot">
          <button type="button" className="cmdpal-new" onClick={createNew}>
            <Plus size={11} /> New command…
          </button>
          <span className="cmdpal-hint">↑↓ select · Enter run · Esc close</span>
        </div>
      </div>
    </div>
  );
};
