import { describe, expect, it } from "vitest";

import {
  appStateReducer,
  initialAppState,
  type AppState,
} from "../app-state";

function transition(actions: Parameters<typeof appStateReducer>[1][]): AppState {
  return actions.reduce(appStateReducer, initialAppState());
}

describe("app state", () => {
  it("moves through checking to online and retains health metadata", () => {
    const state = transition([
      { type: "health_check_started" },
      { type: "health_check_succeeded", health: { status: "ok", version: "test" } },
    ]);

    expect(state).toEqual({
      status: "online",
      health: { status: "ok", version: "test" },
      error: undefined,
    });
  });

  it("shows a safe offline state after a failed health check", () => {
    const state = transition([
      { type: "health_check_started" },
      { type: "health_check_failed", message: "Connection refused" },
    ]);

    expect(state.status).toBe("offline");
    expect(state.error).toBe("Connection refused");
    expect(state.health).toBeUndefined();
  });

  it("clears stale errors when retrying", () => {
    const failed = appStateReducer(initialAppState(), {
      type: "health_check_failed",
      message: "offline",
    });

    expect(appStateReducer(failed, { type: "health_check_started" })).toEqual({
      status: "checking",
      health: undefined,
      error: undefined,
    });
  });
});
