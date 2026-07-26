import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { appStateReducer, initialAppState } from "./app-state";
import { ChatView } from "../components/ChatView";
import { LifecycleControls } from "../components/LifecycleControls";
import { PairingView } from "../components/PairingView";
import { SessionDrawer } from "../components/SessionDrawer";
import { apiKeyStore, type ApiKeyStore } from "../lib/credentials";
import { createHermesApi } from "../lib/hermes-api";
import { runTermuxLifecycle } from "../lib/lifecycle-actions";
import type { ChatMessage } from "../lib/session-store";
import { resolveHermesApiUrl } from "../lib/transport-policy";

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Hermes is not reachable";
}

interface AppProps {
  credentialStore?: ApiKeyStore;
}

export function App({ credentialStore = apiKeyStore }: AppProps = {}) {
  const apiUrl = resolveHermesApiUrl(import.meta.env.VITE_HERMES_API_URL);
  const [apiKey, setApiKey] = useState<string>();
  const [credentialsReady, setCredentialsReady] = useState(false);
  const [credentialError, setCredentialError] = useState<string>();
  useEffect(() => {
    let active = true;
    void credentialStore
      .load()
      .then((storedKey) => {
        if (!active) return;
        setApiKey(storedKey);
        setCredentialsReady(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCredentialError(safeErrorMessage(error));
        setCredentialsReady(true);
      });
    return () => {
      active = false;
    };
  }, [credentialStore]);

  const api = useMemo(
    () => createHermesApi({ baseUrl: apiUrl, apiKey: apiKey || "" }),
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
    if (credentialsReady && apiKey) {
      void checkBackend();
    }
  }, [apiKey, checkBackend, credentialsReady]);

  const forgetPairing = useCallback(async () => {
    await credentialStore.clear();
    setApiKey(undefined);
    setCredentialError(undefined);
    setSessionId(undefined);
    setSessionMessages([]);
  }, [credentialStore]);

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
        <div className="app-header__actions">
          <p className={`connection-status connection-status--${state.status}`} role="status">
            <span className="connection-status__dot" aria-hidden="true" />
            {statusLabel}
          </p>
          {credentialsReady && apiKey ? (
            <button type="button" className="app-header__forget" onClick={() => void forgetPairing()}>
              Forget pairing
            </button>
          ) : null}
        </div>
      </header>

      {!credentialsReady ? (
        <section className="connection-card" aria-label="Loading secure credentials">
          <h2>Loading secure credentials</h2>
          <p>Preparing the local Android pairing before contacting Hermes.</p>
        </section>
      ) : !apiKey ? (
        <>
          {credentialError ? <p className="pairing-form__error" role="alert">{credentialError}</p> : null}
          <PairingView
            apiUrl={apiUrl}
            onPair={async (newKey) => {
              await credentialStore.save(newKey);
              setApiKey(newKey);
            }}
          />
        </>
      ) : null}

      {credentialsReady && apiKey && (state.status === "checking" || state.status === "unknown") ? (
        <section className="connection-card" aria-label="Connecting to Hermes">
          <h2>Connecting to Hermes</h2>
          <p>Checking the local API at {apiUrl}.</p>
        </section>
      ) : null}

      {credentialsReady && apiKey && state.status === "offline" ? (
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

      {credentialsReady && apiKey && state.status === "online" ? (
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
