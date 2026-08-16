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
} from "../hermes-types";

/**
 * RuntimeClient is the runtime-neutral contract for the Balls app.
 *
 * Both the Termux runtime (existing Hermes in Termux) and the future managed
 * runtime (embedded Hermes via Chaquopy) must satisfy this interface. UI
 * components must depend on RuntimeClient, never on a runtime-specific
 * implementation.
 *
 * Error semantics: methods reject with HermesApiError (status + optional
 * code). Runtimes must not throw generic strings.
 */
export interface RuntimeClient {
  health(): Promise<HealthResponse>;
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
