// The recent-vaults list that powers the vault switcher. Persisted as
// a plain `vaults.json` in the app config dir. We read/write the file
// directly (loaded once, awaited at startup) rather than going through
// `@basket/store`, whose async load would race the first read.

import type { VaultEntry } from "../../shared/types.ts";

export type Recents = {
  readonly list: () => readonly VaultEntry[];
  readonly last: () => string | null;
  readonly remember: (root: string, name: string) => Promise<void>;
  readonly forget: (root: string) => Promise<void>;
};

const MAX = 12;

export const loadRecents = async (filePath: string): Promise<Recents> => {
  let entries: VaultEntry[] = [];
  try {
    const raw = (await Bun.file(filePath).json()) as { vaults?: VaultEntry[] };
    if (Array.isArray(raw.vaults)) {
      entries = raw.vaults.filter(
        (e): e is VaultEntry => typeof e?.root === "string" && typeof e?.name === "string",
      );
    }
  } catch {
    // first run — no vaults.json yet
  }

  const persist = async (): Promise<void> => {
    try {
      await Bun.write(filePath, JSON.stringify({ vaults: entries }, null, 2));
    } catch {
      // a write failure just means the list won't persist this session
    }
  };

  return {
    list: () => entries,
    last: () => entries[0]?.root ?? null,
    remember: async (root, name) => {
      entries = [
        { root, name, lastOpened: new Date().toISOString() },
        ...entries.filter((e) => e.root !== root),
      ].slice(0, MAX);
      await persist();
    },
    forget: async (root) => {
      entries = entries.filter((e) => e.root !== root);
      await persist();
    },
  };
};
