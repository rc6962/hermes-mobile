import { describe, expect, it } from "vitest";

import {
  HermesApiError,
  createHermesApi,
} from "../hermes-api";

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

describe("HermesApi", () => {
  it("adds bearer and optional session-key headers to authenticated requests", async () => {
    const calls: RecordedCall[] = [];
    const api = createHermesApi({
      baseUrl: "http://127.0.0.1:8642/",
      apiKey: "test-api-key",
      sessionKey: "session-scope",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        return jsonResponse({ status: "ok" });
      },
    });

    await api.health();

    expect(calls[0].url).toBe("http://127.0.0.1:8642/health");
    expect(calls[0].init?.headers).toEqual({
      Authorization: "Bearer test-api-key",
      "X-Hermes-Session-Key": "session-scope",
    });
  });

  it("uses native transport for JSON and native streaming for SSE when available", async () => {
    const nativeCalls: RecordedCall[] = [];
    const streamCalls: RecordedCall[] = [];
    const fetchCalls: RecordedCall[] = [];
    const api = createHermesApi({
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      nativeHttpImpl: async (input, init) => {
        nativeCalls.push({ url: String(input), init });
        return jsonResponse({ status: "ok" });
      },
      nativeStreamImpl: async (input, init, onChunk) => {
        streamCalls.push({ url: String(input), init });
        onChunk('data: {"event":"run.completed","output":"done"}\n\n');
      },
      fetchImpl: async (input, init) => {
        fetchCalls.push({ url: String(input), init });
        return new Response(
          'data: {"event":"run.completed","output":"done"}\n\n',
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    });

    await api.health();
    await api.subscribeToRun("run-1", () => undefined);

    expect(nativeCalls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:8642/health",
    ]);
    expect(streamCalls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:8642/v1/runs/run-1/events",
    ]);
    expect(fetchCalls).toEqual([]);
    expect(streamCalls[0].init?.headers).toEqual({
      Authorization: "Bearer test-api-key",
      Accept: "text/event-stream",
    });
  });

  it("creates a run from input and optional session id", async () => {
    const calls: RecordedCall[] = [];
    const api = createHermesApi({
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        return jsonResponse({ run_id: "run-1", status: "started" }, 202);
      },
    });

    await expect(api.startRun({ input: "Hello Hermes", sessionId: "session-1" })).resolves.toEqual({
      runId: "run-1",
      status: "started",
    });

    expect(calls[0].url).toBe("http://127.0.0.1:8642/v1/runs");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toEqual({
      Authorization: "Bearer test-api-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      input: "Hello Hermes",
      session_id: "session-1",
    });
  });

  it("streams structured run events and tolerates keepalives", async () => {
    const events: unknown[] = [];
    const calls: RecordedCall[] = [];
    const api = createHermesApi({
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        return new Response(
          ': keepalive\n\n' +
            'data: {"event":"message.delta","text":"Hello"}\n\n' +
            'data: {"event":"run.completed","output":"Hello"}\n\n',
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    });

    await api.subscribeToRun("run-1", (event) => events.push(event));

    expect(calls[0].init?.headers).toEqual({
      Authorization: "Bearer test-api-key",
      Accept: "text/event-stream",
    });
    expect(events).toEqual([
      { event: "message.delta", text: "Hello" },
      { event: "run.completed", output: "Hello" },
    ]);
  });

  it("sends stop and approval decisions with the documented payloads", async () => {
    const calls: RecordedCall[] = [];
    const api = createHermesApi({
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        return jsonResponse({ run_id: "run-1", status: "stopping" });
      },
    });

    await api.stopRun("run-1");
    await api.respondToApproval("run-1", { choice: "once", resolveAll: true });

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:8642/v1/runs/run-1/stop",
      "http://127.0.0.1:8642/v1/runs/run-1/approval",
    ]);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      choice: "once",
      resolve_all: true,
    });
  });

  it("supports session creation, listing, and message history", async () => {
    const calls: RecordedCall[] = [];
    const api = createHermesApi({
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "test-api-key",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        if (String(input).endsWith("/api/sessions") && init?.method === "POST") {
          return jsonResponse({ object: "hermes.session", session: { id: "session-1" } }, 201);
        }
        if (String(input).endsWith("/messages")) {
          return jsonResponse({ object: "list", session_id: "session-1", data: [] });
        }
        return jsonResponse({ object: "list", data: [], limit: 50, offset: 0, has_more: false });
      },
    });

    await api.createSession({ id: "session-1", title: "First chat" });
    await api.listSessions();
    await api.getSessionMessages("session-1");

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:8642/api/sessions",
      "http://127.0.0.1:8642/api/sessions",
      "http://127.0.0.1:8642/api/sessions/session-1/messages",
    ]);
  });

  it("normalizes an HTTP error without exposing the bearer token", async () => {
    const api = createHermesApi({
      baseUrl: "http://127.0.0.1:8642",
      apiKey: "secret-token-that-must-not-appear",
      fetchImpl: async () =>
        jsonResponse(
          {
            error: {
              code: "unauthorized",
              message: "invalid bearer token",
            },
          },
          401,
        ),
    });

    const error = await api.health().catch((value: unknown) => value);

    expect(error).toBeInstanceOf(HermesApiError);
    expect(error).toMatchObject({ status: 401, code: "unauthorized" });
    expect(String(error)).not.toContain("secret-token-that-must-not-appear");
  });
});
