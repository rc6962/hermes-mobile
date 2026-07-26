import { useEffect, useReducer } from "react";

import type { HermesApi } from "../lib/hermes-api";
import {
  initialSessionState,
  normalizeSessionMessages,
  sessionStateReducer,
  type ChatMessage,
} from "../lib/session-store";

export interface SessionDrawerProps {
  api: Pick<HermesApi, "listSessions" | "createSession" | "getSessionMessages">;
  selectedSessionId?: string;
  onSelect: (sessionId: string, messages: ChatMessage[]) => void;
}

function displayTitle(session: { id: string; title?: unknown }): string {
  return typeof session.title === "string" && session.title.trim() ? session.title : session.id;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load sessions";
}

export function SessionDrawer({ api, selectedSessionId, onSelect }: SessionDrawerProps) {
  const [state, dispatch] = useReducer(sessionStateReducer, undefined, initialSessionState);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "sessions_loading" });
    void api
      .listSessions()
      .then((response) => {
        if (!cancelled) {
          dispatch({ type: "sessions_loaded", sessions: response.data });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({ type: "sessions_failed", message: safeErrorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const select = async (sessionId: string) => {
    dispatch({ type: "session_selected", sessionId });
    try {
      const response = await api.getSessionMessages(sessionId);
      onSelect(sessionId, normalizeSessionMessages(response.data));
    } catch (error) {
      dispatch({ type: "sessions_failed", message: safeErrorMessage(error) });
    }
  };

  const create = async () => {
    try {
      const session = await api.createSession({ title: "New chat" });
      dispatch({ type: "session_created", session });
      onSelect(session.id, []);
    } catch (error) {
      dispatch({ type: "sessions_failed", message: safeErrorMessage(error) });
    }
  };

  return (
    <aside className="session-drawer" aria-label="Sessions">
      <div className="session-drawer__header">
        <h2>Sessions</h2>
        <button type="button" onClick={() => void create()} aria-label="New session">
          +
        </button>
      </div>
      {state.status === "loading" ? <p className="muted">Loading sessions…</p> : null}
      {state.error ? <p role="alert" className="chat-error">{state.error}</p> : null}
      {state.sessions.length === 0 && state.status !== "loading" ? (
        <p className="muted">No saved sessions yet.</p>
      ) : null}
      <ul>
        {state.sessions.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              className={selectedSessionId === session.id ? "session-drawer__item session-drawer__item--selected" : "session-drawer__item"}
              aria-pressed={selectedSessionId === session.id}
              onClick={() => void select(session.id)}
            >
              <span>{displayTitle(session)}</span>
              {typeof session.message_count === "number" ? <small>{session.message_count}</small> : null}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
