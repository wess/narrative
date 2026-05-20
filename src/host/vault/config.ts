// Per-vault config. We keep a tiny optional `.narrative/config.json` and
// fall back to sensible defaults, so any plain folder works as a vault with
// zero setup.

import { join } from "node:path";
import type { VaultConfig } from "./types.ts";

export const DEFAULT_CONFIG: VaultConfig = {
  dailyFolder: "Daily",
  templatesFolder: "Templates",
};

export const loadConfig = async (root: string): Promise<VaultConfig> => {
  try {
    const raw = (await Bun.file(
      join(root, ".narrative", "config.json"),
    ).json()) as Partial<VaultConfig>;
    return {
      dailyFolder:
        typeof raw.dailyFolder === "string" ? raw.dailyFolder : DEFAULT_CONFIG.dailyFolder,
      templatesFolder:
        typeof raw.templatesFolder === "string"
          ? raw.templatesFolder
          : DEFAULT_CONFIG.templatesFolder,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
};
