import { Capacitor, registerPlugin } from "@capacitor/core";

export const LIFECYCLE_ACTIONS = ["start", "stop", "restart", "doctor", "update"] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export interface TermuxLifecycleResult {
  accepted: boolean;
  action: LifecycleAction;
}

interface TermuxLifecyclePlugin {
  run(options: { action: LifecycleAction }): Promise<TermuxLifecycleResult>;
}

let plugin: TermuxLifecyclePlugin | undefined;

function getPlugin(): TermuxLifecyclePlugin {
  plugin ??= registerPlugin<TermuxLifecyclePlugin>("TermuxLifecycle");
  return plugin;
}

export function isLifecycleAction(value: string): value is LifecycleAction {
  return (LIFECYCLE_ACTIONS as readonly string[]).includes(value);
}

export async function runTermuxLifecycle(action: LifecycleAction): Promise<TermuxLifecycleResult> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Termux lifecycle controls are available only in the Android app");
  }
  return getPlugin().run({ action });
}
