interface ComposerProps {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export function Composer({ value, busy, onChange, onSend, onStop }: ComposerProps) {
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <label htmlFor="hermes-message">Message</label>
      <textarea
        id="hermes-message"
        name="message"
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask Hermes anything…"
        disabled={busy}
      />
      <div className="composer__actions">
        <button type="submit" disabled={busy || value.trim().length === 0}>
          Send
        </button>
        {busy ? (
          <button type="button" onClick={onStop}>
            Stop
          </button>
        ) : null}
      </div>
    </form>
  );
}
