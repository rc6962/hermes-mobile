import type { RuntimeKind } from "./create-runtime-client";

const STORAGE_KEY = "balls.runtimeKind";

export function loadRuntimeKind(): RuntimeKind {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "managed" ? "managed" : "termux";
  } catch {
    return "termux";
  }
}

export function saveRuntimeKind(kind: RuntimeKind): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    // Storage unavailable (private mode): default to termux at load.
  }
}
