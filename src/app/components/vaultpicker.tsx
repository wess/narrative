// The vault picker — shown full-window whenever no vault is open (first
// run before a default vault exists, or a recent vault whose folder was
// moved/deleted): open any folder, create a new one, or jump back into a
// recent vault.

import { FolderOpen, FolderPlus, X } from "lucide-react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

export const VaultPicker = () => {
  const { vaultRecents } = useApp();

  return (
    <div className="vault-picker">
      <div className="vault-picker-card">
        <div className="vault-picker-brand">
          <span className="brand-mark">◆</span>
          <h1>Bethink</h1>
        </div>
        <p className="vault-picker-tag">
          Your notes live in a folder of Markdown files. Open one, or create a new one.
        </p>

        <div className="vault-picker-actions">
          <button type="button" onClick={() => void actions.pickVault("open")}>
            <FolderOpen size={16} />
            Open folder…
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void actions.pickVault("create")}
          >
            <FolderPlus size={16} />
            Create new notes folder…
          </button>
        </div>

        {vaultRecents.length > 0 ? (
          <div className="vault-picker-recents">
            <h2>Recent notes folders</h2>
            <ul>
              {vaultRecents.map((entry) => (
                <li key={entry.root}>
                  <button
                    type="button"
                    className="vault-recent"
                    onClick={() => void actions.openVault(entry.root)}
                  >
                    <span className="vault-recent-name">{entry.name}</span>
                    <span className="vault-recent-path">{entry.root}</span>
                  </button>
                  <button
                    type="button"
                    className="vault-recent-forget"
                    title="Remove from list"
                    onClick={() => void actions.forgetVault(entry.root)}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
};
