import { useEffect, useState } from "react";

const VOICE_AUTH_BASE = "https://app.voice.epictechservices.com";
const CONSOLE_STORAGE_KEY = "balls.voice.consoleUrl";

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : digits.startsWith("1") ? `+${digits}` : `+${digits}`;
}

export function VoiceTab() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code" | "console">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [consoleUrl, setConsoleUrl] = useState<string | undefined>();

  useEffect(() => {
    const saved = localStorage.getItem(CONSOLE_STORAGE_KEY);
    if (saved) {
      setConsoleUrl(saved);
      setStage("console");
    }
  }, []);

  const sendCode = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`${VOICE_AUTH_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizePhone(phone) }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "The code could not be sent — try again in a minute.");
        return;
      }
      setStage("code");
    } catch {
      setError("Balls could not reach the phone system — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`${VOICE_AUTH_BASE}/auth/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizePhone(phone), code }),
      });
      const data = (await res.json()) as { ok?: boolean; token?: string; console_url?: string; error?: string };
      if (!data.ok || !data.console_url) {
        setError(data.error ?? "The code did not match — try again.");
        return;
      }
      localStorage.setItem(CONSOLE_STORAGE_KEY, data.console_url);
      setConsoleUrl(data.console_url);
      setStage("console");
    } catch {
      setError("Balls could not reach the phone system — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "console" && consoleUrl) {
    return (
      <div className="voice-tab">
        <div className="voice-tab__header">
          <span>Phone Podule</span>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(CONSOLE_STORAGE_KEY);
              setConsoleUrl(undefined);
              setStage("phone");
            }}
          >
            Disconnect
          </button>
        </div>
        <iframe src={consoleUrl} className="voice-tab__frame" title="Phone console" />
      </div>
    );
  }

  return (
    <div className="voice-tab">
      <div className="voice-tab__header">
        <span>Phone Podule</span>
      </div>
      <div className="voice-tab__body">
        <h2>{stage === "phone" ? "Your phone number" : "The code"}</h2>
        <p>
          {stage === "phone"
            ? "Balls calls you — or answers when people call your Balls number. Verify the number you want tied to this phone."
            : "Enter the code from the text — however many digits it shows."}
        </p>
        {error ? <div className="voice-tab__error">{error}</div> : null}
        {stage === "phone" ? (
          <>
            <input
              type="tel"
              inputMode="tel"
              placeholder="+1 555 123 4567"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <button type="button" disabled={busy || phone.replace(/\D/g, "").length < 10} onClick={() => void sendCode()}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <button type="button" disabled={busy || code.replace(/\D/g, "").length < 6} onClick={() => void confirmCode()}>
              {busy ? "Checking…" : "Connect"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
