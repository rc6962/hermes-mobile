import { Capacitor, registerPlugin } from "@capacitor/core";

export function normalizeApiKey(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

interface SecureCredentialsPlugin {
  getApiKey(): Promise<{ apiKey?: string }>;
  setApiKey(options: { apiKey: string }): Promise<void>;
  clearApiKey(): Promise<void>;
  getEmailCreds(): Promise<{ emailCredsJson?: string }>;
  setEmailCreds(options: {
    address: string;
    password: string;
    imapHost?: string;
    smtpHost?: string;
  }): Promise<void>;
  clearEmailCreds(): Promise<void>;
}

export interface ApiKeyStore {
  load(): Promise<string | undefined>;
  save(apiKey: string): Promise<void>;
  clear(): Promise<void>;
}

export interface EmailCreds {
  address: string;
  password: string;
  imap_host: string;
  smtp_host: string;
  allowed_users?: string[];
}

export interface EmailCredsStore {
  load(): Promise<EmailCreds | undefined>;
  save(creds: EmailCreds): Promise<void>;
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

export const emailCredsStore: EmailCredsStore = {
  async load() {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }
    const raw = (await getPlugin().getEmailCreds()).emailCredsJson;
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(raw) as EmailCreds;
    } catch {
      return undefined;
    }
  },
  async save(creds: EmailCreds) {
    if (!Capacitor.isNativePlatform()) {
      throw new Error("Email credentials storage is available only in the Android app");
    }
    await getPlugin().setEmailCreds({
      address: creds.address,
      password: creds.password,
      imapHost: creds.imap_host,
      smtpHost: creds.smtp_host,
    });
  },
  async clear() {
    if (Capacitor.isNativePlatform()) {
      await getPlugin().clearEmailCreds();
    }
  },
};
