import { anthropic, ollama, openai, type Provider } from "@basket/ai";
import { PROVIDERS } from "../shared/providers.ts";
import type { SettingsRepo } from "./settings.ts";

// Build a live provider from the current settings. Rebuilt per request so a
// provider switch, a new key, or an edited server URL takes effect at once.
export const buildProvider = async (settings: SettingsRepo): Promise<Provider> => {
  const config = await settings.read();
  const preset = PROVIDERS[config.provider];
  const apiKey = preset.usesKey ? await settings.getKey(config.provider) : undefined;

  if (preset.requiresKey && !apiKey) {
    throw new Error(`No API key set for ${preset.label}. Add one in Settings (⌘,).`);
  }
  // Only the manual OpenAI-compatible preset can reach here unconfigured —
  // every other preset ships a working server URL and model.
  if (!config.baseURL) {
    throw new Error(`No server URL set for ${preset.label}. Add one in Settings (⌘,).`);
  }
  if (!config.model) {
    throw new Error(`No model set for ${preset.label}. Add one in Settings (⌘,).`);
  }

  if (preset.protocol === "ollama") {
    return ollama({
      baseURL: config.baseURL,
      apiKey,
      defaultModel: config.model,
      defaultEmbedModel: preset.defaultEmbedModel,
    });
  }

  if (preset.protocol === "openai") {
    return openai({
      apiKey: apiKey ?? "",
      baseURL: config.baseURL,
      defaultModel: config.model,
      defaultEmbedModel: preset.defaultEmbedModel,
    });
  }

  return anthropic({
    apiKey: apiKey ?? "",
    baseURL: config.baseURL,
    defaultModel: config.model,
  });
};

export const SYSTEM_PROMPT =
  "You are the assistant inside Narrative, a personal knowledge base. " +
  "Be concise and practical. When the user references their pages, ground " +
  "your answer in the provided context.";
