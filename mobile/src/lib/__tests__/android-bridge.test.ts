import { describe, expect, it } from "vitest";

import {
  disabledAndroidBridgeStatus,
  normalizeAndroidBridgeStatus,
} from "../android-bridge";

describe("Android bridge status adapter", () => {
  it("normalizes the native status while keeping only known capabilities", () => {
    expect(
      normalizeAndroidBridgeStatus({
        bridge: "ready",
        accessibilityEnabled: true,
        serviceConnected: true,
        androidApiLevel: 36,
        capabilities: ["bridge.status", "screen.read", "unknown.capability"],
        disabledCapabilities: ["screen.capture", "unknown.capability"],
      }),
    ).toEqual({
      platformAvailable: true,
      bridge: "ready",
      accessibilityEnabled: true,
      serviceConnected: true,
      androidApiLevel: 36,
      capabilities: ["bridge.status", "screen.read"],
      disabledCapabilities: ["screen.capture"],
    });
  });

  it("fails closed when native status fields are malformed", () => {
    expect(
      normalizeAndroidBridgeStatus({
        bridge: "unexpected",
        accessibilityEnabled: "yes",
        serviceConnected: 1,
        androidApiLevel: -1,
        capabilities: "screen.read",
        disabledCapabilities: null,
      }),
    ).toEqual(disabledAndroidBridgeStatus(true));
  });

  it("derives bridge state from accessibility and service booleans", () => {
    expect(
      normalizeAndroidBridgeStatus({
        bridge: "ready",
        accessibilityEnabled: false,
        serviceConnected: true,
        androidApiLevel: 36,
        capabilities: [],
        disabledCapabilities: [],
      }).bridge,
    ).toBe("disabled");
    expect(
      normalizeAndroidBridgeStatus({
        bridge: "ready",
        accessibilityEnabled: true,
        serviceConnected: false,
        androidApiLevel: 36,
        capabilities: [],
        disabledCapabilities: [],
      }).bridge,
    ).toBe("disconnected");
  });

  it("returns a non-native disabled state for browser previews", () => {
    expect(disabledAndroidBridgeStatus(false)).toEqual({
      platformAvailable: false,
      bridge: "disabled",
      accessibilityEnabled: false,
      serviceConnected: false,
      androidApiLevel: 0,
      capabilities: [],
      disabledCapabilities: [
        "bridge.status",
        "accessibility.status",
        "screen.read",
        "node.find",
        "node.tap",
        "input.type",
        "system.back",
        "system.home",
        "screen.capture",
      ],
    });
  });
});
