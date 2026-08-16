import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChatView } from "../ChatView";
import type { BallsApi } from "../../lib/balls-api";
import type {
  AttachmentAdapterCapabilities,
  AttachmentAdapterClient,
} from "../../lib/attachment-adapter-client";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const adapterIntakeOnlyCapabilities: AttachmentAdapterCapabilities = {
  object: "balls.attachment_adapter.capabilities",
  adapter_version: "1.0",
  auth: { type: "bearer", required: true },
  features: {
    inline_image_input: false,
    local_document_ingestion: true,
    attachment_run_delivery: false,
  },
  attachments: {
    image_types: ["image/jpeg", "image/png"],
    document_types: ["application/pdf", "application/msword", DOCX_MIME],
    document_intake: {
      "application/pdf": true,
      "application/msword": false,
      [DOCX_MIME]: true,
    },
    max_file_bytes: 10 * 1024 * 1024,
    max_document_text_chars: 100_000,
  },
};

const adapterDeliveryCapabilities: AttachmentAdapterCapabilities = {
  ...adapterIntakeOnlyCapabilities,
  features: {
    ...adapterIntakeOnlyCapabilities.features,
    attachment_run_delivery: true,
  },
};

function makeAdapter(
  overrides: Partial<AttachmentAdapterClient> = {},
): AttachmentAdapterClient {
  return {
    capabilities: vi.fn(async () => adapterIntakeOnlyCapabilities),
    intakeDocument: vi.fn(async (_runId: string, file: File) => ({
      object: "balls.attachment",
      attachment_id: "att_local_test",
      name: file.name,
      mime_type: file.type,
      text_chars: 12,
      sections: 1,
      truncated: false,
      delivery: "run_delivery",
    })),
    ...overrides,
  } as AttachmentAdapterClient;
}

function makeApi(
  overrides: Partial<Pick<BallsApi, "startRun" | "subscribeToRun" | "stopRun" | "respondToApproval" | "getSessionMessages" | "capabilities">> = {},
) {
  return {
    startRun: vi.fn(async () => ({ runId: "run-1", status: "started" })),
    subscribeToRun: vi.fn(async (_runId: string, onEvent: (event: Record<string, unknown>) => void) => {
      onEvent({ event: "message.delta", delta: "Hello Balls" });
      onEvent({ event: "run.completed", output: "Hello Balls" });
    }),
    stopRun: vi.fn(async () => ({ run_id: "run-1", status: "stopping" })),
    respondToApproval: vi.fn(async () => ({ run_id: "run-1", status: "accepted" })),
    getSessionMessages: vi.fn(async () => ({
      object: "list",
      session_id: "session-1",
      data: [],
    })),
    capabilities: vi.fn(async () => ({
      features: { inline_image_input: true, local_document_ingestion: true },
      attachments: {
        image_types: ["image/jpeg", "image/png"],
        document_types: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        max_file_bytes: 10 * 1024 * 1024,
      },
    })),
    ...overrides,
  } as unknown as Pick<BallsApi, "startRun" | "subscribeToRun" | "stopRun" | "respondToApproval" | "getSessionMessages" | "capabilities">;
}

