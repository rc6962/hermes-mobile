import { describe, expect, it, vi } from "vitest";

import { provisionEpicCloud } from "../provisioning";

vi.mock("../runtime/managed-runtime", () => ({
  getDeviceId: vi.fn(async () => "0123456789abcdef0123456789abcdef"),
  setManagedProviderConfig: vi.fn(async () => ({ stored: true })),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("provisioning", () => {
  it("provisions a device token and writes the provider config", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { token: "tok123" }));
    const result = await provisionEpicCloud(fetchMock as unknown as typeof fetch);

    expect(result.provisioned).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://balls.epictechs.net/v1/accounts");
    const body = JSON.parse(String(init.body)) as { device_id?: string };
    expect(body.device_id).toBe("0123456789abcdef0123456789abcdef");
  });

  it("returns a friendly error on 429", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, {}));
    const result = await provisionEpicCloud(fetchMock as unknown as typeof fetch);
    expect(result.provisioned).toBe(false);
    expect(result.error).toMatch(/Too many new devices/i);
  });

  it("returns an error when the box is unreachable", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const result = await provisionEpicCloud(fetchMock as unknown as typeof fetch);
    expect(result.provisioned).toBe(false);
    expect(result.error).toMatch(/couldn't reach Epic Cloud/i);
  });
});
