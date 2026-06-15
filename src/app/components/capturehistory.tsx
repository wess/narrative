import { ExternalLink, Link, RefreshCw, X } from "lucide-react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

export const CaptureHistory = () => {
  const { captureHistoryOpen, captures } = useApp();

  if (!captureHistoryOpen) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal controls are explicit buttons
    <div className="capturemodal-overlay" onClick={() => actions.closeCaptureHistory()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="capturemodal capturehistory"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="capturemodal-head">
          <div className="capturemodal-icon">
            <Link size={18} />
          </div>
          <div>
            <span>Web capture</span>
            <h2>Capture history</h2>
            <p>Open recently captured sources and their saved pages.</p>
          </div>
          <button
            type="button"
            className="capturemodal-close"
            title="Refresh"
            onClick={() => void actions.refreshCaptures()}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="capturemodal-close"
            title="Close"
            onClick={() => actions.closeCaptureHistory()}
          >
            <X size={15} />
          </button>
        </header>

        <div className="capturehistory-list">
          {captures.length > 0 ? (
            captures.map((capture) => (
              <button
                type="button"
                key={capture.id}
                className="capturehistory-item"
                onClick={() => {
                  actions.closeCaptureHistory();
                  void actions.openPage(capture.pageId);
                }}
              >
                <span>
                  <strong>{capture.title || capture.pageTitle}</strong>
                  <small>{capture.url}</small>
                </span>
                <time dateTime={capture.createdAt}>
                  {new Date(capture.createdAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
                <ExternalLink size={13} />
              </button>
            ))
          ) : (
            <div className="capturehistory-empty">No web captures yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};
