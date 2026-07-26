import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChatView } from "../ChatView";
import type { HermesApi } from "../../lib/hermes-api";

function makeApi(
  overrides: Partial<Pick<HermesApi, "startRun" | "subscribeToRun" | "stopRun" | "respondToApproval">> = {},
) {
  return {
    startRun: vi.fn(async () => ({ runId: "run-1", status: "started" })),
    subscribeToRun: vi.fn(async (_runId: string, onEvent: (event: Record<string, unknown>) => void) => {
      onEvent({ event: "message.delta", delta: "Hello Hermes" });
      onEvent({ event: "run.completed", output: "Hello Hermes" });
    }),
    stopRun: vi.fn(async () => ({ run_id: "run-1", status: "stopping" })),
    respondToApproval: vi.fn(async () => ({ run_id: "run-1", status: "accepted" })),
    ...overrides,
  } as unknown as Pick<HermesApi, "startRun" | "subscribeToRun" | "stopRun" | "respondToApproval">;
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
      expect(screen.getByText("Hello Hermes")).toBeInTheDocument();
    });
    expect(screen.getByText("Say hello")).toBeInTheDocument();
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
});
