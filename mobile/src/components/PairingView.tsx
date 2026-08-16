import { useState } from "react";
import type { FormEvent } from "react";

import { normalizeApiKey } from "../lib/credentials";

interface PairingViewProps {
  apiUrl: string;
  onPair: (apiKey: string) => Promise<void>;
}

export function PairingView({ apiUrl, onPair }: PairingViewProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const apiKey = normalizeApiKey(value);
    if (!apiKey) {
      setError("Enter the API server key from your Termux AI instance.");
      return;
    }

    setError(undefined);
    setSubmitting(true);
    try {
      await onPair(apiKey);
      setValue("");
    } catch (pairingError) {
      setError(pairingError instanceof Error ? pairingError.message : "Pairing failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="connection-card pairing-card">
      <h2>Pair with Balls</h2>
      <p>
        Enter the local API server key configured in Termux. The key is stored in Android Keystore
        and is never displayed after pairing.
      </p>
      <p className="muted">Endpoint: {apiUrl}</p>
      <form className="pairing-form" onSubmit={handleSubmit}>
        <label htmlFor="api-server-key">API server key</label>
        <input
          id="api-server-key"
          name="api-server-key"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={submitting}
        />
        {error ? <p className="pairing-form__error" role="alert">{error}</p> : null}
        <button type="submit" disabled={submitting || !value.trim()}>
          {submitting ? "Pairing…" : "Pair"}
        </button>
      </form>
    </section>
  );
}
