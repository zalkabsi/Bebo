import { anthropicProvider } from "./anthropic.js";
import { geminiProvider } from "./gemini.js";
import { createOpenAiCompatibleProvider, openaiProvider } from "./openai.js";
import type { Provider } from "./types.js";

const ollamaProvider = createOpenAiCompatibleProvider({
  id: "ollama",
  label: "Ollama (local, OpenAI-compatible)",
  defaultBaseURL: "http://localhost:11434/v1",
  defaultModel: "qwen3:14b",
});

const deepseekProvider = createOpenAiCompatibleProvider({
  id: "deepseek",
  label: "DeepSeek",
  defaultBaseURL: "https://api.deepseek.com/v1",
  defaultModel: "deepseek-chat",
});

const providers = new Map<string, Provider>();
const customProviderIds = new Set<string>();

export function registerProvider(provider: Provider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): Provider | undefined {
  return providers.get(id);
}

export function listProviders(): Provider[] {
  syncCustomProviders();
  return [...providers.values()];
}

registerProvider(openaiProvider);
registerProvider(anthropicProvider);
registerProvider(geminiProvider);
registerProvider(deepseekProvider);
registerProvider(ollamaProvider);

export interface ProviderSettings {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export interface CustomProviderProfile {
  id: string;
  label: string;
  baseURL: string;
  defaultModel: string;
}

const STORAGE_KEY = "bebo.providerSettings.v1";
const LEGACY_STORAGE_KEY = "aioa.providerSettings.v1";
const CUSTOM_PROVIDERS_KEY = "bebo.customProviders.v1";
const ACTIVE_PROVIDER_KEY = "bebo.activeProvider.v1";

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function loadAllSettings(): Record<string, ProviderSettings> {
  try {
    const store = storage();
    const current = store?.getItem(STORAGE_KEY);
    const legacy = current ? null : store?.getItem(LEGACY_STORAGE_KEY);
    const raw = current ?? legacy;
    if (!raw) return {};
    const settings = JSON.parse(raw) as Record<string, ProviderSettings>;
    if (legacy) {
      try {
        store?.setItem(STORAGE_KEY, legacy);
      } catch {
        // Continue using the legacy settings if storage is temporarily read-only.
      }
    }
    return settings;
  } catch {
    return {};
  }
}

export function loadProviderSettings(id: string): ProviderSettings {
  return loadAllSettings()[id] ?? { apiKey: "" };
}

export function saveProviderSettings(id: string, settings: ProviderSettings): void {
  const all = loadAllSettings();
  all[id] = settings;
  storage()?.setItem(STORAGE_KEY, JSON.stringify(all));
}

function readCustomProviderProfiles(): CustomProviderProfile[] {
  try {
    const raw = storage()?.getItem(CUSTOM_PROVIDERS_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CustomProviderProfile =>
      !!item && typeof item === "object" &&
      typeof item.id === "string" && item.id.startsWith("custom-") &&
      typeof item.label === "string" && item.label.trim().length > 0 &&
      typeof item.baseURL === "string" && /^https?:\/\//i.test(item.baseURL) &&
      typeof item.defaultModel === "string" && item.defaultModel.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function syncCustomProviders(): void {
  for (const id of customProviderIds) providers.delete(id);
  customProviderIds.clear();
  for (const profile of readCustomProviderProfiles()) {
    providers.set(profile.id, createOpenAiCompatibleProvider({
      id: profile.id,
      label: profile.label,
      defaultBaseURL: profile.baseURL,
      defaultModel: profile.defaultModel,
    }));
    customProviderIds.add(profile.id);
  }
}

export function listCustomProviderProfiles(): CustomProviderProfile[] {
  return readCustomProviderProfiles();
}

export function loadActiveProviderId(): string {
  return storage()?.getItem(ACTIVE_PROVIDER_KEY) || "openai";
}

export function saveActiveProviderId(id: string): void {
  storage()?.setItem(ACTIVE_PROVIDER_KEY, id);
}

export function saveCustomProviderProfile(input: {
  id?: string;
  label: string;
  baseURL: string;
  defaultModel: string;
}): CustomProviderProfile {
  const label = input.label.trim();
  const baseURL = input.baseURL.trim().replace(/\/$/, "");
  const defaultModel = input.defaultModel.trim();
  if (!label) throw new Error("Enter a name for this provider.");
  if (!/^https?:\/\//i.test(baseURL)) throw new Error("Enter an HTTP or HTTPS API base URL.");
  if (!defaultModel) throw new Error("Enter a model name.");

  const profile: CustomProviderProfile = {
    id: input.id ?? `custom-${crypto.randomUUID()}`,
    label,
    baseURL,
    defaultModel,
  };
  if (!profile.id.startsWith("custom-")) throw new Error("Invalid custom provider id.");
  const profiles = readCustomProviderProfiles().filter((item) => item.id !== profile.id);
  profiles.push(profile);
  storage()?.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(profiles));
  syncCustomProviders();
  return profile;
}

export function deleteCustomProviderProfile(id: string): void {
  const profiles = readCustomProviderProfiles().filter((item) => item.id !== id);
  storage()?.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(profiles));
  const settings = loadAllSettings();
  delete settings[id];
  storage()?.setItem(STORAGE_KEY, JSON.stringify(settings));
  syncCustomProviders();
}
