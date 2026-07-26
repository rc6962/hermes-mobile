import { describe, expect, it } from "vitest";

import {
  LIFECYCLE_ACTIONS,
  isLifecycleAction,
  type LifecycleAction,
} from "../lifecycle-actions";

describe("Termux lifecycle actions", () => {
  it("exposes only the controlled lifecycle action set", () => {
    expect(LIFECYCLE_ACTIONS).toEqual(["start", "stop", "restart", "doctor", "update"]);
    expect(LIFECYCLE_ACTIONS.every((action): action is LifecycleAction => isLifecycleAction(action))).toBe(true);
    expect(isLifecycleAction("arbitrary-shell-command")).toBe(false);
  });
});
