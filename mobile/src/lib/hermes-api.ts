import { getNativeHttpImplementation, type NativeHttpImplementation } from "./native-http";
import { createSseParser, type SseEvent } from "./sse";
import type {
  ApprovalDecision,
  ApprovalResponse,
  CapabilitiesResponse,
  HealthResponse,
  RunControlResponse,
  RunStarted,
  SessionCreateInput,
  SessionListResponse,
  SessionMessagesResponse,
  SessionSummary,
} from "./hermes-types";

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface HermesApiOptions {
  baseUrl: string;
  apiKey: string;
  sessionKey?: string;
  fetchImpl?: FetchImplementation;
  nativeHttpImpl?: NativeHttpImplementation;
}

export class HermesApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "HermesApiError";
    this.status = status;
    this.code = code;
  }
}

interface JsonErrorBody {
  error?: {
    code?: string;
    message?: string;
  } | string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

async function errorFromResponse(response: Response): Promise<HermesApiError> {
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    body = undefined;
  }

  const error = isRecord(body) ? (body as JsonErrorBody).error : undefined;
  const code = typeof error === "object" && error ? error.code : undefined;
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error
        ? error.message
        : undefined;

  return new HermesApiError(
    response.status,
    message || `Hermes API request failed with HTTP ${response.status}`,
    code,
  );
}

export function createHermesApi(options: HermesApiOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const nativeHttpImpl = options.nativeHttpImpl ?? getNativeHttpImplementation();

  const headers = (hasJsonBody = false): Record<string, string> => {
    const result: Record<string, string> = {};
    if (options.apiKey) {
      result.Authorization = `Bearer ${options.apiKey}`;
    }
    if (options.sessionKey) {
      result["X-Hermes-Session-Key"] = options.sessionKey;
    }
    if (hasJsonBody) {
      result["Content-Type"] = "application/json";
    }
    return result;
  };

  const requestJson = async <T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> => {
    const hasJsonBody = typeof init.body === "string";
    const response = await (nativeHttpImpl ?? fetchImpl)(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...headers(hasJsonBody),
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      throw await errorFromResponse(response);
    }

    return (await response.json()) as T;
  };

  return {
    health(): Promise<HealthResponse> {
      return requestJson<HealthResponse>("/health");
    },

    capabilities(): Promise<CapabilitiesResponse> {
      return requestJson<CapabilitiesResponse>("/v1/capabilities");
    },

    listModels(): Promise<unknown> {
      return requestJson<unknown>("/v1/models");
    },

    startRun(input: { input: string; sessionId?: string }): Promise<RunStarted> {
      const body: Record<string, string> = { input: input.input };
      if (input.sessionId) {
        body.session_id = input.sessionId;
      }

      return requestJson<{ run_id: string; status: string }>("/v1/runs", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((response) => ({
        runId: response.run_id,
        status: response.status,
      }));
    },

    async subscribeToRun(
      runId: string,
      onEvent: (event: SseEvent) => void,
      signal?: AbortSignal,
    ): Promise<void> {
      const response = await fetchImpl(
        `${baseUrl}/v1/runs/${encodeURIComponent(runId)}/events`,
        { headers: headers(), signal },
      );
      if (!response.ok) {
        throw await errorFromResponse(response);
      }
      if (!response.body) {
        throw new HermesApiError(502, "Hermes API returned an empty event stream");
      }

      const parseErrors: Error[] = [];
      const parser = createSseParser({
        onEvent,
        onError: (error) => parseErrors.push(error),
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            parser.push(decoder.decode());
            parser.end();
            break;
          }
          parser.push(decoder.decode(value, { stream: true }));
        }
      } finally {
        reader.releaseLock();
      }

      if (parseErrors.length > 0) {
        throw parseErrors[0];
      }
    },

    stopRun(runId: string): Promise<RunControlResponse> {
      return requestJson<RunControlResponse>(
        `/v1/runs/${encodeURIComponent(runId)}/stop`,
        { method: "POST" },
      );
    },

    respondToApproval(
      runId: string,
      decision: ApprovalDecision,
    ): Promise<ApprovalResponse> {
      const body: Record<string, string | boolean> = {
        choice: decision.choice,
      };
      if (decision.resolveAll !== undefined) {
        body.resolve_all = decision.resolveAll;
      }

      return requestJson<ApprovalResponse>(
        `/v1/runs/${encodeURIComponent(runId)}/approval`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },

    async createSession(input: SessionCreateInput = {}): Promise<SessionSummary> {
      const body: Record<string, string> = {};
      if (input.id) body.id = input.id;
      if (input.title) body.title = input.title;
      if (input.model) body.model = input.model;
      if (input.systemPrompt) body.system_prompt = input.systemPrompt;

      const response = await requestJson<{ session?: SessionSummary }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!response.session || typeof response.session.id !== "string") {
        throw new HermesApiError(502, "Hermes API returned an invalid session response");
      }
      return response.session;
    },

    listSessions(): Promise<SessionListResponse> {
      return requestJson<SessionListResponse>("/api/sessions");
    },

    getSessionMessages(sessionId: string): Promise<SessionMessagesResponse> {
      return requestJson<SessionMessagesResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
      );
    },
  };
}

export type HermesApi = ReturnType<typeof createHermesApi>;
