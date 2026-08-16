import { useCallback, useEffect, useState } from "react";

import {
  emailCredsStore,
  type EmailCreds,
} from "../lib/credentials";

/**
 * Gmail / email accounts: persists the user's Gmail address + app password
 * (IMAP/SMTP) to secure storage. The embedded runtime's gateway auto-enables
 * the vendored email platform when these creds are present on the next engine
 * start, so Gmail works with a regular app password — no OAuth setup here.
 */
export function GmailAccountsSettings() {
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    emailCredsStore
      .load()
      .then((creds) => {
        if (cancelled) return;
        if (creds) {
          setAddress(creds.address);
          // Never prefill the password back into the field; just note saved.
          setHasSaved(true);
        }
      })
      .catch(() => {
        if (!cancelled) setHasSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setError(undefined);
    const addr = address.trim();
    const pw = password.trim();
    if (!addr || !pw) {
      setError("Enter your Gmail address and an app password first.");
      return;
    }
    setBusy(true);
    try {
      const creds: EmailCreds = {
        address: addr,
        password: pw,
        imap_host: "imap.gmail.com",
        smtp_host: "smtp.gmail.com",
        allowed_users: [addr],
      };
      await emailCredsStore.save(creds);
      setHasSaved(true);
      setSaved(true);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Balls could not save your email settings.");
    } finally {
      setBusy(false);
    }
  }, [address, password]);

  const handleClear = useCallback(async () => {
    setError(undefined);
    setBusy(true);
    try {
      await emailCredsStore.clear();
      setHasSaved(false);
      setSaved(false);
      setAddress("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Balls could not clear your email settings.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="presentation-settings__section" aria-labelledby="gmail-settings-heading">
      <h3 id="gmail-settings-heading">Gmail</h3>
      <p>
        Connect your Gmail to read and send email through Balls. Use a
        Gmail app password (needs IMAP enabled) — your password stays on this
        device, encrypted.
      </p>

      {hasSaved ? (
        <div className="presentation-settings__row">
          <div>
            <h3>Connected{address ? ` — ${address}` : ""}</h3>
            <p className="presentation-settings__status">Gmail is linked to Balls.</p>
          </div>
          <button
            type="button"
            className="presentation-settings__action"
            disabled={busy}
            onClick={() => void handleClear()}
          >
            Disconnect
          </button>
        </div>
      ) : null}

      <div className="presentation-settings__row">
        <div>
          <h3>Gmail account</h3>
          <input
            type="email"
            className="presentation-settings__textarea"
            aria-label="Gmail address"
            placeholder="you@gmail.com"
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setSaved(false);
            }}
          />
          <input
            type="password"
            className="presentation-settings__textarea"
            aria-label="Gmail app password"
            placeholder="App password (16 characters)"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setSaved(false);
            }}
          />
          <button
            type="button"
            className="presentation-settings__action"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {saved ? "Saved. Balls will use Gmail." : "Save to this device"}
          </button>
          {error ? <p className="presentation-settings__error">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
