import { describe, expect, it } from "vitest";

import { normalizeApiKey } from "../credentials";

describe("normalizeApiKey", () => {
  it("trims a key and rejects blank values", () => {
    expect(normalizeApiKey("  test-key  ")).toBe("test-key");
    expect(normalizeApiKey("   ")).toBeUndefined();
    expect(normalizeApiKey(undefined)).toBeUndefined();
  });
});
