import { useEffect, useState } from "react";

import {
  getManagedRuntimeStatus,
  setManagedProviderConfig,
  startManagedRuntime,
  stopManagedRuntime,
} from "../lib/runtime/managed-runtime";

type ModelSource = "epic-cloud" | "on-device" | "custom";

export function RuntimeSettings() {
  const [running, setRunning] = useState(false);
  const [statusError, setStatusError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [modelSource, setModelSource] = useState<ModelSource>("epic-cloud");
  const [providerJson, setProviderJson] = useState("");
  const [providerSaved, setProviderSaved] = useState(false);

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

  const handleSaveProvider = async () => {
    setActionError(undefined);
    if (!providerJson.trim()) {
      setActionError("Paste the provider config JSON first.");
      return;
    }
    try {
      JSON.parse(providerJson);
    } catch {
      setActionError("That is not valid JSON.");
      return;
    }
    const result = await setManagedProviderConfig(providerJson.trim());
    if (result.stored) {
      setProviderSaved(true);
    } else {
      setActionError("Provider config could not be stored (Android app only).");
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
              {providerSaved ? "Saved" : "Save to this device"}
            </button>
          </div>
        </div>
      ) : null}

      {actionError ? <p className="presentation-settings__error">{actionError}</p> : null}
    </section>
  );
}
