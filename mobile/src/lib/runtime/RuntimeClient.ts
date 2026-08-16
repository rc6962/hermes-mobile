import type { SseEvent } from "../sse";
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
} from "../balls-types";

/**
 * RuntimeClient is the runtime-neutral contract for the Balls app.
 *
 * Both the Termux runtime (existing Balls in Termux) and the future managed
 * runtime (embedded Balls via Chaquopy) must satisfy this interface. UI
 * components must depend on RuntimeClient, never on a runtime-specific
 * implementation.
 *
 * Error semantics: methods reject with BallsApiError (status + optional
 * code). Runtimes must not throw generic strings.
 */
export interface RuntimeClient {
  health(): Promise<HealthResponse>;
  /**
   * Start the runtime's backing process (Termux gateway or embedded
   * service). Runtime-specific: throws if the runtime cannot start.
   */
  startRuntime(): Promise<{ started: boolean }>;
  capabilities(): Promise<CapabilitiesResponse>;
  listModels(): Promise<unknown>;
  startRun(input: RunSubmissionInput): Promise<RunStarted>;
  subscribeToRun(
    runId: string,
    onEvent: (event: SseEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  stopRun(runId: string): Promise<RunControlResponse>;
  respondToApproval(runId: string, decision: ApprovalDecision): Promise<ApprovalResponse>;
  createSession(input?: SessionCreateInput): Promise<SessionSummary>;
  listSessions(): Promise<SessionListResponse>;
  getSessionMessages(sessionId: string): Promise<SessionMessagesResponse>;
}

export type { SseEvent };
