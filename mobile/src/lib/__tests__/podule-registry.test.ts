import { describe, expect, it } from "vitest";

import {
  blockedCopy,
  DEFAULT_PODULES,
  resolveRoute,
  type PoduleRegistryState,
} from "../podule-registry";

const freeState: PoduleRegistryState = {
  entitlement: "balls-deep",
  localPoduleInstalled: false,
  cloudUnreachable: false,
  freeQuota: { used: 0, limit: 30, resetsUtc: "2026-08-17T00:00:00Z" },
};

describe("podule-registry", () => {
  it("routes to the local podule before any egress when installed", () => {
    const route = resolveRoute(DEFAULT_PODULES, {
      ...freeState,
      localPoduleInstalled: true,
    });
    expect(route).toEqual({ kind: "local", modelId: "gemma-4-e2b-4b" });
  });

  it("routes to cloud core by default with the flash model", () => {
    const route = resolveRoute(DEFAULT_PODULES, freeState);
    expect(route).toEqual({
      kind: "cloud",
      poduleId: "balls-cloud-core",
      modelId: "deepseek-v4-flash",
      endpoint: "https://balls.epictechs.net/v1",
    });
  });

  it("blocks on quota with the friendly copy", () => {
    const route = resolveRoute(DEFAULT_PODULES, {
      ...freeState,
      freeQuota: { used: 30, limit: 30, resetsUtc: "2026-08-17T00:00:00Z" },
    });
    expect(route.kind).toBe("blocked");
    if (route.kind === "blocked") {
      expect(blockedCopy(route.reason)).toMatch(/Whole Balls/);
    }
  });

  it("blocks with the out-of-range copy when cloud unreachable", () => {
    const route = resolveRoute(DEFAULT_PODULES, { ...freeState, cloudUnreachable: true });
    expect(route.kind).toBe("blocked");
    if (route.kind === "blocked") {
      expect(blockedCopy(route.reason)).toMatch(/out of range/);
    }
  });

  it("upgrades to premium when entitled", () => {
    const route = resolveRoute(DEFAULT_PODULES, {
      ...freeState,
      entitlement: "whole-balls",
      freeQuota: { used: 0, limit: 0, resetsUtc: "2026-08-17T00:00:00Z" },
    });
    expect(route).toMatchObject({ kind: "cloud", poduleId: "balls-cloud-premium" });
  });
});
