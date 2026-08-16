import { describe, expect, it } from "vitest";

import { DEFAULT_HERMES_API_URL, resolveHermesApiUrl, resolveAttachmentAdapterUrl, DEFAULT_ATTACHMENT_ADAPTER_URL } from "../transport-policy";

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

describe("resolveAttachmentAdapterUrl", () => {
  it("accepts the local adapter endpoint", () => {
    expect(resolveAttachmentAdapterUrl("http://127.0.0.1:8643")).toBe("http://127.0.0.1:8643");
    expect(resolveAttachmentAdapterUrl("http://localhost:8643")).toBe("http://localhost:8643");
  });

  it("defaults when unset", () => {
    expect(resolveAttachmentAdapterUrl()).toBe(DEFAULT_ATTACHMENT_ADAPTER_URL);
    expect(resolveAttachmentAdapterUrl("")).toBe(DEFAULT_ATTACHMENT_ADAPTER_URL);
  });

  it("rejects remote hosts and non-http schemes", () => {
    expect(resolveAttachmentAdapterUrl("http://example.com:8643")).toBe(DEFAULT_ATTACHMENT_ADAPTER_URL);
    expect(resolveAttachmentAdapterUrl("https://127.0.0.1:8643")).toBe(DEFAULT_ATTACHMENT_ADAPTER_URL);
  });

  it("returns the default for malformed input", () => {
    expect(resolveAttachmentAdapterUrl("not a URL")).toBe(DEFAULT_ATTACHMENT_ADAPTER_URL);
  });
});
