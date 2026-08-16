import { Capacitor, registerPlugin } from "@capacitor/core";

import {
  ANDROID_BRIDGE_CAPABILITIES,
  isAndroidBridgeCapability,
  type AndroidBridgeCapability,
  type AndroidBridgeState,
} from "./android-bridge-protocol";

export interface AndroidBridgeStatus {
  platformAvailable: boolean;
  bridge: AndroidBridgeState;
  accessibilityEnabled: boolean;
  serviceConnected: boolean;
  androidApiLevel: number;
  capabilities: AndroidBridgeCapability[];
  disabledCapabilities: AndroidBridgeCapability[];
}

export interface AndroidBridgeAdapter {
  getStatus(): Promise<AndroidBridgeStatus>;
  openAccessibilitySettings(): Promise<void>;
}

interface NativeAndroidBridgePlugin {
  getStatus(): Promise<unknown>;
  openAccessibilitySettings(): Promise<{ accepted: boolean }>;
}

const VALID_STATES: readonly AndroidBridgeState[] = [
  "ready",
  "disabled",
  "disconnected",
  "stopping",
];

function isBridgeState(value: unknown): value is AndroidBridgeState {
  return typeof value === "string" && VALID_STATES.includes(value as AndroidBridgeState);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isValidApiLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000;
}

export function disabledAndroidBridgeStatus(platformAvailable: boolean): AndroidBridgeStatus {
  return {
    platformAvailable,
    bridge: "disabled",
    accessibilityEnabled: false,
    serviceConnected: false,
    androidApiLevel: 0,
    capabilities: [],
    disabledCapabilities: [...ANDROID_BRIDGE_CAPABILITIES],
  };
}

export function normalizeAndroidBridgeStatus(value: unknown): AndroidBridgeStatus {
  if (value === null || typeof value !== "object") {
    return disabledAndroidBridgeStatus(true);
  }

  const raw = value as Record<string, unknown>;
  if (
    !isBridgeState(raw.bridge) ||
    !isBoolean(raw.accessibilityEnabled) ||
    !isBoolean(raw.serviceConnected) ||
    !isValidApiLevel(raw.androidApiLevel) ||
    !Array.isArray(raw.capabilities) ||
    !Array.isArray(raw.disabledCapabilities)
  ) {
    return disabledAndroidBridgeStatus(true);
  }

  const capabilities = raw.capabilities.filter(isAndroidBridgeCapability);
  const disabledCapabilities = raw.disabledCapabilities.filter(isAndroidBridgeCapability);
  const bridge = !raw.accessibilityEnabled
    ? "disabled"
    : raw.bridge === "stopping"
      ? "stopping"
      : raw.serviceConnected
        ? "ready"
        : "disconnected";
  return {
    platformAvailable: true,
    bridge,
    accessibilityEnabled: raw.accessibilityEnabled,
    serviceConnected: raw.serviceConnected,
    androidApiLevel: raw.androidApiLevel,
    capabilities: [...new Set(capabilities)],
    disabledCapabilities: [...new Set(disabledCapabilities)].filter(
      (capability) => !capabilities.includes(capability),
    ),
  };
}

let plugin: NativeAndroidBridgePlugin | undefined;

function getPlugin(): NativeAndroidBridgePlugin {
  plugin ??= registerPlugin<NativeAndroidBridgePlugin>("HermesBridge");
  return plugin;
}

export const androidBridge: AndroidBridgeAdapter = {
  async getStatus() {
    if (!Capacitor.isNativePlatform()) {
      return disabledAndroidBridgeStatus(false);
    }
    return normalizeAndroidBridgeStatus(await getPlugin().getStatus());
  },

  async openAccessibilitySettings() {
    if (!Capacitor.isNativePlatform()) {
      throw new Error("Android accessibility settings are available only in the Android app");
    }
    await getPlugin().openAccessibilitySettings();
  },
};
