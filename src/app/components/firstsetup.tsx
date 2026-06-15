import { Bot, FolderOpen, Settings, Users, X } from "lucide-react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

export const FirstSetup = () => {
  const { firstSetupOpen, aiHealth } = useApp();
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
            <h2>Set up Bethink</h2>
            <p>Connect a model, create an agent, add a project folder, then make a channel.</p>
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
              actions.openSettings("ai");
            }}
          >
            <Settings size={17} />
            <span>
              <strong>Connect AI</strong>
              <small>{aiHealth?.configured ? "Provider is configured" : "Choose a provider"}</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              actions.dismissFirstSetup();
              actions.openAgentWizard();
            }}
          >
            <Bot size={17} />
            <span>
              <strong>Create an agent</strong>
              <small>Use a template, guided setup, or freeform prompt</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              actions.dismissFirstSetup();
              void actions.addProject();
            }}
          >
            <FolderOpen size={17} />
            <span>
              <strong>Add a project</strong>
              <small>Pick a folder agents can inspect</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              actions.dismissFirstSetup();
              actions.openChannelWizard();
            }}
          >
            <Users size={17} />
            <span>
              <strong>Create a channel</strong>
              <small>Group agents around a project or task</small>
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
