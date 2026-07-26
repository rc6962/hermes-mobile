import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { appStateReducer, initialAppState } from "./app-state";
import { ChatView } from "../components/ChatView";
import { LifecycleControls } from "../components/LifecycleControls";
import { SessionDrawer } from "../components/SessionDrawer";
import { createHermesApi } from "../lib/hermes-api";
import { runTermuxLifecycle } from "../lib/lifecycle-actions";
import type { ChatMessage } from "../lib/session-store";
import { resolveHermesApiUrl } from "../lib/transport-policy";

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Hermes is not reachable";
}

export function App() {
  const apiUrl = resolveHermesApiUrl(import.meta.env.VITE_HERMES_API_URL);
  const apiKey = import.meta.env.VITE_API_SERVER_KEY || "";
  const api = useMemo(
    () => createHermesApi({ baseUrl: apiUrl, apiKey }),
    [apiKey, apiUrl],
  );
  const [state, dispatch] = useReducer(appStateReducer, undefined, initialAppState);
  const [sessionId, setSessionId] = useState<string>();
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([]);

  const checkBackend = useCallback(async () => {
    dispatch({ type: "health_check_started" });
    try {
      const health = await api.health();
      dispatch({ type: "health_check_succeeded", health });
    } catch (error) {
      dispatch({ type: "health_check_failed", message: safeErrorMessage(error) });
    }
  }, [api]);

  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  const statusLabel =
    state.status === "checking"
      ? "Checking…"
      : state.status === "online"
        ? "Online"
        : state.status === "offline"
          ? "Offline"
          : "Not checked";

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">TERMUX-BACKED ASSISTANT</p>
          <h1>Hermes Mobile</h1>
        </div>
        <p className={`connection-status connection-status--${state.status}`} role="status">
          <span className="connection-status__dot" aria-hidden="true" />
          {statusLabel}
        </p>
      </header>

      {state.status === "checking" || state.status === "unknown" ? (
        <section className="connection-card" aria-label="Connecting to Hermes">
          <h2>Connecting to Hermes</h2>
          <p>Checking the local API at {apiUrl}.</p>
        </section>
      ) : null}

      {state.status === "offline" ? (
        <section className="connection-card connection-card--offline" role="alert">
          <h2>Hermes is offline</h2>
          <p>{state.error || "Start the Hermes API server in Termux, then retry."}</p>
          <p className="muted">
            The app only talks to the local Termux backend. No chat data is sent to a remote
            server by this frontend.
          </p>
          <LifecycleControls onAction={runTermuxLifecycle} />
          <button type="button" onClick={() => void checkBackend()}>
            Retry connection
          </button>
        </section>
      ) : null}

      {state.status === "online" ? (
        <div className="app-content">
          <SessionDrawer
            api={api}
            selectedSessionId={sessionId}
            onSelect={(selectedId, messages) => {
              setSessionId(selectedId);
              setSessionMessages(messages);
            }}
          />
          <ChatView api={api} sessionId={sessionId} initialMessages={sessionMessages} />
        </div>
      ) : null}
    </main>
  );
}
