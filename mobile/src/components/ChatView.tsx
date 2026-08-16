import { useEffect, useRef, useState } from "react";

import type { BallsApi } from "../lib/balls-api";
import type { ApprovalChoice, CapabilitiesResponse, RunInput } from "../lib/balls-types";
import {
  attachmentDataUrl,
  attachmentMimeType,
  validateAttachmentFile,
  type PendingAttachment,
} from "../lib/attachments";
import {
  documentSendBlockReason,
  negotiateDocumentSend,
  type AttachmentAdapterCapabilities,
  type AttachmentAdapterClient,
  type AttachmentAdapterState,
} from "../lib/attachment-adapter-client";
import { normalizeSessionMessages, type ChatMessage } from "../lib/session-store";
import { restoreEntities, substituteEntities } from "../lib/entity-sub";
import {
  initialRunState,
  reduceRunEvent,
  runStatusLabel,
  type RunEvent,
  type RunState,
} from "../lib/run-state";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import { RunActivity } from "./RunActivity";

export interface ChatViewProps {
  api: Pick<BallsApi, "startRun" | "subscribeToRun" | "stopRun" | "respondToApproval">
    & Partial<Pick<BallsApi, "getSessionMessages" | "capabilities">>;
  sessionId?: string;
  initialMessages?: ChatMessage[];
  /** Optional local document service client; see attachment-adapter-client.ts. */
  attachmentAdapter?: AttachmentAdapterClient;
}

function asRunEvent(value: unknown): RunEvent {
  if (value !== null && typeof value === "object") {
    return value as RunEvent;
  }
  return { event: "run.failed", error: "Balls returned an invalid event" };
}

function isTerminalRunEvent(event: RunEvent): boolean {
  const name = event.event ?? event.type;
  return name === "run.completed" || name === "run.failed" || name === "run.cancelled";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Balls could not complete the run";
}

function isApprovalChoice(choice: string): choice is ApprovalChoice {
  return ["once", "session", "always", "deny"].includes(choice);
}

const STOP_ATTEMPT_TIMEOUT_MS = 5_000;
type StopRunApi = Pick<BallsApi, "stopRun">;

const pendingRunCleanups = new WeakMap<object, Set<string>>();
const inFlightRunCleanups = new WeakMap<object, Set<string>>();

function cleanupSet(map: WeakMap<object, Set<string>>, api: StopRunApi): Set<string> {
  let runIds = map.get(api);
  if (!runIds) {
    runIds = new Set<string>();
    map.set(api, runIds);
  }
  return runIds;
}

function stopRunAttempt(api: StopRunApi, runId: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (success: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve(success);
    };
    const timeoutId = setTimeout(() => finish(false), STOP_ATTEMPT_TIMEOUT_MS);
    try {
      void api.stopRun(runId).then(
        () => finish(true),
        () => finish(false),
      );
    } catch {
      finish(false);
    }
  });
}

async function stopRunBestEffort(api: StopRunApi, runId: string): Promise<boolean> {
  const pending = cleanupSet(pendingRunCleanups, api);
  const inFlight = cleanupSet(inFlightRunCleanups, api);
  if (inFlight.has(runId)) {
    return false;
  }

  inFlight.add(runId);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (await stopRunAttempt(api, runId)) {
        pending.delete(runId);
        return true;
      }
    }
    pending.add(runId);
    return false;
  } finally {
    inFlight.delete(runId);
  }
}

function retryPendingRunCleanups(api: StopRunApi): void {
  const pending = pendingRunCleanups.get(api);
  if (!pending) {
    return;
  }
  for (const runId of [...pending]) {
    void stopRunBestEffort(api, runId);
  }
}

function hasRecoveredAssistantMessage(
  previousMessages: ChatMessage[],
  recoveredMessages: ChatMessage[],
  submittedInput: string,
): boolean {
  if (recoveredMessages.length <= previousMessages.length) {
    return false;
  }

  const previousPrefixMatches = previousMessages.every((message, index) => {
    const recovered = recoveredMessages[index];
    return recovered?.role === message.role && recovered.content === message.content;
  });

  if (!previousPrefixMatches) {
    return false;
  }

  const appendedMessages = recoveredMessages.slice(previousMessages.length);
  let submittedMessageIndex = -1;
  for (let index = appendedMessages.length - 1; index >= 0; index -= 1) {
    if (appendedMessages[index]?.role === "user" && appendedMessages[index]?.content === submittedInput) {
      submittedMessageIndex = index;
      break;
    }
  }
  return submittedMessageIndex >= 0 && appendedMessages[submittedMessageIndex + 1]?.role === "assistant";
}

