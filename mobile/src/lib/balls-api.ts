import { getNativeStreamImplementation, type NativeStreamImplementation } from "./native-stream";
import { getNativeHttpImplementation, type NativeHttpImplementation } from "./native-http";
import { createSseParser, type SseEvent } from "./sse";
import type {
  ApprovalDecision,
  ApprovalResponse,
  CapabilitiesResponse,
  HealthResponse,
  RunControlResponse,
  RunStarted,
  RunSubmissionInput,
  SessionCreateInput,
  SessionListResponse,
  SessionMessagesResponse,
  SessionSummary,
} from "./balls-types";

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface BallsApiOptions {
  baseUrl: string;
  apiKey: string;
  sessionKey?: string;
  fetchImpl?: FetchImplementation;
  nativeHttpImpl?: NativeHttpImplementation;
  nativeStreamImpl?: NativeStreamImplementation;
}

export class BallsApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "BallsApiError";
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

async function errorFromResponse(response: Response): Promise<BallsApiError> {
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

  return new BallsApiError(
    response.status,
    message || `Balls API request failed with HTTP ${response.status}`,
    code,
  );
}

export function createBallsApi(options: BallsApiOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const nativeHttpImpl = options.nativeHttpImpl ?? getNativeHttpImplementation();
  const nativeStreamImpl = options.nativeStreamImpl ?? getNativeStreamImplementation();

  const headers = (hasJsonBody = false): Record<string, string> => {
    const result: Record<string, string> = {};
    if (options.apiKey) {
      result.Authorization = `Bearer ${options.apiKey}`;
    }
    if (options.sessionKey) {
      result["X-Balls-Session-Key"] = options.sessionKey;
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

    startRun(input: RunSubmissionInput): Promise<RunStarted> {
      const body: {
        input: RunSubmissionInput["input"];
        session_id?: string;
        attachment_ids?: string[];
      } = { input: input.input };
      if (input.sessionId) {
        body.session_id = input.sessionId;
      }
      if (input.attachmentIds?.length) {
        body.attachment_ids = input.attachmentIds;
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
      const streamUrl = `${baseUrl}/v1/runs/${encodeURIComponent(runId)}/events`;
      const streamInit: RequestInit = {
        headers: {
          ...headers(),
          Accept: "text/event-stream",
        },
        signal,
      };
      const parseErrors: Error[] = [];
      const parser = createSseParser({
        onEvent,
        onError: (error) => parseErrors.push(error),
      });

      if (nativeStreamImpl) {
        await nativeStreamImpl(streamUrl, streamInit, (chunk) => parser.push(chunk));
        parser.end();
      } else {
        const response = await fetchImpl(streamUrl, streamInit);
        if (!response.ok) {
          throw await errorFromResponse(response);
        }
        if (!response.body) {
          throw new BallsApiError(502, "Balls API returned an empty event stream");
        }

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
        throw new BallsApiError(502, "Balls API returned an invalid session response");
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

export type BallsApi = ReturnType<typeof createBallsApi>;
