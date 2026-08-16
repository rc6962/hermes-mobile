import { useState } from "react";

import type { PendingAttachment } from "../lib/attachments";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike[];
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultLike;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
}
interface SpeechRecognitionCtorLike {
  new (): SpeechRecognitionLike;
}

interface ComposerProps {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  attachments?: PendingAttachment[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  attachmentError?: string;
  canSend?: boolean;
}

export function Composer({
  value,
  busy,
  onChange,
  onSend,
  onStop,
  attachments = [],
  onAddFiles = () => undefined,
  onRemoveAttachment = () => undefined,
  attachmentError,
  canSend = true,
}: ComposerProps) {
  const [listening, setListening] = useState(false);

  const toggleSpeech = () => {
    const SR =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtorLike })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtorLike })
        .webkitSpeechRecognition;
    if (!SR) {
      return;
    }
    if (listening) {
      setListening(false);
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript) {
        onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${transcript}`);
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <label htmlFor="balls-message">Message</label>
      <textarea
        id="balls-message"
        name="message"
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder="Ask Balls anything…"
        aria-label="Message"
        enterKeyHint="send"
        disabled={busy}
        onPaste={(event) => {
          const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
            file.type.startsWith("image/"),
          );
          if (files.length > 0) {
            event.preventDefault();
            onAddFiles(files);
          }
        }}
      />
      {attachments.length > 0 ? (
        <ul className="composer__attachments" aria-label="Attachments">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <span>
                <strong>{attachment.file.name}</strong>
                <small>
                  {attachment.kind} · {attachment.file.type || "type from extension"} ·{" "}
                  {attachment.file.size} bytes
                </small>
              </span>
              <button
                type="button"
                aria-label={`Remove ${attachment.file.name}`}
                onClick={() => onRemoveAttachment(attachment.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {attachmentError ? (
        <p className="composer__attachment-error" role="alert">{attachmentError}</p>
      ) : null}
      <div className="composer__footer">
        <span>Enter to send · Shift+Enter for a new line</span>
        <div className="composer__actions">
          <label
            className="composer__add"
            aria-label="Add attachment"
            role="button"
            tabIndex={busy ? -1 : 0}
          >
            <span aria-hidden="true">+</span>
            <input
              type="file"
              aria-label="Choose attachments"
              accept="image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.jpg,.jpeg,.png,.pdf,.doc,.docx"
              multiple
              disabled={busy}
              onChange={(event) => {
                onAddFiles([...(event.target.files ?? [])]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className={`composer__mic${listening ? " is-listening" : ""}`}
            aria-label={listening ? "Stop voice input" : "Voice input"}
            aria-pressed={listening}
            disabled={busy}
            onClick={toggleSpeech}
          >
            {listening ? "◉" : "🎙"}
          </button>
          <button type="submit" disabled={busy || value.trim().length === 0 || !canSend}>
            Send
          </button>
          {busy ? (
            <button type="button" onClick={onStop}>
              Stop
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
