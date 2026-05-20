import { createVault } from "@basket/secrets";
import type { Store } from "@basket/store";
import { PROVIDERS } from "../shared/providers.ts";
import type { AiConfig, AiProvider } from "../shared/types.ts";

type Vault = ReturnType<typeof createVault>;

export type SettingsRepo = {
  read: () => Promise<AiConfig>;
  update: (patch: {
    provider?: AiProvider;
    model?: string;
    baseURL?: string;
    semanticIndex?: boolean;
  }) => Promise<AiConfig>;
  setKey: (provider: AiProvider, apiKey: string) => Promise<void>;
  clearKey: (provider: AiProvider) => Promise<void>;
  getKey: (provider: AiProvider) => Promise<string | undefined>;
};

// Non-secret AI preferences live in the JSON store; API keys live in the OS
// keychain. Model and server URL are tracked per provider so switching back
// and forth keeps each provider's own configuration.
export const createSettings = (store: Store, appId: string): SettingsRepo => {
  const vault: Vault = createVault(appId);

  const currentProvider = (): AiProvider => {
    const saved = store.get<AiProvider>("ai.provider");
    return saved && saved in PROVIDERS ? saved : "anthropic";
  };

  const getKey = (provider: AiProvider): Promise<string | undefined> =>
    vault.get(`${provider}.apiKey`);

  const read = async (): Promise<AiConfig> => {
    const provider = currentProvider();
    const preset = PROVIDERS[provider];
    const model = store.get<string>(`ai.model.${provider}`) ?? preset.defaultModel;
    const baseURL = store.get<string>(`ai.baseURL.${provider}`) ?? preset.defaultBaseURL;
    const hasKey = preset.usesKey ? Boolean(await getKey(provider)) : true;
    const semanticIndex = store.get<boolean>("ai.semanticIndex") ?? false;
    return { provider, model, baseURL, hasKey, semanticIndex };
  };

  const update: SettingsRepo["update"] = async (patch) => {
    if (patch.provider) store.set("ai.provider", patch.provider);
    const provider = currentProvider();
    if (patch.model !== undefined) store.set(`ai.model.${provider}`, patch.model.trim());
    if (patch.baseURL !== undefined) {
      // Strip trailing slashes so request paths like `/messages` join cleanly.
      const trimmed = patch.baseURL.trim().replace(/\/+$/, "");
      store.set(`ai.baseURL.${provider}`, trimmed || PROVIDERS[provider].defaultBaseURL);
    }
    if (patch.semanticIndex !== undefined) store.set("ai.semanticIndex", patch.semanticIndex);
    return read();
  };

  const setKey: SettingsRepo["setKey"] = async (provider, apiKey) => {
    const trimmed = apiKey.trim();
    if (trimmed) await vault.set(`${provider}.apiKey`, trimmed);
    else await vault.delete(`${provider}.apiKey`);
  };

  const clearKey: SettingsRepo["clearKey"] = (provider) => vault.delete(`${provider}.apiKey`);

  return { read, update, setKey, clearKey, getKey };
};
