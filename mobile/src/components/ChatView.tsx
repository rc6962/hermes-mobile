import { useEffect, useRef, useState } from "react";

import type { HermesApi } from "../lib/hermes-api";
import type { ApprovalChoice } from "../lib/hermes-types";
import type { ChatMessage } from "../lib/session-store";
import {
  initialRunState,
  reduceRunEvent,
  type RunEvent,
  type RunState,
} from "../lib/run-state";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import { RunActivity } from "./RunActivity";

export interface ChatViewProps {
  api: Pick<HermesApi, "startRun" | "subscribeToRun" | "stopRun" | "respondToApproval">;
  sessionId?: string;
  initialMessages?: ChatMessage[];
}

function asRunEvent(value: unknown): RunEvent {
  if (value !== null && typeof value === "object") {
    return value as RunEvent;
  }
  return { event: "run.failed", error: "Hermes returned an invalid event" };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Hermes could not complete the run";
}

function isApprovalChoice(choice: string): choice is ApprovalChoice {
  return ["once", "session", "always", "deny"].includes(choice);
}

export function ChatView({ api, sessionId, initialMessages }: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [run, setRun] = useState<RunState>(initialRunState());
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const [error, setError] = useState<string>();
  const [approvalPending, setApprovalPending] = useState(false);
  const [starting, setStarting] = useState(false);
  const runRef = useRef(run);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    if (initialMessages === undefined) {
      return;
    }
    controllerRef.current?.abort();
    controllerRef.current = undefined;
    startingRef.current = false;
    setStarting(false);
    setMessages(initialMessages);
    const nextRun = initialRunState();
    runRef.current = nextRun;
    setRun(nextRun);
    setActiveRunId(undefined);
    setError(undefined);
    setApprovalPending(false);
  }, [initialMessages, sessionId]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [error, messages.length, run.assistantText, run.status]);

  const busy = starting || activeRunId !== undefined;

  const applyRunEvent = (event: RunEvent) => {
    setRun((current) => {
      const next = reduceRunEvent(current, event);
      runRef.current = next;
      return next;
    });
  };

  const send = async () => {
    const input = draft.trim();
    if (!input || busy || startingRef.current) {
      return;
    }

    startingRef.current = true;
    setStarting(true);
    setMessages((current) => [
      ...current,
      ...(runRef.current.assistantText
        ? [{ role: "assistant" as const, content: runRef.current.assistantText }]
        : []),
      { role: "user", content: input },
    ]);
    setDraft("");
    setError(undefined);
    const nextRun = { ...initialRunState(), status: "running" as const };
    runRef.current = nextRun;
    setRun(nextRun);
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const started = await api.startRun({
        input,
        ...(sessionId ? { sessionId } : {}),
      });
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }
      setActiveRunId(started.runId);
      await api.subscribeToRun(
        started.runId,
        (event) => applyRunEvent(asRunEvent(event)),
        controller.signal,
      );
      if (mountedRef.current) {
        setActiveRunId(undefined);
      }
    } catch (cause) {
      if (mountedRef.current && !controller.signal.aborted) {
        setActiveRunId(undefined);
        setError(errorMessage(cause));
        applyRunEvent({ event: "run.failed", error: errorMessage(cause) });
      }
    } finally {
      startingRef.current = false;
      if (mountedRef.current) {
        setStarting(false);
      }
      if (controllerRef.current === controller) {
        controllerRef.current = undefined;
      }
    }
  };

  const stop = async () => {
    if (!activeRunId) {
      return;
    }
    applyRunEvent({ event: "run.stopping" });
    try {
      await api.stopRun(activeRunId);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const respondToApproval = async (choice: ApprovalChoice) => {
    if (!activeRunId || approvalPending) {
      return;
    }
    setApprovalPending(true);
    setError(undefined);
    try {
      await api.respondToApproval(activeRunId, { choice });
      applyRunEvent({ event: "approval.responded" });
    } catch (cause) {
      if (mountedRef.current) {
        setError(errorMessage(cause));
      }
    } finally {
      if (mountedRef.current) {
        setApprovalPending(false);
      }
    }
  };

  return (
    <section className="chat-view" aria-label="Hermes chat">
      <div ref={transcriptRef} className="chat-transcript" role="log" aria-live="polite">
        {messages.length === 0 && !run.assistantText && !error ? (
          <div className="chat-empty-state">
            <span className="chat-empty-state__icon" aria-hidden="true">✦</span>
            <h2>Start a conversation</h2>
            <p>Ask Hermes a question, request a task, or describe what you want to do.</p>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <MessageBubble key={`${message.role}-${index}`} role={message.role}>
            {message.content}
          </MessageBubble>
        ))}
        {run.assistantText ? <MessageBubble role="assistant">{run.assistantText}</MessageBubble> : null}
        {busy ? (
          <p className="run-status" role="status">
            <span className="run-status__dot" aria-hidden="true" />
            {starting ? "Connecting to Hermes…" : run.status === "waiting_for_approval" ? "Waiting for approval…" : "Hermes is working…"}
          </p>
        ) : null}
        <RunActivity state={run} />
        {run.status === "waiting_for_approval" && run.approval ? (
          <section className="approval-panel" aria-label="Approval required">
            <p>Hermes is waiting for approval.</p>
            {run.approval.command ? <code>{run.approval.command}</code> : null}
            <div className="approval-panel__choices">
              {run.approval.choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  disabled={approvalPending || !isApprovalChoice(choice)}
                  onClick={() => {
                    if (isApprovalChoice(choice)) {
                      void respondToApproval(choice);
                    }
                  }}
                >
                  {choice}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {error ? <p role="alert" className="chat-error">{error}</p> : null}
      </div>
      <Composer value={draft} busy={busy} onChange={setDraft} onSend={send} onStop={stop} />
    </section>
  );
}
