import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { appStateReducer, initialAppState } from "./app-state";
import { BridgeStatusCard } from "../components/BridgeStatusCard";
import { ChatView } from "../components/ChatView";
import { PairingView } from "../components/PairingView";
import { PresentationSettings } from "../components/PresentationSettings";
import { SessionDrawer } from "../components/SessionDrawer";
import { apiKeyStore, type ApiKeyStore } from "../lib/credentials";
import { createRuntimeClient } from "../lib/runtime/create-runtime-client";
import { getEmbeddedApiKey, startManagedRuntime } from "../lib/runtime/managed-runtime";
import { createAttachmentAdapterClient } from "../lib/attachment-adapter-client";
import { androidBridge, type AndroidBridgeAdapter, type AndroidBridgeStatus } from "../lib/android-bridge";
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
    // The embedded runtime owns its key (generated in Keystore on first
    // use). Web dev falls back to the regular credential store.
    const loadKey: Promise<string | undefined> = getEmbeddedApiKey().catch(() =>
      credentialStore.load().then((stored) => stored ?? undefined),
    );
    void loadKey
      .then((resolvedKey) => {
        if (!active) return;
        setApiKey(resolvedKey);
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

  const [presentationPreferences, setPresentationPreferences] = useState(loadPresentationPreferences);

  const api = useMemo(
    () => createRuntimeClient({ kind: "managed", baseUrl: apiUrl, apiKey: apiKey || "" }),
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

  // Consumer flow: opening the app starts the embedded engine (idempotent —
  // the native plugin guards double-start), then the health check above
  // reports Online once it answers.
  useEffect(() => {
    if (credentialsReady && apiKey) {
      void startManagedRuntime().then(() => checkBackend());
    }
  }, [apiKey, checkBackend, credentialsReady]);


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
          <p className="eyebrow">LOCAL AI ENGINE</p>
          <h1>Balls</h1>
        </div>
        <div className="app-header__actions">
          <p className={`connection-status connection-status--${state.status}`} role="status">
            <span className="connection-status__dot" aria-hidden="true" />
            {statusLabel}
          </p>
          <PresentationSettings preferences={presentationPreferences} onChange={updatePresentationPreferences} />
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
          <p>{state.error || "Open Settings and tap Start to launch the local engine."}</p>
          <p className="muted">
            The AI engine runs on this device. Your chat data stays on the phone unless a
            remote provider is configured.
          </p>
          <button type="button" onClick={() => void checkBackend()}>
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