export function ChatView({ api, sessionId, initialMessages, attachmentAdapter }: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [run, setRun] = useState<RunState>(initialRunState());
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const [error, setError] = useState<string>();
  const [approvalPending, setApprovalPending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string>();
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse>();
  const [adapterState, setAdapterState] = useState<AttachmentAdapterState>("idle");
  const [adapterCapabilities, setAdapterCapabilities] =
    useState<AttachmentAdapterCapabilities>();
  const runRef = useRef(run);
  const apiRef = useRef(api);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const startingRef = useRef(false);
  const streamGenerationRef = useRef(0);
  const activeRunIdRef = useRef<string | undefined>(undefined);
  const scrubMapRef = useRef<Map<string, string> | null>(null);
  const approvalRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  useEffect(() => {
    let active = true;
    setCapabilities(undefined);
    if (api.capabilities) {
      void api.capabilities().then(
        (value) => { if (active) setCapabilities(value); },
        () => { if (active) setCapabilities(undefined); },
      );
    }
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    let active = true;
    if (!attachmentAdapter) {
      setAdapterState("idle");
      setAdapterCapabilities(undefined);
      return;
    }
    setAdapterState("loading");
    setAdapterCapabilities(undefined);
    void attachmentAdapter.capabilities().then(
      (value) => {
        if (!active) return;
        setAdapterCapabilities(value);
        setAdapterState("ready");
      },
      () => {
        if (active) setAdapterState("unavailable");
      },
    );
    return () => { active = false; };
  }, [attachmentAdapter]);

  useEffect(() => {
    mountedRef.current = true;
    retryPendingRunCleanups(apiRef.current);
    return () => {
      mountedRef.current = false;
      const runId = activeRunIdRef.current;
      if (runId) {
        void stopRunBestEffort(apiRef.current, runId);
      }
      controllerRef.current?.abort();
      controllerRef.current = undefined;
      activeRunIdRef.current = undefined;
      approvalRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    const runId = activeRunIdRef.current;
    if (runId) {
      void stopRunBestEffort(apiRef.current, runId);
    }
    retryPendingRunCleanups(apiRef.current);
    streamGenerationRef.current += 1;
    activeRunIdRef.current = undefined;
    approvalRequestRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = undefined;
    startingRef.current = false;
    setStarting(false);
    setMessages(initialMessages ?? []);
    const nextRun = initialRunState();
    runRef.current = nextRun;
    setRun(nextRun);
    setActiveRunId(undefined);
    setError(undefined);
    setApprovalPending(false);
    setAttachments([]);
    setAttachmentError(undefined);
  }, [initialMessages, sessionId]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [error, messages.length, run.assistantText, run.status]);

  const busy = starting || activeRunId !== undefined;
  const attachmentSendError = (() => {
    if (attachments.length === 0) return undefined;
    const maxBytes = capabilities?.attachments?.max_file_bytes;
    const adapterMaxBytes = adapterCapabilities?.attachments?.max_file_bytes;
    const imageTypes = capabilities?.attachments?.image_types ?? [];
    for (const attachment of attachments) {
      const mimeType = attachmentMimeType(attachment.file);
      if (maxBytes !== undefined && attachment.file.size > maxBytes) {
        return `${attachment.file.name} exceeds the runtime attachment limit.`;
      }
      if (attachment.kind === "document") {
        if (adapterMaxBytes !== undefined && attachment.file.size > adapterMaxBytes) {
          return `${attachment.file.name} exceeds the local document service limit.`;
        }
        const negotiation = negotiateDocumentSend(adapterState, adapterCapabilities, mimeType);
        const reason = documentSendBlockReason(negotiation, attachment.file.name);
        if (reason) {
          return reason;
        }
        continue;
      }
      if (!capabilities?.features?.inline_image_input || !imageTypes.includes(mimeType)) {
        return `This Balls runtime does not advertise ${mimeType || "this image type"} input support.`;
      }
    }
    return undefined;
  })();
  const currentAttachmentError = attachmentError ?? attachmentSendError;
  const showRunStatus = busy || ["completed", "failed", "cancelled"].includes(run.status);

  const applyRunEvent = (
    event: RunEvent,
    generation = streamGenerationRef.current,
    runId?: string,
  ) => {
    if (
      generation !== streamGenerationRef.current ||
      (runId !== undefined && activeRunIdRef.current !== runId)
    ) {
      return;
    }
    setRun((current) => {
      const next = reduceRunEvent(current, event);
      runRef.current = next;
      return next;
    });
  };

  const clearActiveRun = (runId: string, generation: number): boolean => {
    if (generation !== streamGenerationRef.current || activeRunIdRef.current !== runId) {
      return false;
    }
    activeRunIdRef.current = undefined;
    approvalRequestRef.current += 1;
    setActiveRunId(undefined);
    if (mountedRef.current) {
      setApprovalPending(false);
    }
    return true;
  };

  const reconcileSessionHistory = async (
    sessionKey: string,
    previousMessages: ChatMessage[],
    submittedInput: string,
    generation: number,
    runId: string,
  ): Promise<ChatMessage[] | undefined> => {
    if (!api.getSessionMessages || activeRunIdRef.current !== runId) {
      return undefined;
    }

    try {
      const response = await api.getSessionMessages(sessionKey);
      if (
        !mountedRef.current ||
        generation !== streamGenerationRef.current ||
        activeRunIdRef.current !== runId
      ) {
        return undefined;
      }
      if (response.session_id !== sessionKey) {
        return undefined;
      }

      const recoveredMessages = normalizeSessionMessages(response.data);
      return hasRecoveredAssistantMessage(previousMessages, recoveredMessages, submittedInput)
        ? recoveredMessages
        : undefined;
    } catch {
      return undefined;
    }
  };

  const commitRecoveredMessages = (recoveredMessages: ChatMessage[]) => {
    setMessages(recoveredMessages);
    const nextRun = initialRunState();
    runRef.current = nextRun;
    setRun(nextRun);
    setError(undefined);
  };

  const send = async () => {
    const input = draft.trim();
    if (!input || busy || startingRef.current || currentAttachmentError) {
      return;
    }

    let runInput: RunInput = input;
    let attachmentIds: string[] | undefined;
    try {
      const images = attachments.filter((attachment) => attachment.kind === "image");
      if (images.length > 0) {
        runInput = [
          { type: "text", text: input },
          ...(await Promise.all(images.map(async (attachment) => ({
            type: "image_url" as const,
            image_url: {
              url: await attachmentDataUrl(attachment.file),
              detail: "auto" as const,
            },
          })))),
        ];
      }
      const documents = attachments.filter((attachment) => attachment.kind === "document");
      if (documents.length > 0) {
        if (
          !attachmentAdapter ||
          adapterState !== "ready" ||
          !adapterCapabilities?.features?.attachment_run_delivery
        ) {
          setAttachmentError(
            "The local document service is not ready to deliver documents into a Balls run. Remove the document to send this message.",
          );
          return;
        }
        const scope = sessionId ?? "mobile-unsaved-session";
        const results = await Promise.all(
          documents.map((attachment) => attachmentAdapter.intakeDocument(scope, attachment.file)),
        );
        attachmentIds = results.map((result) => result.attachment_id);
      }
    } catch (cause) {
      setAttachmentError(errorMessage(cause));
      return;
    }

    startingRef.current = true;
    setStarting(true);
    approvalRequestRef.current += 1;
    setApprovalPending(false);
    const previousMessages = [
      ...messages,
      ...(runRef.current.assistantText
        ? [
            {
              role: "assistant" as const,
              content: restoreEntities(
                runRef.current.assistantText,
                scrubMapRef.current ?? new Map(),
              ),
            },
          ]
        : []),
    ];
    setMessages((current) => [
      ...current,
      ...(runRef.current.assistantText
        ? [
            {
              role: "assistant" as const,
              content: restoreEntities(
                runRef.current.assistantText,
                scrubMapRef.current ?? new Map(),
              ),
            },
          ]
        : []),
      { role: "user", content: input },
    ]);
    setDraft("");
    setError(undefined);
    const nextRun = { ...initialRunState(), status: "running" as const };
    runRef.current = nextRun;
    setRun(nextRun);
    const controller = new AbortController();
    const generation = streamGenerationRef.current;
    controllerRef.current = controller;
    let startedRunId: string | undefined;
    let terminalEventReceived = false;

    try {
      let scrubbed: RunInput;
      if (Array.isArray(runInput)) {
        // Structured input: scrub each text part; image parts pass through.
        const map = new Map<string, string>();
        scrubbed = runInput.map((part) => {
          if (part && typeof part === "object" && "type" in part && part.type === "text") {
            const result = substituteEntities(String(part.text));
            for (const [token, original] of result.map) map.set(token, original);
            return { ...part, text: result.scrubbed };
          }
          return part;
        }) as RunInput;
        scrubMapRef.current = map;
      } else {
        const result = substituteEntities(runInput as string);
        scrubbed = result.scrubbed;
        scrubMapRef.current = result.map;
      }
      const started = await api.startRun({
        input: scrubbed,
        ...(sessionId ? { sessionId } : {}),
        ...(attachmentIds && attachmentIds.length > 0 ? { attachmentIds } : {}),
      });
      startedRunId = started.runId;
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        generation !== streamGenerationRef.current
      ) {
        await stopRunBestEffort(api, startedRunId);
        return;
      }
      activeRunIdRef.current = started.runId;
      setAttachments([]);
      setAttachmentError(undefined);
      setActiveRunId(started.runId);
      setStarting(false);
      await api.subscribeToRun(
        started.runId,
        (event) => {
          if (activeRunIdRef.current !== started.runId) {
            return;
          }
          const runEvent = asRunEvent(event);
          terminalEventReceived ||= isTerminalRunEvent(runEvent);
          applyRunEvent(runEvent, generation, started.runId);
        },
        controller.signal,
      );
      if (
        mountedRef.current &&
        generation === streamGenerationRef.current &&
        activeRunIdRef.current === startedRunId
      ) {
        if (!terminalEventReceived && startedRunId) {
          const recoveredMessages = sessionId
            ? await reconcileSessionHistory(
                sessionId,
                previousMessages,
                input,
                generation,
                startedRunId,
              )
            : undefined;
          if (
            recoveredMessages &&
            !terminalEventReceived &&
            mountedRef.current &&
            generation === streamGenerationRef.current &&
            activeRunIdRef.current === startedRunId
          ) {
            commitRecoveredMessages(recoveredMessages);
            clearActiveRun(startedRunId, generation);
          } else if (terminalEventReceived) {
            clearActiveRun(startedRunId, generation);
          } else if (
            mountedRef.current &&
            generation === streamGenerationRef.current &&
            activeRunIdRef.current === startedRunId
          ) {
            const message = `Balls accepted run ${startedRunId}, but the event stream ended before completion could be confirmed.`;
            setError(message);
            applyRunEvent({ event: "run.failed", error: message }, generation, startedRunId);
            clearActiveRun(startedRunId, generation);
          }
        } else if (startedRunId) {
          clearActiveRun(startedRunId, generation);
        }
      }
    } catch (cause) {
      if (
        mountedRef.current &&
        !controller.signal.aborted &&
        generation === streamGenerationRef.current &&
        (startedRunId === undefined || activeRunIdRef.current === startedRunId)
      ) {
        if (terminalEventReceived) {
          if (startedRunId) {
            clearActiveRun(startedRunId, generation);
          }
          return;
        }
        const recoveredMessages =
          startedRunId && sessionId
            ? await reconcileSessionHistory(
                sessionId,
                previousMessages,
                input,
                generation,
                startedRunId,
              )
            : undefined;
        if (
          recoveredMessages &&
          !terminalEventReceived &&
          mountedRef.current &&
          generation === streamGenerationRef.current &&
          activeRunIdRef.current === startedRunId
        ) {
          commitRecoveredMessages(recoveredMessages);
          if (startedRunId) {
            clearActiveRun(startedRunId, generation);
          }
        } else if (terminalEventReceived) {
          if (startedRunId) {
            clearActiveRun(startedRunId, generation);
          }
        } else if (
          mountedRef.current &&
          generation === streamGenerationRef.current &&
          (startedRunId === undefined || activeRunIdRef.current === startedRunId)
        ) {
          const message = startedRunId
            ? `Balls accepted run ${startedRunId}, but the event stream disconnected and the result could not be confirmed.`
            : errorMessage(cause);
          setError(message);
          applyRunEvent({ event: "run.failed", error: message }, generation, startedRunId);
          if (startedRunId) {
            clearActiveRun(startedRunId, generation);
          } else {
            setActiveRunId(undefined);
          }
        }
      }
    } finally {
      if (generation === streamGenerationRef.current) {
        startingRef.current = false;
        if (mountedRef.current) {
          setStarting(false);
        }
        if (controllerRef.current === controller) {
          controllerRef.current = undefined;
        }
      }
    }
  };

  const addFiles = (files: File[]) => {
    const accepted: PendingAttachment[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const validation = validateAttachmentFile(file);
      if (!validation.ok) {
        errors.push(validation.reason === "too-large"
          ? `${file.name} is larger than 10 MiB.`
          : `${file.name} is not a supported JPEG, PNG, PDF, DOC, or DOCX file.`);
        continue;
      }
      accepted.push({
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        file,
        kind: validation.kind,
      });
    }
    if (accepted.length > 0) {
      setAttachments((current) => [...current, ...accepted]);
    }
    setAttachmentError(errors.length > 0 ? errors.join(" ") : undefined);
  };

  const stop = async () => {
    const runId = activeRunIdRef.current;
    if (!runId) {
      return;
    }
    const generation = streamGenerationRef.current;
    applyRunEvent({ event: "run.stopping" }, generation, runId);
    try {
      await api.stopRun(runId);
    } catch (cause) {
      if (
        mountedRef.current &&
        generation === streamGenerationRef.current &&
        activeRunIdRef.current === runId
      ) {
        setError(errorMessage(cause));
      }
    }
  };

  const respondToApproval = async (choice: ApprovalChoice) => {
    const runId = activeRunIdRef.current;
    if (!runId || approvalPending) {
      return;
    }
    const generation = streamGenerationRef.current;
    const requestId = ++approvalRequestRef.current;
    setApprovalPending(true);
    setError(undefined);
    try {
      await api.respondToApproval(runId, { choice });
      if (
        mountedRef.current &&
        generation === streamGenerationRef.current &&
        activeRunIdRef.current === runId &&
        approvalRequestRef.current === requestId
      ) {
        applyRunEvent({ event: "approval.responded" }, generation, runId);
      }
    } catch (cause) {
      if (
        mountedRef.current &&
        generation === streamGenerationRef.current &&
        activeRunIdRef.current === runId &&
        approvalRequestRef.current === requestId
      ) {
        setError(errorMessage(cause));
      }
    } finally {
      if (
        mountedRef.current &&
        generation === streamGenerationRef.current &&
        activeRunIdRef.current === runId &&
        approvalRequestRef.current === requestId
      ) {
        setApprovalPending(false);
      }
    }
  };

  return (
    <section className="chat-view" aria-label="Balls chat">
      <div ref={transcriptRef} className="chat-transcript" role="log" aria-live="polite">
        {messages.length === 0 && !run.assistantText && !error ? (
          <div className="chat-empty-state">
            <span className="chat-empty-state__icon" aria-hidden="true">✦</span>
            <h2>Start a conversation</h2>
            <p>Ask Balls a question, request a task, or describe what you want to do.</p>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <MessageBubble key={`${message.role}-${index}`} role={message.role}>
            {message.content}
          </MessageBubble>
        ))}
        {run.assistantText ? (
          <MessageBubble role="assistant">
            {restoreEntities(run.assistantText, scrubMapRef.current ?? new Map())}
          </MessageBubble>
        ) : null}
        {showRunStatus ? (
          <p className="run-status" role="status">
            <span className="run-status__dot" aria-hidden="true" />
            {starting ? "Connecting to Balls…" : runStatusLabel(run)}
          </p>
        ) : null}
        <RunActivity state={run} />
        {run.status === "waiting_for_approval" && run.approval ? (
          <section className="approval-panel" aria-label="Approval required">
            <p>Balls is waiting for approval.</p>
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
      <Composer
        value={draft}
        busy={busy}
        onChange={setDraft}
        onSend={send}
        onStop={stop}
        attachments={attachments}
        onAddFiles={addFiles}
        onRemoveAttachment={(id) => {
          setAttachments((current) => current.filter((attachment) => attachment.id !== id));
          setAttachmentError(undefined);
        }}
        attachmentError={currentAttachmentError}
        canSend={!currentAttachmentError}
      />
    </section>
  );
}
