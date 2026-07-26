import { describe, expect, it } from "vitest";

import { DEFAULT_HERMES_API_URL, resolveHermesApiUrl } from "../transport-policy";

describe("resolveHermesApiUrl", () => {
  it("accepts the local Termux endpoint", () => {
    expect(resolveHermesApiUrl("http://127.0.0.1:8642")).toBe("http://127.0.0.1:8642");
    expect(resolveHermesApiUrl("http://localhost:8642")).toBe("http://localhost:8642");
  });

  it("accepts the Android emulator host bridge", () => {
    expect(resolveHermesApiUrl("http://10.0.2.2:8642")).toBe("http://10.0.2.2:8642");
  });

  it("falls back to loopback for remote, IPv6, or malformed endpoints", () => {
    expect(resolveHermesApiUrl("http://example.com:8642")).toBe(DEFAULT_HERMES_API_URL);
    expect(resolveHermesApiUrl("https://api.example.com")).toBe(DEFAULT_HERMES_API_URL);
    expect(resolveHermesApiUrl("http://[::1]:8642")).toBe(DEFAULT_HERMES_API_URL);
    expect(resolveHermesApiUrl("not a URL")).toBe(DEFAULT_HERMES_API_URL);
  });
});
