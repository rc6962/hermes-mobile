import { describe, expect, it } from "vitest";

import { createHermesApi } from "../../hermes-api";
import { createRuntimeClient } from "../create-runtime-client";
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

  it("propagates typed HermesApiError with status on failure", async () => {
    const client = createRuntimeClient({
      kind: "termux",
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      fetchImpl: async () =>
        jsonResponse({ error: { code: "unauthorized", message: "bad key" } }, 401),
    });

    await expect(client.health()).rejects.toMatchObject({
      name: "HermesApiError",
      status: 401,
      code: "unauthorized",
    });
  });

  it("managed kind fails closed with a typed error until the embedded runtime exists", () => {
    expect(() => createRuntimeClient({ kind: "managed" })).toThrow(
      /Managed runtime is not available in this build/,
    );
  });

  it("HermesApi is structurally assignable to RuntimeClient (compile-time contract)", () => {
    // If HermesApi ever drifts from the RuntimeClient surface, this line
    // stops compiling — that is the Phase 0 compatibility gate.
    const api = createHermesApi({
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      fetchImpl: async () => jsonResponse({ status: "ok" }),
    });
    const asRuntimeClient: RuntimeClient = api;
    expect(asRuntimeClient).toBeDefined();
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
