import { Pin, PinOff, RefreshCw, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { MemoryScope } from "../../shared/types.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const MemoryManager = () => {
  const { memoryManagerOpen, memories, agents, channels } = useApp();
  const [scope, setScope] = useState<MemoryScope | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return memories.filter((memory) => {
      if (scope !== "all" && memory.scope !== scope) return false;
      if (!term) return true;
      return memory.content.toLowerCase().includes(term);
    });
  }, [memories, query, scope]);

  if (!memoryManagerOpen) return null;

  const agentName = (slug: string | null): string | null =>
    slug ? (agents.find((agent) => agent.slug === slug)?.name ?? slug) : null;
  const channelName = (slug: string | null): string | null =>
    slug ? (channels.find((channel) => channel.slug === slug)?.name ?? slug) : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal controls are explicit buttons
    <div className="memorymanager-overlay" onClick={() => actions.closeMemoryManager()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="memorymanager"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="memorymanager-head">
          <div>
            <span>Agent memory</span>
            <h2>Memory manager</h2>
            <p>Review, pin, or delete what agents remember from prior work.</p>
          </div>
          <div className="memorymanager-actions">
            <button type="button" title="Refresh" onClick={() => void actions.refreshMemories()}>
              <RefreshCw size={14} />
            </button>
            <button type="button" title="Close" onClick={() => actions.closeMemoryManager()}>
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="memorymanager-toolbar">
          {(["all", "global", "channel"] as const).map((item) => (
            <button
              type="button"
              key={item}
              data-active={scope === item}
              onClick={() => setScope(item)}
            >
              {item === "all" ? "All" : item === "global" ? "Global" : "Channel"}
            </button>
          ))}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memories"
          />
        </div>

        <div className="memorymanager-body">
          {filtered.length === 0 ? (
            <p className="memorymanager-empty">No memories match this view.</p>
          ) : (
            filtered.map((memory) => (
              <article key={memory.id} className="memorymanager-item" data-pinned={memory.pinned}>
                <header>
                  <strong>{memory.scope === "global" ? "Global" : "Channel"}</strong>
                  {channelName(memory.channelSlug) ? (
                    <span>{channelName(memory.channelSlug)}</span>
                  ) : null}
                  {agentName(memory.agentSlug) ? <span>{agentName(memory.agentSlug)}</span> : null}
                  <small>{formatWhen(memory.updatedAt)}</small>
                </header>
                <p>{memory.content}</p>
                <footer>
                  <button
                    type="button"
                    onClick={() => void actions.pinMemory(memory.id, !memory.pinned)}
                  >
                    {memory.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                    {memory.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    data-danger="true"
                    onClick={() => {
                      if (window.confirm("Delete this memory?"))
                        void actions.deleteMemory(memory.id);
                    }}
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                </footer>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
