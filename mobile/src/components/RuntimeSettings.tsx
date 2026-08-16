import { useEffect, useState } from "react";

import type { RuntimeKind } from "../lib/runtime/create-runtime-client";
import {
  getManagedRuntimeStatus,
  setManagedProviderConfig,
  startManagedRuntime,
  stopManagedRuntime,
} from "../lib/runtime/managed-runtime";

export interface RuntimeSettingsProps {
  kind: RuntimeKind;
  onKindChange: (kind: RuntimeKind) => void;
}

export function RuntimeSettings({ kind, onKindChange }: RuntimeSettingsProps) {
  const [running, setRunning] = useState(false);
  const [statusError, setStatusError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [providerJson, setProviderJson] = useState("");
  const [providerSaved, setProviderSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (kind !== "managed") {
      setRunning(false);
      setStatusError(undefined);
      return;
    }
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
  }, [kind]);

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
      <h3 id="runtime-settings-heading">Runtime</h3>
      <p>Which local AI engine powers this workspace.</p>
      <div className="presentation-settings__themes" role="group" aria-label="Runtime mode">
        <button
          type="button"
          aria-pressed={kind === "termux"}
          className={kind === "termux" ? "is-selected" : undefined}
          onClick={() => onKindChange("termux")}
        >
          Termux (advanced)
        </button>
        <button
          type="button"
          aria-pressed={kind === "managed"}
          className={kind === "managed" ? "is-selected" : undefined}
          onClick={() => onKindChange("managed")}
        >
          Embedded (Balls)
        </button>
      </div>

      {kind === "managed" ? (
        <div className="presentation-settings__row">
          <div>
            <h3>Embedded runtime</h3>
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
      ) : null}

      {kind === "managed" ? (
        <div className="presentation-settings__row">
          <div>
            <h3>Provider config</h3>
            <p>Paste the Hermes providers block (JSON) so the embedded engine can reach a model provider.</p>
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
