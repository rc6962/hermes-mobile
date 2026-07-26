import type { HealthResponse } from "../lib/hermes-types";

export type AppConnectionStatus = "unknown" | "checking" | "online" | "offline";

export interface AppState {
  status: AppConnectionStatus;
  health?: HealthResponse;
  error?: string;
}

export type AppAction =
  | { type: "health_check_started" }
  | { type: "health_check_succeeded"; health: HealthResponse }
  | { type: "health_check_failed"; message: string };

export function initialAppState(): AppState {
  return {
    status: "unknown",
    health: undefined,
    error: undefined,
  };
}

export function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "health_check_started":
      return { status: "checking", health: undefined, error: undefined };
    case "health_check_succeeded":
      return { status: "online", health: action.health, error: undefined };
    case "health_check_failed":
      return { status: "offline", health: undefined, error: action.message };
    default:
      return state;
  }
}
