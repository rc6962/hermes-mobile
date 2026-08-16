import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { appStateReducer, initialAppState } from "./app-state";
import { BridgeStatusCard } from "../components/BridgeStatusCard";
import { ChatView } from "../components/ChatView";
import { PairingView } from "../components/PairingView";
import { PresentationSettings } from "../components/PresentationSettings";
import { VoiceTab } from "../components/VoiceTab";
import { SessionDrawer } from "../components/SessionDrawer";
import { apiKeyStore, type ApiKeyStore } from "../lib/credentials";
import { createRuntimeClient } from "../lib/runtime/create-runtime-client";
import {
  getEmbeddedApiKey,
  hasProviderConfig,
  startManagedRuntime,
  stopManagedRuntime,
} from "../lib/runtime/managed-runtime";
import { provisionEpicCloud } from "../lib/provisioning";
import { createAttachmentAdapterClient } from "../lib/attachment-adapter-client";
import { androidBridge, type AndroidBridgeAdapter, type AndroidBridgeStatus } from "../lib/android-bridge";
import {
  loadPresentationPreferences,
  savePresentationPreferences,
  type PresentationPreferences,
} from "../lib/presentation-preferences";
import type { ChatMessage } from "../lib/session-store";
import { resolveBallsApiUrl, resolveAttachmentAdapterUrl } from "../lib/transport-policy";

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Balls is not answering.";
}

interface AppProps {
  credentialStore?: ApiKeyStore;
  bridgeAdapter?: AndroidBridgeAdapter;
}

export function App({ credentialStore = apiKeyStore, bridgeAdapter = androidBridge }: AppProps = {}) {
  const apiUrl = resolveBallsApiUrl(import.meta.env.VITE_BALLS_API_URL);
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
  const [voiceOpen, setVoiceOpen] = useState(false);
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

  // Poll until the engine answers: the embedded runtime takes 15-30s to
  // boot, so a single launch check always races it. Backoff: 2s x6, 4s x6,
  // 8s x6, then 30s cadence — stop the moment we're online.
  useEffect(() => {
    if (!credentialsReady || !apiKey) return;
    let stopped = false;
    let timer: number | undefined;
    const delays = [2, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 4, 8, 8, 8, 8, 8, 8, 30];
    let i = 0;
    const tick = async () => {
      if (stopped) return;
      if (await checkBackend()) return;
      if (i >= delays.length) return;
      timer = window.setTimeout(() => void tick(), delays[i++] * 1000);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [credentialsReady, apiKey, checkBackend]);


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
      void (async () => {
        const started = await startManagedRuntime();
        if (started.started) {
          // First launch: provision Epic Cloud (device -> token -> provider
          // config) and restart the engine so it boots with the provider.
          try {
            if (!(await hasProviderConfig())) {
              const provisioned = await provisionEpicCloud();
              if (provisioned.provisioned) {
                await stopManagedRuntime();
                // The service stops asynchronously; a start inside the stop
                // window is swallowed by the guard — give it a beat.
                await new Promise((resolve) => setTimeout(resolve, 4000));
                await startManagedRuntime();
              }
            }
          } catch {
            // Provisioning is best-effort at launch; the next launch retries.
          }
        }
        void checkBackend();
      })();
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
          <p className="eyebrow">AN EPIC TECHNOLOGIES PRODUCT</p>
          <h1>Balls</h1>
        </div>
        <div className="app-header__actions">
          <p className={`connection-status connection-status--${state.status}`} role="status">
            <span className="connection-status__dot" aria-hidden="true" />
            {statusLabel}
          </p>
          <button
            type="button"
            className="app-header__voice"
            onClick={() => setVoiceOpen((open) => !open)}
          >
            {voiceOpen ? "Chat" : "Voice"}
          </button>
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
          <p>{state.error || "Balls couldn't start. Try the connection again."}</p>
          <p className="muted">
            The engine lives on this device — your chats stay private unless you
            connect a cloud provider.
          </p>
          <button type="button" className="connection-card__cta" onClick={() => void checkBackend()}>
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

      {credentialsReady && apiKey && state.status === "online" && voiceOpen ? (
        <div className="app-content">
          <VoiceTab />
        </div>
      ) : null}

      {credentialsReady && apiKey && state.status === "online" && !voiceOpen ? (
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
