import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { appStateReducer, initialAppState } from "./app-state";
import { BridgeStatusCard } from "../components/BridgeStatusCard";
import { ChatView } from "../components/ChatView";
import { LifecycleControls } from "../components/LifecycleControls";
import { PairingView } from "../components/PairingView";
import { PresentationSettings } from "../components/PresentationSettings";
import { SessionDrawer } from "../components/SessionDrawer";
import { apiKeyStore, type ApiKeyStore } from "../lib/credentials";
import { createRuntimeClient } from "../lib/runtime/create-runtime-client";
import { createAttachmentAdapterClient } from "../lib/attachment-adapter-client";
import { androidBridge, type AndroidBridgeAdapter, type AndroidBridgeStatus } from "../lib/android-bridge";
import { runTermuxLifecycle, type LifecycleAction } from "../lib/lifecycle-actions";
import {
  loadPresentationPreferences,
  savePresentationPreferences,
  type PresentationPreferences,
} from "../lib/presentation-preferences";
import type { ChatMessage } from "../lib/session-store";
import { resolveHermesApiUrl, resolveAttachmentAdapterUrl } from "../lib/transport-policy";

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Balls is not reachable";
}

const RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 1000;

function waitForReconnectAttempt(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, RECONNECT_DELAY_MS));
}

interface AppProps {
  credentialStore?: ApiKeyStore;
  bridgeAdapter?: AndroidBridgeAdapter;
}

export function App({ credentialStore = apiKeyStore, bridgeAdapter = androidBridge }: AppProps = {}) {
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
    () => createRuntimeClient({ kind: "termux", baseUrl: apiUrl, apiKey: apiKey || "" }),
    [apiKey, apiUrl],
  );
  const attachmentAdapter = useMemo(
    () =>
      createAttachmentAdapterClient({
        baseUrl: resolveAttachmentAdapterUrl(import.meta.env.VITE_ATTACHMENT_ADAPTER_URL),
        apiKey: apiKey || "",
      }),
    [apiKey],
  );
  const [state, dispatch] = useReducer(appStateReducer, undefined, initialAppState);
  const [sessionId, setSessionId] = useState<string>();
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([]);
  const [bridgeStatus, setBridgeStatus] = useState<AndroidBridgeStatus>();
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState<string>();
  const [presentationPreferences, setPresentationPreferences] = useState(loadPresentationPreferences);

  useEffect(() => {
    savePresentationPreferences(presentationPreferences);
    document.documentElement.dataset.theme = presentationPreferences.theme;
  }, [presentationPreferences]);

  const updatePresentationPreferences = useCallback((preferences: PresentationPreferences) => {
    setPresentationPreferences(preferences);
  }, []);

  const checkBackend = useCallback(async (): Promise<boolean> => {
    dispatch({ type: "health_check_started" });
    try {
      const health = await api.health();
      dispatch({ type: "health_check_succeeded", health });
      return true;
    } catch (error) {
      dispatch({ type: "health_check_failed", message: safeErrorMessage(error) });
      return false;
    }
  }, [api]);

  const reconnectBackend = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt += 1) {
      if (await checkBackend()) return true;
      if (attempt < RECONNECT_ATTEMPTS - 1) await waitForReconnectAttempt();
    }
    return false;
  }, [checkBackend]);

  const runLifecycleAction = useCallback(
    async (action: LifecycleAction) => {
      const result = await runTermuxLifecycle(action);
      if (action === "start" || action === "restart") {
        const online = await reconnectBackend();
        if (!online) throw new Error("Balls did not come back online after the restart request");
      }
      return result;
    },
    [reconnectBackend],
  );

  const refreshBridgeStatus = useCallback(async () => {
    setBridgeLoading(true);
    setBridgeError(undefined);
    try {
      setBridgeStatus(await bridgeAdapter.getStatus());
    } catch (error) {
      setBridgeError(safeErrorMessage(error));
    } finally {
      setBridgeLoading(false);
    }
  }, [bridgeAdapter]);

  const openAccessibilitySettings = useCallback(async () => {
    setBridgeError(undefined);
    try {
      await bridgeAdapter.openAccessibilitySettings();
      await refreshBridgeStatus();
    } catch (error) {
      setBridgeError(safeErrorMessage(error));
    }
  }, [bridgeAdapter, refreshBridgeStatus]);

  useEffect(() => {
    if (credentialsReady && apiKey) {
      void checkBackend();
      void refreshBridgeStatus();
    } else {
      setBridgeStatus(undefined);
      setBridgeError(undefined);
    }
  }, [apiKey, checkBackend, credentialsReady, refreshBridgeStatus]);

  const forgetPairing = useCallback(async () => {
    await credentialStore.clear();
    setApiKey(undefined);
    setCredentialError(undefined);
    setSessionId(undefined);
    setSessionMessages([]);
    setBridgeStatus(undefined);
    setBridgeError(undefined);
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
    <main className="app-shell" data-theme={presentationPreferences.theme}>
      <header className="app-header">
        <div>
          <p className="eyebrow">TERMUX-BACKED ASSISTANT</p>
          <h1>Balls</h1>
        </div>
        <div className="app-header__actions">
          <p className={`connection-status connection-status--${state.status}`} role="status">
            <span className="connection-status__dot" aria-hidden="true" />
            {statusLabel}
          </p>
          <PresentationSettings
            preferences={presentationPreferences}
            onChange={updatePresentationPreferences}
          />
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
          <p>Preparing the local Android pairing before contacting Balls.</p>
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
        <section className="connection-card" aria-label="Connecting to Balls">
          <h2>Connecting to Balls</h2>
          <p>Checking the local API at {apiUrl}.</p>
        </section>
      ) : null}

      {credentialsReady && apiKey && state.status === "offline" ? (
        <section className="connection-card connection-card--offline" role="alert">
          <h2>Balls is offline</h2>
          <p>{state.error || "Start the local AI engine in Termux, then retry."}</p>
          <p className="muted">
            The app only talks to the local Termux backend. No chat data is sent to a remote
            server by this frontend.
          </p>
          <LifecycleControls onAction={runLifecycleAction} />
          <button type="button" onClick={() => void runLifecycleAction("restart").catch(() => undefined)}>
            Retry connection
          </button>
        </section>
      ) : null}

      {credentialsReady && apiKey ? (
        <BridgeStatusCard
          status={bridgeStatus}
          loading={bridgeLoading}
          error={bridgeError}
          onRefresh={refreshBridgeStatus}
          onOpenSettings={openAccessibilitySettings}
        />
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
          <ChatView
            api={api}
            sessionId={sessionId}
            initialMessages={sessionMessages}
            attachmentAdapter={attachmentAdapter}
          />
        </div>
      ) : null}
    </main>
  );
}
