import { useEffect, useState } from "react";

import {
  downloadLocalModel,
  getLocalModelStatus,
  getManagedRuntimeStatus,
  hasLocalModel,
  setManagedProviderConfig,
  startLocalModel,
  startManagedRuntime,
  stopLocalModel,
  stopManagedRuntime,
} from "../lib/runtime/managed-runtime";
import { CLOUD_ENDPOINT } from "../lib/podule-registry";
import { provisionEpicCloud } from "../lib/provisioning";

type ModelSource = "epic-cloud" | "on-device" | "custom";

export function RuntimeSettings() {
  const [running, setRunning] = useState(false);
  const [statusError, setStatusError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [modelSource, setModelSource] = useState<ModelSource>("epic-cloud");
  const [providerJson, setProviderJson] = useState("");
  const [providerSaved, setProviderSaved] = useState(false);
  const [localState, setLocalState] = useState<"checking" | "missing" | "ready" | "stopped" | "running">("checking");
  const [localBusy, setLocalBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hasLocalModel()
      .then((result) => {
        if (!cancelled) {
          setLocalState(result.present ? "ready" : "missing");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocalState("missing");
        }
      });
    getLocalModelStatus()
      .then((status) => {
        if (!cancelled && status.running) {
          setLocalState("running");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getManagedRuntimeStatus()
      .then((status) => {
        if (!cancelled) {
          setRunning(status.running);
          setStatusError(status.error);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatusError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStart = async () => {
    setActionError(undefined);
    const result = await startManagedRuntime();
    if (result.started) {
      setRunning(true);
    } else {
      setActionError(result.error ?? "Embedded runtime failed to start");
    }
  };

  const handleStop = async () => {
    setActionError(undefined);
    const result = await stopManagedRuntime();
    setRunning(!result.stopped);
  };

  const handleDownload = async () => {
    setActionError(undefined);
    setLocalBusy(true);
    try {
      const result = await downloadLocalModel();
      if (result.ok) {
        setLocalState("ready");
      } else {
        setActionError("The local model download did not complete. Try again.");
      }
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Local model download failed.");
    } finally {
      setLocalBusy(false);
    }
  };

  const handleStartLocal = async () => {
    setActionError(undefined);
    setLocalBusy(true);
    try {
      const result = await hasLocalModel();
      const result2 = await startLocalModel(result.path);
      if (result2.ok) {
        setLocalState("running");
      } else {
        setActionError(result2.error ?? "The local engine would not start.");
      }
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "The local engine would not start.");
    } finally {
      setLocalBusy(false);
    }
  };

  const handleStopLocal = async () => {
    setActionError(undefined);
    try {
      await stopLocalModel();
      setLocalState("stopped");
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "The local engine would not stop.");
    }
  };

  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  const handleConnect = async () => {
    setActionError(undefined);
    setConnecting(true);
    try {
      const result = await provisionEpicCloud();
      if (result.provisioned) {
        setConnected(true);
        setProviderSaved(true);
      } else {
        setActionError(result.error ?? "Epic Cloud connection failed.");
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleSaveProvider = async () => {
    setActionError(undefined);
    if (!providerJson.trim()) {
      setActionError("Paste the Epic Cloud key (or provider JSON) first.");
      return;
    }
    let config: string;
    if (modelSource === "epic-cloud") {
      // Build the Epic Cloud provider block from the contract: the key is
      // the only user input; endpoint + model come from the registry.
      config = JSON.stringify({
        providers: {
          "opencode-go": {
            base_url: CLOUD_ENDPOINT,
            api_key: providerJson.trim(),
            model: "deepseek-v4-flash",
          },
        },
      });
    } else {
      config = providerJson.trim();
      try {
        JSON.parse(config);
      } catch {
        setActionError("That is not valid JSON.");
        return;
      }
    }
    const result = await setManagedProviderConfig(config);
    if (result.stored) {
      setProviderSaved(true);
    } else {
      setActionError("Balls could not remember that (Android app only).");
    }
  };

  return (
    <section className="presentation-settings__section" aria-labelledby="runtime-settings-heading">
      <h3 id="runtime-settings-heading">Engine</h3>
      <p>Balls runs its own AI engine — nothing else to install.</p>

      <div className="presentation-settings__row">
        <div>
          <h3>Engine status</h3>
          <p>
            Status: {running ? "running" : "stopped"}
            {statusError ? ` — ${statusError}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={running ? handleStop : handleStart}
          className="presentation-settings__action"
        >
          {running ? "Stop" : "Start"}
        </button>
      </div>

      <div className="presentation-settings__row">
        <div>
          <h3>Model source</h3>
          <div className="presentation-settings__themes" role="group" aria-label="Model source">
            <button
              type="button"
              aria-pressed={modelSource === "epic-cloud"}
              className={modelSource === "epic-cloud" ? "is-selected" : undefined}
              onClick={() => setModelSource("epic-cloud")}
            >
              Epic Cloud
            </button>
            <button
              type="button"
              aria-pressed={modelSource === "on-device"}
              className={modelSource === "on-device" ? "is-selected" : undefined}
              onClick={() => setModelSource("on-device")}
            >
              On this device
            </button>
            <button
              type="button"
              aria-pressed={modelSource === "custom"}
              className={modelSource === "custom" ? "is-selected" : undefined}
              onClick={() => setModelSource("custom")}
            >
              Custom (developer)
            </button>
          </div>
          <p className="muted">
            {modelSource === "epic-cloud"
              ? "Epic's hosted models — the default for everyone."
              : modelSource === "on-device"
                ? "Private offline mode — arrives with the on-device model update."
                : ""}
          </p>
        </div>
      </div>

      {modelSource === "epic-cloud" ? (
        <div className="presentation-settings__row">
          <div>
            <h3>Epic Cloud</h3>
            <p>Connect once — Balls provisions its own key automatically.</p>
            {connected ? (
              <p className="muted">Connected. Balls talks to Epic's models.</p>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="presentation-settings__action"
              >
                {connecting ? "Connecting…" : "Connect to Epic Cloud"}
              </button>
            )}
            <textarea
              className="presentation-settings__textarea"
              aria-label="Epic Cloud key (optional)"
              value={providerJson}
              onChange={(event) => {
                setProviderJson(event.target.value);
                setProviderSaved(false);
              }}
              placeholder="Optional: paste a key instead of auto-connecting"
              rows={2}
            />
            <button type="button" onClick={handleSaveProvider} className="presentation-settings__action">
              {providerSaved ? "Saved. Balls won't forget." : "Save key"}
            </button>
          </div>
        </div>
      ) : null}

      {modelSource === "on-device" ? (
        <div className="presentation-settings__row">
          <div>
            <h3>Balls of Steel model</h3>
            <p>Download the local model and chat fully offline. Nothing leaves the phone.</p>
            {localState === "running" ? (
              <p className="presentation-settings__status">Local engine is running.</p>
            ) : null}
            {actionError ? (
              <p className="presentation-settings__error" role="alert">{actionError}</p>
            ) : null}
            <div className="presentation-settings__actions">
              {localState === "missing" ? (
                <button type="button" disabled={localBusy} onClick={handleDownload}>
                  {localBusy ? "Downloading…" : "Download local model (~470 MB)"}
                </button>
              ) : null}
              {localState === "ready" || localState === "stopped" ? (
                <button type="button" disabled={localBusy} onClick={handleStartLocal}>
                  Start local engine
                </button>
              ) : null}
              {localState === "running" ? (
                <button type="button" onClick={handleStopLocal}>Stop local engine</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {modelSource === "custom" ? (
        <div className="presentation-settings__row">
          <div>
            <h3>Custom provider (developer)</h3>
            <p>Paste a provider config (JSON). For internal testing only.</p>
            <textarea
              className="presentation-settings__textarea"
              aria-label="Provider config JSON"
              value={providerJson}
              onChange={(event) => {
                setProviderJson(event.target.value);
                setProviderSaved(false);
              }}
              placeholder='{"providers": { ... }}'
              rows={4}
            />
            <button type="button" onClick={handleSaveProvider} className="presentation-settings__action">
              {providerSaved ? "Saved. Balls won't forget." : "Save to this device"}
            </button>
          </div>
        </div>
      ) : null}

      {actionError ? <p className="presentation-settings__error">{actionError}</p> : null}
    </section>
  );
}
