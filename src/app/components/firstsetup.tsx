import { FilePlus, FolderOpen, MessageCircle, Search, X } from "lucide-react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

export const FirstSetup = () => {
  const { firstSetupOpen, activePage } = useApp();
  if (!firstSetupOpen) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal controls are explicit buttons
    <div className="firstsetup-overlay" onClick={() => actions.dismissFirstSetup()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="firstsetup"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="firstsetup-head">
          <div>
            <span>Get started</span>
            <h2>Start with your notes</h2>
            <p>
              Create a page, open an existing notes folder, search, or ask about the page you are
              reading.
            </p>
          </div>
          <button
            type="button"
            className="firstsetup-close"
            title="Dismiss"
            onClick={() => actions.dismissFirstSetup()}
          >
            <X size={15} />
          </button>
        </header>

        <div className="firstsetup-steps">
          <button
            type="button"
            onClick={() => {
              actions.dismissFirstSetup();
              void actions.createPage(null);
            }}
          >
            <FilePlus size={17} />
            <span>
              <strong>Create your first note</strong>
              <small>Open a blank page and start writing</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              actions.dismissFirstSetup();
              void actions.pickVault("open");
            }}
          >
            <FolderOpen size={17} />
            <span>
              <strong>Open notes folder</strong>
              <small>Use a folder of Markdown files you already have</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              actions.dismissFirstSetup();
              actions.openSearch();
            }}
          >
            <Search size={17} />
            <span>
              <strong>Try search</strong>
              <small>Find pages, tags, captures, and saved context</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              actions.dismissFirstSetup();
              actions.setAiContext(Boolean(activePage));
              actions.openAi();
            }}
          >
            <MessageCircle size={17} />
            <span>
              <strong>Ask about this page</strong>
              <small>
                {activePage ? "Open the assistant with this page attached" : "Open the assistant"}
              </small>
            </span>
          </button>
        </div>

        <footer className="firstsetup-foot">
          <button type="button" onClick={() => actions.dismissFirstSetup()}>
            Skip setup
          </button>
        </footer>
      </div>
    </div>
  );
};
