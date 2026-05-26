import { Plus, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

export const CommandPalette = () => {
  const { commandPaletteOpen, commands, agents } = useApp();
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const hay = `${c.name} ${c.description} ${c.slug}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, commands]);

  useEffect(() => {
    if (selected >= filtered.length) setSelected(0);
  }, [filtered.length, selected]);

  if (!commandPaletteOpen) return null;

  const close = () => actions.setCommandPalette(false);
  const run = (slug: string | null) => {
    if (slug) void actions.runCommand(slug);
    else close();
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
      if (chosen) run(chosen.slug);
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
            placeholder="Run a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <ul className="cmdpal-list">
          {filtered.length === 0 ? (
            <li className="cmdpal-empty">No matching commands.</li>
          ) : (
            filtered.map((c, idx) => {
              const agent = c.agent ? agents.find((a) => a.slug === c.agent) : null;
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    className="cmdpal-item"
                    data-active={idx === selected}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => run(c.slug)}
                  >
                    <span className="cmdpal-icon">{c.icon}</span>
                    <span className="cmdpal-text">
                      <span className="cmdpal-name">{c.name}</span>
                      {c.description ? <span className="cmdpal-desc">{c.description}</span> : null}
                    </span>
                    {agent ? (
                      <span className="cmdpal-tag" title="Runs as this agent">
                        {agent.icon} {agent.name}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
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
