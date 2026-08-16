import { describe, expect, it, vi } from "vitest";

import { loadRuntimeKind, saveRuntimeKind } from "../runtime-preferences";

describe("runtime-preferences", () => {
  it("defaults to termux when nothing is stored", () => {
    expect(loadRuntimeKind()).toBe("termux");
  });

  it("round-trips a saved kind", () => {
    saveRuntimeKind("managed");
    expect(loadRuntimeKind()).toBe("managed");
    window.localStorage.removeItem("balls.runtimeKind");
  });

  it("falls back to termux for an invalid stored value", () => {
    window.localStorage.setItem("balls.runtimeKind", "something-else");
    expect(loadRuntimeKind()).toBe("termux");
    window.localStorage.removeItem("balls.runtimeKind");
  });

  it("handles storage failure gracefully", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadRuntimeKind()).toBe("termux");
    spy.mockRestore();
  });
});
