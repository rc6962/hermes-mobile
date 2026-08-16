import type { SessionSummary } from "./balls-types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type SessionLoadStatus = "idle" | "loading" | "ready" | "error";

export interface SessionState {
  status: SessionLoadStatus;
  sessions: SessionSummary[];
  selectedSessionId?: string;
  error?: string;
}

export type SessionAction =
  | { type: "sessions_loading" }
  | { type: "sessions_loaded"; sessions: SessionSummary[] }
  | { type: "session_created"; session: SessionSummary }
  | { type: "session_selected"; sessionId: string }
  | { type: "sessions_failed"; message: string };

export function initialSessionState(): SessionState {
  return {
    status: "idle",
    sessions: [],
    selectedSessionId: undefined,
    error: undefined,
  };
}

export function sessionStateReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "sessions_loading":
      return { ...state, status: "loading", error: undefined };
    case "sessions_loaded":
      return { ...state, status: "ready", sessions: action.sessions, error: undefined };
    case "session_created":
      return {
        ...state,
        status: "ready",
        sessions: [
          action.session,
          ...state.sessions.filter((session) => session.id !== action.session.id),
        ],
        selectedSessionId: action.session.id,
        error: undefined,
      };
    case "session_selected":
      return { ...state, status: "ready", selectedSessionId: action.sessionId, error: undefined };
    case "sessions_failed":
      return { ...state, status: "error", error: action.message };
    default:
      return state;
  }
}

export function normalizeSessionMessages(messages: unknown[]): ChatMessage[] {
  return messages.flatMap((message) => {
    if (message === null || typeof message !== "object") {
      return [];
    }
    const record = message as Record<string, unknown>;
    const role = record.role;
    const content = record.content;
    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string"
    ) {
      return [];
    }
    return [{ role, content }];
  });
}
