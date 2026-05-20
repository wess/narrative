// AI provider presets. Five presets over three wire protocols — Ollama
// "local" and "cloud" share a protocol, and "OpenAI-compatible" is a manual
// entry over the OpenAI protocol (Groq, OpenRouter, LM Studio, vLLM, …).
// Shared by the host (which builds the live `@basket/ai` provider) and the
// webview (which renders Settings → AI).

import type { AiProvider } from "./types.ts";

// The wire protocol a preset speaks — picks which `@basket/ai` factory runs.
export type AiProtocol = "anthropic" | "openai" | "ollama";

export type ProviderPreset = {
  readonly id: AiProvider;
  readonly label: string;
  readonly protocol: AiProtocol;
  readonly defaultBaseURL: string; // empty for the manual preset — user supplies it
  readonly defaultModel: string; // empty for the manual preset — user supplies it
  readonly defaultEmbedModel?: string;
  // Whether the API-key field is shown at all.
  readonly usesKey: boolean;
  // Whether a key is mandatory. False for local Ollama and the manual
  // preset — local servers (LM Studio, vLLM) often need no key.
  readonly requiresKey: boolean;
  readonly keyPlaceholder: string;
  // Guidance shown under the API-key field.
  readonly keyHint: string;
};

export const PROVIDERS: Record<AiProvider, ProviderPreset> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    protocol: "anthropic",
    defaultBaseURL: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-6",
    usesKey: true,
    requiresKey: true,
    keyPlaceholder: "sk-ant-…",
    keyHint: "Create a key at console.anthropic.com.",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    protocol: "openai",
    defaultBaseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    defaultEmbedModel: "text-embedding-3-small",
    usesKey: true,
    requiresKey: true,
    keyPlaceholder: "sk-…",
    keyHint: "Create a key at platform.openai.com.",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    protocol: "ollama",
    defaultBaseURL: "http://127.0.0.1:11434",
    defaultModel: "llama3.2",
    defaultEmbedModel: "nomic-embed-text",
    usesKey: false,
    requiresKey: false,
    keyPlaceholder: "",
    keyHint: "",
  },
  "ollama-cloud": {
    id: "ollama-cloud",
    label: "Ollama Cloud",
    protocol: "ollama",
    defaultBaseURL: "https://ollama.com",
    defaultModel: "gpt-oss:120b",
    defaultEmbedModel: "nomic-embed-text",
    usesKey: true,
    requiresKey: true,
    keyPlaceholder: "Ollama API key",
    keyHint: "Create a key at ollama.com/settings/keys.",
  },
  "openai-compatible": {
    id: "openai-compatible",
    label: "OpenAI-compatible (Manual)",
    protocol: "openai",
    defaultBaseURL: "",
    defaultModel: "",
    usesKey: true,
    requiresKey: false,
    keyPlaceholder: "API key (optional for local servers)",
    keyHint:
      "Any server speaking the OpenAI API — Groq, OpenRouter, Together, LM Studio, vLLM, … " +
      "The key is optional for local servers, required for hosted ones.",
  },
};

// Stable display order for the Settings provider dropdown.
export const PROVIDER_IDS: readonly AiProvider[] = [
  "anthropic",
  "openai",
  "ollama",
  "ollama-cloud",
  "openai-compatible",
];