describe("ChatView", () => {
  it("submits a prompt and renders the streamed assistant answer", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<ChatView api={api} />);

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Say hello");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(api.startRun).toHaveBeenCalledWith({ input: "Say hello" });
      expect(screen.getByText("Hello Balls")).toBeInTheDocument();
    });
    expect(screen.getByText("Say hello")).toBeInTheDocument();
  });

  it("scrubs entities before egress and restores them in the reply", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(async (_runId: string, onEvent: (event: Record<string, unknown>) => void) => {
        const sentInput = (api.startRun as ReturnType<typeof vi.fn>).mock.calls[0][0].input as string;
        const token = sentInput.match(/[A-Z2-9]{5}/)?.[0];
        onEvent({ event: "message.delta", delta: `Reply to ${token}` });
        onEvent({ event: "run.completed", output: `Reply to ${token}` });
      }),
    });
    render(<ChatView api={api} />);

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Email me at alice@example.com");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      const sent = (api.startRun as ReturnType<typeof vi.fn>).mock.calls[0][0].input as string;
      expect(sent).not.toContain("alice@example.com");
      expect(sent).toContain("Email me at ");
      expect(sent.match(/[A-Z2-9]{5}$/)?.[0]).toBeDefined();
    });
    // The displayed reply has the original entity restored.
    await screen.findByText("Reply to alice@example.com");
  });

  it("keeps the completion status visible after the stream ends", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<ChatView api={api} />);

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Finish this run");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Hello Balls");
    expect(screen.getByRole("status")).toHaveTextContent("Balls completed the run.");
  });

  it("shows thinking state after Balls accepts the run", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(() => new Promise<void>(() => undefined)),
    });
    render(<ChatView api={api} />);

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Accepted run");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Balls is thinking…");
    expect(screen.getByRole("status")).toHaveTextContent("Balls is thinking…");
    expect(screen.queryByText("Balls is working…")).not.toBeInTheDocument();
  });

  it("sends a prompt with Enter from the composer", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<ChatView api={api} />);

    const input = screen.getByRole("textbox", { name: /message/i });
    await user.type(input, "Enter send");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(api.startRun).toHaveBeenCalledWith({ input: "Enter send" }));
  });

  it("does not create a second run while the first run is being created", async () => {
    const user = userEvent.setup();
    let releaseStart: ((value: { runId: string; status: string }) => void) | undefined;
    const firstStart = new Promise<{ runId: string; status: string }>((resolve) => {
      releaseStart = resolve;
    });
    const api = makeApi({
      startRun: vi.fn().mockImplementationOnce(() => firstStart).mockResolvedValue({
        runId: "run-2",
        status: "started",
      }),
    });
    render(<ChatView api={api} />);

    const input = screen.getByRole("textbox", { name: /message/i });
    const send = screen.getByRole("button", { name: /send/i });
    await user.type(input, "First task");
    await user.click(send);
    await user.type(input, "Second task");
    await user.click(send);

    expect(api.startRun).toHaveBeenCalledTimes(1);
    releaseStart?.({ runId: "run-1", status: "started" });
  });

  it("stops an active run and prevents duplicate sends", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(() => new Promise<void>(() => undefined)),
    });
    render(<ChatView api={api} />);

    const input = screen.getByRole("textbox", { name: /message/i });
    await user.type(input, "Long task");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByRole("button", { name: /stop/i });

    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /stop/i }));
    expect(api.stopRun).toHaveBeenCalledWith("run-1");
  });

  it("aborts the SSE subscription when the chat unmounts", async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    const api = makeApi({
      subscribeToRun: vi.fn(
        (_runId: string, _onEvent: (event: Record<string, unknown>) => void, runSignal?: AbortSignal) => {
          signal = runSignal;
          return new Promise<void>((resolve) => {
            runSignal?.addEventListener("abort", () => resolve(), { once: true });
          });
        },
      ),
    });
    const view = render(<ChatView api={api} />);

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Unmount me");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(signal).toBeDefined());

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("retries unresolved stop cleanup when the chat mounts again", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(
        (_runId: string, _onEvent: (event: Record<string, unknown>) => void, runSignal?: AbortSignal) =>
          new Promise<void>((resolve) => {
            runSignal?.addEventListener("abort", () => resolve(), { once: true });
          }),
      ),
      stopRun: vi.fn()
        .mockRejectedValueOnce(new Error("cleanup failure one"))
        .mockRejectedValueOnce(new Error("cleanup failure two"))
        .mockResolvedValue({ run_id: "run-1", status: "stopping" }),
    });
    const view = render(<ChatView api={api} />);

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Persist cleanup");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByRole("button", { name: /stop/i });
    view.unmount();

    await waitFor(() => expect(api.stopRun).toHaveBeenCalledTimes(2));
    render(<ChatView api={api} />);
    await waitFor(() => expect(api.stopRun).toHaveBeenCalledTimes(3));
    expect(api.stopRun).toHaveBeenLastCalledWith("run-1");
  });

  it("stops a run accepted after the selected session changes", async () => {
    const user = userEvent.setup();
    let releaseStart: ((value: { runId: string; status: string }) => void) | undefined;
    const pendingStart = new Promise<{ runId: string; status: string }>((resolve) => {
      releaseStart = resolve;
    });
    const api = makeApi({
      startRun: vi.fn(() => pendingStart),
      subscribeToRun: vi.fn(async () => undefined),
      stopRun: vi.fn()
        .mockRejectedValueOnce(new Error("temporary stop failure"))
        .mockResolvedValue({ run_id: "orphaned-run", status: "stopping" }),
    });
    const view = render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[{ role: "user", content: "First history" }]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "First prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(api.startRun).toHaveBeenCalledWith({
      input: "First prompt",
      sessionId: "session-1",
    }));

    view.rerender(
      <ChatView
        api={api}
        sessionId="session-2"
        initialMessages={[{ role: "user", content: "Second history" }]}
      />,
    );
    await waitFor(() => expect(screen.getByText("Second history")).toBeInTheDocument());

    await act(async () => {
      releaseStart?.({ runId: "orphaned-run", status: "started" });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(api.stopRun).toHaveBeenCalledWith("orphaned-run");
      expect(api.stopRun).toHaveBeenCalledTimes(2);
    });
  });

  it("stops an active backend run when the selected session changes", async () => {
    const user = userEvent.setup();
    let firstSignal: AbortSignal | undefined;
    const api = makeApi({
      subscribeToRun: vi.fn(
        async (
          _runId: string,
          _onEvent: (event: Record<string, unknown>) => void,
          signal?: AbortSignal,
        ) => {
          firstSignal = signal;
          return new Promise<void>((resolve) => {
            signal?.addEventListener("abort", () => resolve(), { once: true });
          });
        },
      ),
      stopRun: vi.fn()
        .mockRejectedValueOnce(new Error("temporary stop failure"))
        .mockResolvedValue({ run_id: "run-1", status: "stopping" }),
    });
    const view = render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Active prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(firstSignal).toBeDefined());

    view.rerender(
      <ChatView
        api={api}
        sessionId="session-2"
        initialMessages={[]}
      />,
    );

    await waitFor(() => {
      expect(firstSignal?.aborted).toBe(true);
      expect(api.stopRun).toHaveBeenCalledWith("run-1");
      expect(api.stopRun).toHaveBeenCalledTimes(2);
    });
  });

  it("does not show a stop error from the previous session", async () => {
    const user = userEvent.setup();
    let rejectStop: ((error: Error) => void) | undefined;
    const pendingStop = new Promise<{ run_id: string; status: string }>((_, reject) => {
      rejectStop = reject;
    });
    const api = makeApi({
      subscribeToRun: vi.fn(async () => new Promise<void>(() => undefined)),
      stopRun: vi.fn(() => pendingStop),
    });
    const view = render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[{ role: "user", content: "First history" }]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "First prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await user.click(await screen.findByRole("button", { name: /stop/i }));
    await waitFor(() => expect(api.stopRun).toHaveBeenCalledWith("run-1"));

    view.rerender(
      <ChatView
        api={api}
        sessionId="session-2"
        initialMessages={[{ role: "user", content: "Second history" }]}
      />,
    );
    await waitFor(() => expect(screen.getByText("Second history")).toBeInTheDocument());

    await act(async () => {
      rejectStop?.(new Error("stale stop failed"));
      await pendingStop.catch(() => undefined);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show a stop error after a newer run starts in the same session", async () => {
    const user = userEvent.setup();
    let releaseFirstStream: (() => void) | undefined;
    let rejectFirstStop: ((error: Error) => void) | undefined;
    const pendingFirstStop = new Promise<{ run_id: string; status: string }>((_, reject) => {
      rejectFirstStop = reject;
    });
    let startCount = 0;
    const api = makeApi({
      startRun: vi.fn(async () => ({
        runId: startCount++ === 0 ? "run-1" : "run-2",
        status: "started",
      })),
      subscribeToRun: vi.fn(
        (runId: string, onEvent: (event: Record<string, unknown>) => void) => {
          if (runId === "run-1") {
            return new Promise<void>((resolve) => {
              releaseFirstStream = () => {
                onEvent({ event: "run.cancelled" });
                resolve();
              };
            });
          }
          return new Promise<void>(() => undefined);
        },
      ),
      stopRun: vi.fn((runId: string) =>
        runId === "run-1"
          ? pendingFirstStop
          : Promise.resolve({ run_id: runId, status: "stopping" }),
      ),
    });
    render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "First prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await user.click(await screen.findByRole("button", { name: /stop/i }));
    await waitFor(() => expect(api.stopRun).toHaveBeenCalledWith("run-1"));

    await act(async () => {
      releaseFirstStream?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole("textbox", { name: /message/i })).not.toBeDisabled());

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Second prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(api.startRun).toHaveBeenCalledWith({
      input: "Second prompt",
      sessionId: "session-1",
    }));

    await act(async () => {
      rejectFirstStop?.(new Error("stale stop failed"));
      await pendingFirstStop.catch(() => undefined);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps a confirmed terminal result when the stream rejects afterward", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(async (_runId: string, onEvent: (event: Record<string, unknown>) => void) => {
        onEvent({ event: "run.completed", output: "Confirmed result" });
        throw new Error("late parser failure");
      }),
    });
    render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Confirmed prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByText("Confirmed result")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show an approval error from the previous session", async () => {
    const user = userEvent.setup();
    let rejectApproval: ((error: Error) => void) | undefined;
    const pendingApproval = new Promise<{ run_id: string; choice: "once"; status: string }>((_, reject) => {
      rejectApproval = reject;
    });
    const api = makeApi({
      subscribeToRun: vi.fn(async (_runId: string, onEvent: (event: Record<string, unknown>) => void) => {
        onEvent({ event: "approval.request", choices: ["once"] });
        return new Promise<void>(() => undefined);
      }),
      respondToApproval: vi.fn(() => pendingApproval),
    });
    const view = render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[{ role: "user", content: "First history" }]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "First prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await user.click(await screen.findByRole("button", { name: "once" }));
    await waitFor(() => expect(api.respondToApproval).toHaveBeenCalledWith("run-1", { choice: "once" }));

    view.rerender(
      <ChatView
        api={api}
        sessionId="session-2"
        initialMessages={[{ role: "user", content: "Second history" }]}
      />,
    );
    await waitFor(() => expect(screen.getByText("Second history")).toBeInTheDocument());

    await act(async () => {
      rejectApproval?.(new Error("stale approval failed"));
      await pendingApproval.catch(() => undefined);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not let an approval response from an older run alter a newer run", async () => {
    const user = userEvent.setup();
    let releaseFirstStream: (() => void) | undefined;
    let resolveFirstApproval: ((value: { run_id: string; choice: "once"; status: string }) => void) | undefined;
    const pendingFirstApproval = new Promise<{ run_id: string; choice: "once"; status: string }>((resolve) => {
      resolveFirstApproval = resolve;
    });
    let startCount = 0;
    const api = makeApi({
      startRun: vi.fn(async () => ({
        runId: startCount++ === 0 ? "run-1" : "run-2",
        status: "started",
      })),
      subscribeToRun: vi.fn(
        (runId: string, onEvent: (event: Record<string, unknown>) => void) => {
          if (runId === "run-1") {
            onEvent({ event: "approval.request", choices: ["once"] });
            return new Promise<void>((resolve) => {
              releaseFirstStream = () => {
                onEvent({ event: "run.completed", output: "First result" });
                resolve();
              };
            });
          }
          onEvent({ event: "approval.request", choices: ["once"] });
          return new Promise<void>(() => undefined);
        },
      ),
      respondToApproval: vi.fn(() => pendingFirstApproval),
    });
    render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "First prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await user.click(await screen.findByRole("button", { name: "once" }));
    await waitFor(() => expect(api.respondToApproval).toHaveBeenCalledWith("run-1", { choice: "once" }));

    await act(async () => {
      releaseFirstStream?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole("textbox", { name: /message/i })).not.toBeDisabled());

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Second prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));
    const secondApproval = await screen.findByRole("region", { name: /approval required/i });
    expect(secondApproval).toBeInTheDocument();

    await act(async () => {
      resolveFirstApproval?.({ run_id: "run-1", choice: "once", status: "accepted" });
      await pendingFirstApproval;
    });

    expect(screen.getByRole("region", { name: /approval required/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "once" })).not.toBeDisabled();
  });

  it("ignores late events from the previous session after switching chats", async () => {
    const user = userEvent.setup();
    let firstEmit: ((event: Record<string, unknown>) => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    const api = makeApi({
      startRun: vi.fn(async ({ sessionId }: { input: string; sessionId?: string }) => ({
        runId: sessionId === "session-1" ? "run-1" : "run-2",
        status: "started",
      })),
      subscribeToRun: vi.fn(
        (
          runId: string,
          onEvent: (event: Record<string, unknown>) => void,
          runSignal?: AbortSignal,
        ) => {
          if (runId === "run-1") {
            firstEmit = onEvent;
            firstSignal = runSignal;
            return new Promise<void>((resolve) => {
              runSignal?.addEventListener("abort", () => resolve(), { once: true });
            });
          }
          onEvent({ event: "run.completed", output: "Current session result" });
          return Promise.resolve();
        },
      ),
    });
    const view = render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[{ role: "user", content: "First history" }]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "First prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(firstEmit).toBeDefined());

    view.rerender(
      <ChatView
        api={api}
        sessionId="session-2"
        initialMessages={[{ role: "user", content: "Second history" }]}
      />,
    );
    await waitFor(() => expect(firstSignal?.aborted).toBe(true));

    await act(async () => {
      firstEmit?.({ event: "message.delta", delta: "Stale first-session output" });
      await Promise.resolve();
    });

    expect(screen.queryByText("Stale first-session output")).not.toBeInTheDocument();
    expect(screen.getByText("Second history")).toBeInTheDocument();
  });

  it("invalidates a stream when the session changes without initial messages", async () => {
    const user = userEvent.setup();
    let firstEmit: ((event: Record<string, unknown>) => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    const api = makeApi({
      subscribeToRun: vi.fn(
        (
          _runId: string,
          onEvent: (event: Record<string, unknown>) => void,
          signal?: AbortSignal,
        ) => {
          firstEmit = onEvent;
          firstSignal = signal;
          return new Promise<void>((resolve) => {
            signal?.addEventListener("abort", () => resolve(), { once: true });
          });
        },
      ),
    });
    const view = render(<ChatView api={api} sessionId="session-1" />);

    await user.type(screen.getByRole("textbox", { name: /message/i }), "First prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(firstEmit).toBeDefined());

    view.rerender(<ChatView api={api} sessionId="session-2" />);
    await waitFor(() => expect(firstSignal?.aborted).toBe(true));

    await act(async () => {
      firstEmit?.({ event: "message.delta", delta: "Stale output" });
      await Promise.resolve();
    });

    expect(screen.queryByText("Stale output")).not.toBeInTheDocument();
  });

  it("recovers a completed run from session history after the event stream drops", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
      getSessionMessages: vi.fn(async () => ({
        object: "list",
        session_id: "session-1",
        data: [
          { role: "user", content: "Recover this" },
          { role: "assistant", content: "Recovered answer" },
        ],
      })),
    });
    render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Recover this");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(api.getSessionMessages).toHaveBeenCalledWith("session-1");
      expect(screen.getByText("Recovered answer")).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reconciles session history when the event stream ends without a terminal event", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(async () => undefined),
      getSessionMessages: vi.fn(async () => ({
        object: "list",
        session_id: "session-1",
        data: [
          { role: "user", content: "Clean EOF" },
          { role: "assistant", content: "Recovered after clean EOF" },
        ],
      })),
    });
    render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Clean EOF");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(api.getSessionMessages).toHaveBeenCalledWith("session-1");
      expect(screen.getByText("Recovered after clean EOF")).toBeInTheDocument();
    });
  });

  it("does not overwrite a terminal event that arrives during history reconciliation", async () => {
    const user = userEvent.setup();
    let emit: ((event: Record<string, unknown>) => void) | undefined;
    let resolveHistory: ((value: {
      object: string;
      session_id: string;
      data: Array<{ role: string; content: string }>;
    }) => void) | undefined;
    const pendingHistory = new Promise<{
      object: string;
      session_id: string;
      data: Array<{ role: string; content: string }>;
    }>((resolve) => {
      resolveHistory = resolve;
    });
    const api = makeApi({
      subscribeToRun: vi.fn(async (_runId: string, onEvent: (event: Record<string, unknown>) => void) => {
        emit = onEvent;
      }),
      getSessionMessages: vi.fn(() => pendingHistory),
    });
    render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Late terminal");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(api.getSessionMessages).toHaveBeenCalledWith("session-1"));

    await act(async () => {
      emit?.({ event: "run.completed", output: "Late terminal result" });
      resolveHistory?.({
        object: "list",
        session_id: "session-1",
        data: [
          { role: "user", content: "Late terminal" },
          { role: "assistant", content: "Stale reconciliation result" },
        ],
      });
      await pendingHistory;
    });

    await waitFor(() => expect(screen.getByText("Late terminal result")).toBeInTheDocument());
    expect(screen.queryByText("Stale reconciliation result")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports an unconfirmed run when clean EOF has no selected session", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(async () => undefined),
    });
    render(<ChatView api={api} />);

    await user.type(screen.getByRole("textbox", { name: /message/i }), "No session");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/ended before completion could be confirmed/i);
    });
  });

  it("does not treat an unrelated assistant message as the current run result", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
      getSessionMessages: vi.fn(async () => ({
        object: "list",
        session_id: "session-1",
        data: [
          { role: "user", content: "Existing history" },
          { role: "assistant", content: "Unrelated concurrent answer" },
        ],
      })),
    });
    render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[{ role: "user", content: "Existing history" }]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Current prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/accepted run run-1/i);
    });
  });

  it("does not recover an assistant response after an intervening user turn", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
      getSessionMessages: vi.fn(async () => ({
        object: "list",
        session_id: "session-1",
        data: [
          { role: "user", content: "Current prompt" },
          { role: "user", content: "Concurrent prompt" },
          { role: "assistant", content: "Concurrent answer" },
        ],
      })),
    });
    render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Current prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/accepted run run-1/i);
    });
    expect(screen.queryByText("Concurrent answer")).not.toBeInTheDocument();
  });

  it("does not recover history returned for a different session", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      subscribeToRun: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
      getSessionMessages: vi.fn(async () => ({
        object: "list",
        session_id: "session-2",
        data: [
          { role: "user", content: "Current prompt" },
          { role: "assistant", content: "Wrong-session answer" },
        ],
      })),
    });
    render(
      <ChatView
        api={api}
        sessionId="session-1"
        initialMessages={[]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Current prompt");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/accepted run run-1/i);
    });
  });

  it("shows approval choices and resumes after a decision", async () => {
    const user = userEvent.setup();
    let emit: ((event: Record<string, unknown>) => void) | undefined;
    let releaseStream: () => void = () => undefined;
    const api = makeApi({
      subscribeToRun: vi.fn(
        async (_runId: string, onEvent: (event: Record<string, unknown>) => void) => {
          emit = onEvent;
          onEvent({
            event: "approval.request",
            command: "echo safe",
            choices: ["once", "deny"],
          });
          await new Promise<void>((resolve) => {
            releaseStream = () => resolve();
          });
        },
      ),
      respondToApproval: vi.fn(async () => {
        emit?.({ event: "approval.responded" });
        emit?.({ event: "message.delta", delta: "Approved" });
        emit?.({ event: "run.completed", output: "Approved" });
        releaseStream();
        return { run_id: "run-1", choice: "once" as const, status: "accepted" };
      }),
    });
    render(<ChatView api={api} />);

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Run approval test");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await user.click(await screen.findByRole("button", { name: "once" }));

    expect(api.respondToApproval).toHaveBeenCalledWith("run-1", { choice: "once" });
    await waitFor(() => expect(screen.getByText("Approved")).toBeInTheDocument());
  });

  it("queues, removes, and sends a capability-gated pasted PNG as structured input", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<ChatView api={api} />);
    await waitFor(() => expect(api.capabilities).toHaveBeenCalled());

    const input = screen.getByRole("textbox", { name: /message/i });
    const image = new File(["png"], "pasted.png", { type: "image/png" });
    await user.type(input, "Describe this");
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { files: [image] } });
    input.dispatchEvent(paste);

    expect(await screen.findByText("pasted.png")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(api.startRun).toHaveBeenCalled());
    expect(api.startRun).toHaveBeenCalledWith({
      input: [
        { type: "text", text: "Describe this" },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,cG5n", detail: "auto" },
        },
      ],
    });

    const second = new File(["more"], "remove-me.jpg", { type: "image/jpeg" });
    await user.type(input, "Again");
    const secondPaste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(secondPaste, "clipboardData", { value: { files: [second] } });
    input.dispatchEvent(secondPaste);
    await user.click(await screen.findByRole("button", { name: /remove remove-me\.jpg/i }));
    expect(screen.queryByText("remove-me.jpg")).not.toBeInTheDocument();
  });

  it("shows validation errors and never silently sends documents without connected intake", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<ChatView api={api} />);
    const picker = screen.getByLabelText("Choose attachments");
    fireEvent.change(picker, {
      target: { files: [new File(["bad"], "malware.exe", { type: "application/octet-stream" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/not a supported jpeg/i);
    expect(screen.queryByText("malware.exe", { selector: "strong" })).not.toBeInTheDocument();

    fireEvent.change(picker, {
      target: { files: [new File(["%PDF"], "report.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/document sending is not connected/i);
    await user.type(screen.getByRole("textbox", { name: /message/i }), "Summarize");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(api.startRun).not.toHaveBeenCalled();
  });

  it("intakes a document through the local adapter and references it in the run when delivery is advertised", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    const adapter = makeAdapter({ capabilities: vi.fn(async () => adapterDeliveryCapabilities) });
    render(<ChatView api={api} attachmentAdapter={adapter} />);
    await waitFor(() => expect(adapter.capabilities).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Choose attachments"), {
      target: { files: [new File(["%PDF"], "report.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Summarize");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(api.startRun).toHaveBeenCalled());
    expect(adapter.intakeDocument).toHaveBeenCalledWith(
      "mobile-unsaved-session",
      expect.objectContaining({ name: "report.pdf" }),
    );
    expect(api.startRun).toHaveBeenCalledWith({
      input: "Summarize",
      attachmentIds: ["att_local_test"],
    });
  });

  it("blocks document send when the local adapter only ingests without run delivery", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    const adapter = makeAdapter();
    render(<ChatView api={api} attachmentAdapter={adapter} />);
    await waitFor(() => expect(adapter.capabilities).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Choose attachments"), {
      target: { files: [new File(["%PDF"], "report.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /cannot deliver them into a balls run/i,
    );
    await user.type(screen.getByRole("textbox", { name: /message/i }), "Summarize");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(api.startRun).not.toHaveBeenCalled();
    expect(adapter.intakeDocument).not.toHaveBeenCalled();
  });

  it("blocks document send when the local document service is unavailable", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    const adapter = makeAdapter({
      capabilities: vi.fn(async () => {
        throw new Error("connection refused");
      }),
    });
    render(<ChatView api={api} attachmentAdapter={adapter} />);
    await waitFor(() => expect(adapter.capabilities).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Choose attachments"), {
      target: { files: [new File(["%PDF"], "report.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /local document service is unavailable/i,
    );
    await user.type(screen.getByRole("textbox", { name: /message/i }), "Summarize");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(api.startRun).not.toHaveBeenCalled();
  });

  it("blocks document send when the adapter does not support the selected format", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    const adapter = makeAdapter({ capabilities: vi.fn(async () => adapterDeliveryCapabilities) });
    render(<ChatView api={api} attachmentAdapter={adapter} />);
    await waitFor(() => expect(adapter.capabilities).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Choose attachments"), {
      target: { files: [new File(["doc"], "legacy.doc", { type: "application/msword" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /not supported by the local document service/i,
    );
    await user.type(screen.getByRole("textbox", { name: /message/i }), "Summarize");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(api.startRun).not.toHaveBeenCalled();
  });

  it("surfaces an intake failure and does not start the run", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    const adapter = makeAdapter({
      capabilities: vi.fn(async () => adapterDeliveryCapabilities),
      intakeDocument: vi.fn(async () => {
        throw new Error("invalid PDF signature");
      }),
    });
    render(<ChatView api={api} attachmentAdapter={adapter} />);
    await waitFor(() => expect(adapter.capabilities).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Choose attachments"), {
      target: { files: [new File(["%PDF"], "scan.pdf", { type: "application/pdf" })] },
    });
    await screen.findByText("scan.pdf");
    await user.type(screen.getByRole("textbox", { name: /message/i }), "Summarize");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid PDF signature/i);
    await waitFor(() => expect(api.startRun).not.toHaveBeenCalled());
  });
});
