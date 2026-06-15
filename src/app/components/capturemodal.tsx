import { Link, Save, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

export const CaptureModal = () => {
  const { captureOpen } = useApp();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (!captureOpen) return null;

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const ok = await actions.captureWeb({
      url: trimmed,
      title: title.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (ok) {
      setUrl("");
      setTitle("");
      setNotes("");
    }
  };

  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void submit();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal controls are explicit buttons
    <div className="capturemodal-overlay" onClick={() => actions.closeCapture()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="capturemodal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="capturemodal-head">
          <div className="capturemodal-icon">
            <Link size={18} />
          </div>
          <div>
            <span>Web capture</span>
            <h2>Clip a page</h2>
            <p>Save a URL as a Markdown page with source metadata.</p>
          </div>
          <button
            type="button"
            className="capturemodal-close"
            onClick={() => actions.closeCapture()}
          >
            <X size={15} />
          </button>
        </header>

        <div className="capturemodal-body">
          <label>
            URL
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="example.com/article"
            />
          </label>
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="Use page title"
            />
          </label>
          <label>
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional context for why this capture matters"
            />
          </label>
        </div>

        <footer className="capturemodal-foot">
          <button type="button" className="capturemodal-btn" onClick={() => actions.closeCapture()}>
            Cancel
          </button>
          <button
            type="button"
            className="capturemodal-btn capturemodal-primary"
            disabled={!url.trim() || saving}
            onClick={() => void submit()}
          >
            <Save size={13} />
            {saving ? "Capturing..." : "Capture"}
          </button>
        </footer>
      </div>
    </div>
  );
};
