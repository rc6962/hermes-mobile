import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";

import {
  approvalFixtureEvents,
  cancelledFixtureEvents,
  defaultFixtureEvents,
  encodeSseEvents,
  failureFixtureEvents,
  splitSsePayload,
  type FixtureEvent,
} from "./sse-events";

export interface FakeHermesServerOptions {
  apiKey?: string;
}

export interface FakeHermesServer {
  readonly url: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface FixtureSession {
  id: string;
  title: string;
  message_count: number;
}

interface FixtureRun {
  id: string;
  input: string;
  status: string;
  events: FixtureEvent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
  }
  if (!raw) {
    return {};
  }
  const parsed: unknown = JSON.parse(raw);
  return isRecord(parsed) ? parsed : {};
}

function writeJson(response: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function runEvents(runId: string, input: string): FixtureEvent[] {
  switch (input.trim().toLowerCase()) {
    case "approval":
      return approvalFixtureEvents(runId);
    case "fail":
      return failureFixtureEvents(runId);
    case "cancel":
      return cancelledFixtureEvents(runId);
    default:
      return defaultFixtureEvents(runId);
  }
}

export function createFakeHermesServer(options: FakeHermesServerOptions = {}): FakeHermesServer {
  const apiKey = options.apiKey ?? "fixture-only-key";
  const sessions = new Map<string, FixtureSession>();
  const runs = new Map<string, FixtureRun>();
  let runCounter = 0;
  let sessionCounter = 0;
  let server: Server | undefined;
  let port = 0;

  const requireAuth = (request: IncomingMessage, response: ServerResponse): boolean => {
    const authorization = request.headers.authorization;
    if (authorization === `Bearer ${apiKey}`) {
      return true;
    }
    writeJson(
      response,
      { error: { code: "unauthorized", message: "invalid fixture bearer" } },
      401,
    );
    return false;
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const parsedUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const pathname = parsedUrl.pathname;

    if (pathname !== "/health" && pathname !== "/v1/health" && !requireAuth(request, response)) {
      return;
    }

    if (request.method === "GET" && (pathname === "/health" || pathname === "/v1/health")) {
      writeJson(response, { status: "ok", version: "fixture" });
      return;
    }

    if (request.method === "GET" && pathname === "/v1/capabilities") {
      writeJson(response, {
        object: "hermes.api_server.capabilities",
        platform: "hermes-agent-fixture",
        auth: { type: "bearer", required: true },
        features: {
          run_submission: true,
          run_events_sse: true,
          run_stop: true,
          run_approval: true,
          session_list: true,
        },
      });
      return;
    }

    if (pathname === "/api/sessions" && request.method === "GET") {
      writeJson(response, {
        object: "list",
        data: [...sessions.values()],
        limit: 50,
        offset: 0,
        has_more: false,
      });
      return;
    }

    if (pathname === "/api/sessions" && request.method === "POST") {
      const body = await readJsonBody(request);
      const id = typeof body.id === "string" && body.id ? body.id : `fixture-${++sessionCounter}`;
      const session: FixtureSession = {
        id,
        title: typeof body.title === "string" ? body.title : "Fixture session",
        message_count: 0,
      };
      sessions.set(id, session);
      writeJson(response, { object: "hermes.session", session }, 201);
      return;
    }

    const messagesMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
    if (request.method === "GET" && messagesMatch) {
      const sessionId = decodeURIComponent(messagesMatch[1]);
      writeJson(response, { object: "list", session_id: sessionId, data: [] });
      return;
    }

    if (pathname === "/v1/runs" && request.method === "POST") {
      const body = await readJsonBody(request);
      const input = typeof body.input === "string" ? body.input : "";
      const id = `run_fixture_${++runCounter}`;
      const run: FixtureRun = {
        id,
        input,
        status: "started",
        events: runEvents(id, input),
      };
      runs.set(id, run);
      writeJson(response, { run_id: id, status: "started" }, 202);
      return;
    }

    const eventsMatch = pathname.match(/^\/v1\/runs\/([^/]+)\/events$/);
    if (request.method === "GET" && eventsMatch) {
      const run = runs.get(decodeURIComponent(eventsMatch[1]));
      if (!run) {
        writeJson(response, { error: { code: "run_not_found", message: "fixture run not found" } }, 404);
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.write(": keepalive\n\n");
      for (const chunk of splitSsePayload(encodeSseEvents(run.events))) {
        response.write(chunk);
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      response.end();
      return;
    }

    const stopMatch = pathname.match(/^\/v1\/runs\/([^/]+)\/stop$/);
    if (request.method === "POST" && stopMatch) {
      const runId = decodeURIComponent(stopMatch[1]);
      const run = runs.get(runId);
      if (!run) {
        writeJson(response, { error: { code: "run_not_found", message: "fixture run not found" } }, 404);
        return;
      }
      run.status = "stopping";
      writeJson(response, { run_id: runId, status: "stopping" });
      return;
    }

    const approvalMatch = pathname.match(/^\/v1\/runs\/([^/]+)\/approval$/);
    if (request.method === "POST" && approvalMatch) {
      const runId = decodeURIComponent(approvalMatch[1]);
      const run = runs.get(runId);
      if (!run) {
        writeJson(response, { error: { code: "run_not_found", message: "fixture run not found" } }, 404);
        return;
      }
      const body = await readJsonBody(request);
      const choice = typeof body.choice === "string" ? body.choice : "deny";
      run.status = "running";
      writeJson(response, {
        object: "hermes.run.approval_response",
        run_id: runId,
        choice,
        resolved: 1,
      });
      return;
    }

    writeJson(response, { error: { code: "not_found", message: "fixture route not found" } }, 404);
  };

  return {
    get url() {
      return `http://127.0.0.1:${port}`;
    },
    start() {
      server = createServer((request, response) => {
        void handle(request, response).catch((error: unknown) => {
          if (!response.headersSent) {
            writeJson(response, { error: { code: "fixture_error", message: "fixture handler failed" } }, 500);
          } else {
            response.destroy(error instanceof Error ? error : undefined);
          }
        });
      });
      return new Promise<void>((resolve, reject) => {
        server?.once("error", reject);
        server?.listen(0, "127.0.0.1", () => {
          const address = server?.address();
          if (address && typeof address === "object") {
            port = address.port;
          }
          resolve();
        });
      });
    },
    stop() {
      if (!server) {
        return Promise.resolve();
      }
      const activeServer = server;
      server = undefined;
      return new Promise<void>((resolve, reject) => {
        activeServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
