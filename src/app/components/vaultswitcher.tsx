// The vault switcher in the sidebar header — shows the open vault's name and
// drops down a list of recent vaults to switch between, plus open/create
// shortcuts. Switching swaps the whole vault without a restart.

import { Check, ChevronsUpDown, FolderOpen, FolderPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

export const VaultSwitcher = () => {
  const { vault, vaultRecents } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="vault-switcher" ref={ref}>
      <button
        type="button"
        className="vault-switcher-btn"
        title={vault?.root}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="brand-mark">◆</span>
        <span className="vault-switcher-name">{vault?.name ?? "Bethink"}</span>
        <ChevronsUpDown size={13} />
      </button>
      {open ? (
        <div className="vault-switcher-menu">
          {vaultRecents.map((entry) => (
            <button
              key={entry.root}
              type="button"
              className="vault-switcher-item"
              onClick={() => {
                setOpen(false);
                if (entry.root !== vault?.root) void actions.openVault(entry.root);
              }}
            >
              {entry.root === vault?.root ? (
                <Check size={13} />
              ) : (
                <span className="vault-switcher-spacer" />
              )}
              <span className="vault-switcher-item-name">{entry.name}</span>
            </button>
          ))}
          <div className="vault-switcher-sep" />
          <button
            type="button"
            className="vault-switcher-item"
            onClick={() => {
              setOpen(false);
              void actions.pickVault("open");
            }}
          >
            <FolderOpen size={13} />
            <span>Open folder…</span>
          </button>
          <button
            type="button"
            className="vault-switcher-item"
            onClick={() => {
              setOpen(false);
              void actions.pickVault("create");
            }}
          >
            <FolderPlus size={13} />
            <span>New vault…</span>
          </button>
        </div>
      ) : null}
    </div>
  );
};
