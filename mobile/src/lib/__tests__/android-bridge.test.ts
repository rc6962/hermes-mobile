import { describe, expect, it, vi } from "vitest";

import {
  disabledAndroidBridgeStatus,
  normalizeAndroidBridgeStatus,
  readScreenSnapshot,
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


describe("readScreenSnapshot", () => {
  it("fetches the loopback snapshot and returns the tree JSON", async () => {
    const fakeTree = { nodes: [{ id: "1", text: "Hi" }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fakeTree), { status: 200 })));
    const tree = await readScreenSnapshot(true);
    expect(tree).toEqual(fakeTree);
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("127.0.0.1:7071");
    expect(url).toContain("fresh=1");
  });

  it("throws when the snapshot is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    await expect(readScreenSnapshot()).rejects.toThrow(/unavailable/);
  });
});
