import { useState } from "react";

import type { LifecycleAction } from "../lib/lifecycle-actions";

interface LifecycleControlsProps {
  onAction: (action: LifecycleAction) => Promise<unknown>;
}

const controls: Array<{ action: LifecycleAction; label: string }> = [
  { action: "start", label: "Start Hermes" },
  { action: "stop", label: "Stop Hermes" },
  { action: "restart", label: "Restart Hermes" },
  { action: "doctor", label: "Run doctor" },
  { action: "update", label: "Update Hermes" },
];

function actionNoun(action: LifecycleAction): string {
  return action === "doctor" ? "Doctor" : action[0].toUpperCase() + action.slice(1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The Termux lifecycle request failed";
}

export function LifecycleControls({ onAction }: LifecycleControlsProps) {
  const [pendingAction, setPendingAction] = useState<LifecycleAction>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const requestAction = async (action: LifecycleAction) => {
    setPendingAction(action);
    setMessage(undefined);
    setError(undefined);
    try {
      await onAction(action);
      setMessage(`${actionNoun(action)} requested`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingAction(undefined);
    }
  };

  return (
    <section className="lifecycle-controls" aria-label="Termux lifecycle controls">
      <div>
        <h3>Termux controls</h3>
        <p className="muted">Fixed actions only; chat text never reaches Termux commands.</p>
      </div>
      <div className="lifecycle-controls__actions">
        {controls.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            disabled={pendingAction !== undefined}
            onClick={() => void requestAction(action)}
          >
            {pendingAction === action ? "Working…" : label}
          </button>
        ))}
      </div>
      {message ? <p className="lifecycle-controls__status" role="status">{message}</p> : null}
      {error ? <p className="lifecycle-controls__error" role="alert">{error}</p> : null}
    </section>
  );
}
