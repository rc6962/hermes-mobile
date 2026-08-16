import { Capacitor, registerPlugin } from "@capacitor/core";

export interface ManagedRuntimeStatus {
  running: boolean;
  error?: string;
}

export interface ManagedRuntimeStartResult {
  started: boolean;
  error?: string;
}

/**
 * The embedded runtime's own API key (Keystore-generated on first use).
 * Native Android only — rejects off-platform so web tests fall back to the
 * regular credential store.
 */
/** Start the on-device llama server with the given GGUF. */
export async function startLocalModel(ggufPath: string) {
  return await getPlugin().startLocal({ ggufPath });
}

/** Stop the on-device llama server. */
export async function stopLocalModel() {
  return await getPlugin().stopLocal();
}

/** Whether the on-device llama server is up. */
export async function getLocalModelStatus() {
  return await getPlugin().localStatus();
}

/** Whether the local GGUF has been downloaded. */
export async function hasLocalModel() {
  return await getPlugin().hasLocalModel();
}

/** Download the local GGUF (Balls of Steel model) to the app's files dir. */
export async function downloadLocalModel() {
  return await getPlugin().downloadLocalModel();
}

/** Per-device provisioning ID (native Android only). */
export async function getDeviceId(): Promise<string> {
  const result = await getPlugin().getDeviceId();
  const deviceId = result.deviceId as string | undefined;
  if (!deviceId) {
    throw new Error("device id unavailable");
  }
  return deviceId;
}

export async function getEmbeddedApiKey(): Promise<string> {
  const result = await getEmbeddedKeyPlugin().getEmbeddedApiKey();
  const key = result.apiKey as string | undefined;
  if (!key) {
    throw new Error("Embedded runtime key is unavailable");
  }
  return key;
}

export interface ManagedRuntimePlugin {
  getEmbeddedApiKey(): Promise<{ apiKey?: string }>;
  getDeviceId(): Promise<{ deviceId?: string }>;
  startLocal(options: { ggufPath: string }): Promise<{ ok: boolean; port?: number; provider?: { base_url: string; model: string }; error?: string }>;
  stopLocal(): Promise<{ ok: boolean }>;
  localStatus(): Promise<{ ok: boolean; running: boolean }>;
  hasLocalModel(): Promise<{ present: boolean; path: string; size: number }>;
  downloadLocalModel(): Promise<{ ok: boolean; path?: string }>;
  start(): Promise<ManagedRuntimeStartResult>;
  stop(): Promise<{ stopped: boolean }>;
  status(): Promise<ManagedRuntimeStatus>;
  setProviderConfig(options: { providerJson: string }): Promise<{ stored: boolean }>;
}

let plugin: ManagedRuntimePlugin | undefined;

function getPlugin(): ManagedRuntimePlugin {
  plugin ??= registerPlugin<ManagedRuntimePlugin>("ManagedRuntime");
  return plugin;
}

function getEmbeddedKeyPlugin(): ManagedRuntimePlugin {
  plugin ??= registerPlugin<ManagedRuntimePlugin>("ManagedRuntime");
  return plugin;
}

export function isManagedRuntimeAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export async function startManagedRuntime(): Promise<ManagedRuntimeStartResult> {
  if (!Capacitor.isNativePlatform()) {
    return { started: false, error: "Managed runtime is available only in the Android app" };
  }
  try {
    return await getPlugin().start();
  } catch (error) {
    return { started: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function stopManagedRuntime(): Promise<{ stopped: boolean }> {
  if (!Capacitor.isNativePlatform()) {
    return { stopped: false };
  }
  try {
    return await getPlugin().stop();
  } catch {
    return { stopped: false };
  }
}

export async function getManagedRuntimeStatus(): Promise<ManagedRuntimeStatus> {
  if (!Capacitor.isNativePlatform()) {
    return { running: false, error: "Not a native platform" };
  }
  try {
    return await getPlugin().status();
  } catch (error) {
    return { running: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function setManagedProviderConfig(providerJson: string): Promise<{ stored: boolean }> {
  if (!Capacitor.isNativePlatform()) {
    return { stored: false };
  }
  try {
    return await getPlugin().setProviderConfig({ providerJson });
  } catch {
    return { stored: false };
  }
}
