import { Capacitor, registerPlugin } from "@capacitor/core";

export function normalizeApiKey(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

interface SecureCredentialsPlugin {
  getApiKey(): Promise<{ apiKey?: string }>;
  setApiKey(options: { apiKey: string }): Promise<void>;
  clearApiKey(): Promise<void>;
}

export interface ApiKeyStore {
  load(): Promise<string | undefined>;
  save(apiKey: string): Promise<void>;
  clear(): Promise<void>;
}

let plugin: SecureCredentialsPlugin | undefined;

function getPlugin(): SecureCredentialsPlugin {
  plugin ??= registerPlugin<SecureCredentialsPlugin>("SecureCredentials");
  return plugin;
}

export const apiKeyStore: ApiKeyStore = {
  async load() {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }
    return normalizeApiKey((await getPlugin().getApiKey()).apiKey);
  },
  async save(apiKey) {
    const normalized = normalizeApiKey(apiKey);
    if (!normalized) {
      throw new Error("An API server key is required");
    }
    if (!Capacitor.isNativePlatform()) {
      throw new Error("Secure API key storage is available only in the Android app");
    }
    await getPlugin().setApiKey({ apiKey: normalized });
  },
  async clear() {
    if (Capacitor.isNativePlatform()) {
      await getPlugin().clearApiKey();
    }
  },
};
