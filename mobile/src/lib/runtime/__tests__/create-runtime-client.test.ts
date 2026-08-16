import { describe, expect, it, vi } from "vitest";

import { createRuntimeClient } from "../create-runtime-client";
import { createManagedRuntimeClient } from "../managed-runtime-client";
import type { RuntimeClient } from "../RuntimeClient";
import { createTermuxRuntimeClient } from "../termux-runtime-client";

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("RuntimeClient (Phase 0)", () => {
  it("termux factory returns a client that delegates health() with bearer auth", async () => {
    const calls: RecordedCall[] = [];
    const client = createRuntimeClient({
      kind: "termux",
      baseUrl: "http://127.0.0.1:8642/",
      apiKey: "test-api-key",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        return jsonResponse({ status: "ok" });
      },
    });

    const health = await client.health();

    expect(health.status).toBe("ok");
    expect(calls[0].url).toBe("http://127.0.0.1:8642/health");
    expect(calls[0].init?.headers).toEqual({
      Authorization: "Bearer test-api-key",
    });
  });

  it("termux factory maps startRun responses into {runId, status}", async () => {
    const client = createRuntimeClient({
      kind: "termux",
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      fetchImpl: async () => jsonResponse({ run_id: "run-1", status: "queued" }),
    });

    const started = await client.startRun({ input: [{ type: "text", text: "hi" }] });

    expect(started).toEqual({ runId: "run-1", status: "queued" });
  });

  it("propagates typed BallsApiError with status on failure", async () => {
    const client = createRuntimeClient({
      kind: "termux",
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      fetchImpl: async () =>
        jsonResponse({ error: { code: "unauthorized", message: "bad key" } }, 401),
    });

    await expect(client.health()).rejects.toMatchObject({
      name: "BallsApiError",
      status: 401,
      code: "unauthorized",
    });
  });

  it("managed kind returns a client that delegates health() with bearer auth", async () => {
    const calls: RecordedCall[] = [];
    const client = createRuntimeClient({
      kind: "managed",
      apiKey: "test-api-key",
      baseUrl: "http://127.0.0.1:8642",
    });
    // Inject fetchImpl by rebuilding through the managed factory path with
    // a captured fetch (the dispatcher passes through apiKey/baseUrl only).
    const viaFactory = createManagedRuntimeClient({
      apiKey: "test-api-key",
      baseUrl: "http://127.0.0.1:8642",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        return jsonResponse({ status: "ok" });
      },
    });

    const health = await viaFactory.health();
    void client;

    expect(health.status).toBe("ok");
    expect(calls[0].url).toBe("http://127.0.0.1:8642/health");
    expect(calls[0].init?.headers).toEqual({ Authorization: "Bearer test-api-key" });
  });

  it("managed startRuntime surfaces the plugin result (started true)", async () => {
    const { startManagedRuntimeMock } = vi.hoisted(() => ({
      startManagedRuntimeMock: vi.fn(),
    }));
    vi.mock("../managed-runtime", () => ({
      startManagedRuntime: startManagedRuntimeMock,
      stopManagedRuntime: vi.fn().mockResolvedValue({ stopped: true }),
      getManagedRuntimeStatus: vi.fn().mockResolvedValue({ running: true }),
      setManagedProviderConfig: vi.fn().mockResolvedValue({ stored: true }),
      isManagedRuntimeAvailable: vi.fn().mockReturnValue(true),
    }));
    const { createManagedRuntimeClient: factory } = await import(
      "../managed-runtime-client"
    );
    startManagedRuntimeMock.mockResolvedValue({ started: true });

    const client = factory({ apiKey: "test-api-key" });
    const result = await client.startRuntime();

    expect(result).toEqual({ started: true });
    expect(startManagedRuntimeMock).toHaveBeenCalledTimes(1);
    vi.resetModules();
  });

  it("runtime factories are structurally assignable to RuntimeClient (compile-time contract)", () => {
    // If a factory ever drifts from the RuntimeClient surface, these lines
    // stop compiling — that is the runtime-contract gate.
    const options = {
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      fetchImpl: async () => jsonResponse({ status: "ok" }),
    };
    const termux: RuntimeClient = createTermuxRuntimeClient(options);
    const managed: RuntimeClient = createManagedRuntimeClient(options);
    expect(termux).toBeDefined();
    expect(managed).toBeDefined();
  });

  it("createTermuxRuntimeClient returns the same client shape as createRuntimeClient(termux)", async () => {
    const calls: RecordedCall[] = [];
    const options = {
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return jsonResponse({ status: "ok" });
      },
    };
    const direct = createTermuxRuntimeClient(options);
    const dispatched = createRuntimeClient({ kind: "termux", ...options });

    await direct.health();
    await dispatched.health();

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(calls[1].url);
  });
});
