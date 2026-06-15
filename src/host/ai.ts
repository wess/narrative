import { anthropic, ollama, openai, type Provider } from "@basket/ai";
import { PROVIDERS } from "../shared/providers.ts";
import type { AiProvider } from "../shared/types.ts";
import type { SettingsRepo } from "./settings.ts";

export type ProviderOverrides = {
  readonly provider?: AiProvider;
  readonly model?: string;
};

// Build a live provider from the current settings. Rebuilt per request so a
// provider switch, a new key, or an edited server URL takes effect at once.
// Agents can override `provider` / `model` per run without disturbing the
// user's global settings.
export const buildProvider = async (
  settings: SettingsRepo,
  overrides: ProviderOverrides = {},
): Promise<Provider> => {
  const config = await settings.read();
  const providerId = overrides.provider ?? config.provider;
  const preset = PROVIDERS[providerId];
  const apiKey = preset.usesKey ? await settings.getKey(providerId) : undefined;
  // When the agent's provider matches the user's saved one, fall back to the
  // saved baseURL / model; otherwise lean on the preset defaults.
  const sameProvider = providerId === config.provider;
  const baseURL = sameProvider ? config.baseURL : preset.defaultBaseURL;
  const model = overrides.model ?? (sameProvider ? config.model : preset.defaultModel);

  if (preset.requiresKey && !apiKey) {
    throw new Error(`No API key set for ${preset.label}. Add one in Settings (⌘,).`);
  }
  // Only the manual OpenAI-compatible preset can reach here unconfigured —
  // every other preset ships a working server URL and model.
  if (!baseURL) {
    throw new Error(`No server URL set for ${preset.label}. Add one in Settings (⌘,).`);
  }
  if (!model) {
    throw new Error(`No model set for ${preset.label}. Add one in Settings (⌘,).`);
  }

  if (preset.protocol === "ollama") {
    return ollama({
      baseURL,
      apiKey,
      defaultModel: model,
      defaultEmbedModel: preset.defaultEmbedModel,
    });
  }

  if (preset.protocol === "openai") {
    return openai({
      apiKey: apiKey ?? "",
      baseURL,
      defaultModel: model,
      defaultEmbedModel: preset.defaultEmbedModel,
    });
  }

  return anthropic({
    apiKey: apiKey ?? "",
    baseURL,
    defaultModel: model,
  });
};

export const SYSTEM_PROMPT =
  "You are the assistant inside Bethink, a personal knowledge base. " +
  "Be concise and practical. When the user references their pages, ground " +
  "your answer in the provided context.";
