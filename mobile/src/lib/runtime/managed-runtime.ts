import { Capacitor, registerPlugin } from "@capacitor/core";

export interface ManagedRuntimeStatus {
  running: boolean;
  error?: string;
}

export interface ManagedRuntimeStartResult {
  started: boolean;
  error?: string;
}

interface ManagedRuntimeNativePlugin {
  start(): Promise<ManagedRuntimeStartResult>;
  stop(): Promise<{ stopped: boolean }>;
  status(): Promise<ManagedRuntimeStatus>;
  setProviderConfig(options: { providerJson: string }): Promise<{ stored: boolean }>;
}

let plugin: ManagedRuntimeNativePlugin | undefined;

function getPlugin(): ManagedRuntimeNativePlugin {
  plugin ??= registerPlugin<ManagedRuntimeNativePlugin>("ManagedRuntime");
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
