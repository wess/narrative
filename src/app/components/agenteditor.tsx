import { Save, Trash2, X } from "lucide-react";
import { useEffect } from "react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

export const AgentEditor = () => {
  const { agentEditor } = useApp();

  // biome-ignore lint/correctness/useExhaustiveDependencies: only the open transition matters
  useEffect(() => {
    if (!agentEditor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        actions.closeAgentEditor();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void actions.saveAgentEditor();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agentEditor?.open]);

  if (!agentEditor) return null;
  const { kind, slug, path, body, dirty } = agentEditor;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled at window level
    <div className="agentedit-overlay" onClick={() => actions.closeAgentEditor()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled at window level */}
      <div
        className="agentedit"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="agentedit-head">
          <span className="agentedit-title">
            {kind === "agent" ? "Edit agent" : kind === "channel" ? "Edit channel" : "Edit command"}{" "}
            — <code>{path}</code>
            {dirty ? <span className="agentedit-dirty">●</span> : null}
          </span>
          <span className="agentedit-spacer" />
          <button
            type="button"
            className="agentedit-btn"
            title="Save (⌘S)"
            onClick={() => void actions.saveAgentEditor()}
            disabled={!dirty}
          >
            <Save size={13} /> Save
          </button>
          <button
            type="button"
            className="agentedit-btn agentedit-del"
            title="Delete"
            onClick={() => {
              if (slug && window.confirm(`Delete ${slug}?`)) {
                void actions.deleteAgentFile(kind, slug);
              }
            }}
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            className="agentedit-btn"
            title="Close (Esc)"
            onClick={() => actions.closeAgentEditor()}
          >
            <X size={13} />
          </button>
        </header>
        <textarea
          className="agentedit-area"
          value={body}
          spellCheck={false}
          onChange={(e) => actions.updateAgentEditorBody(e.target.value)}
        />
        <footer className="agentedit-foot">
          {kind === "agent" ? (
            <span>
              Frontmatter: <code>name</code>, <code>description</code>, <code>icon</code>,{" "}
              <code>model</code>, <code>provider</code>, <code>tools: [...]</code>. The body is the
              system prompt.
            </span>
          ) : kind === "channel" ? (
            <span>
              Frontmatter: <code>name</code>, <code>description</code>, <code>icon</code>,{" "}
              <code>mode</code>, <code>agents: [...]</code>, <code>context: [...]</code>. The body
              is the channel brief.
            </span>
          ) : (
            <span>
              Frontmatter: <code>name</code>, <code>description</code>, <code>icon</code>,{" "}
              <code>agent</code> (slug). The body is sent as the user message when the command runs.
            </span>
          )}
        </footer>
      </div>
    </div>
  );
};
