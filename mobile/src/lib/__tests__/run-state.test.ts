import { describe, expect, it } from "vitest";

import {
  initialRunState,
  reduceRunEvent,
  type RunState,
} from "../run-state";

function reduce(events: Record<string, unknown>[]): RunState {
  return events.reduce(reduceRunEvent, initialRunState());
}

describe("run-state reducer", () => {
  it("accumulates message deltas and preserves the completed output", () => {
    const state = reduce([
      { event: "message.delta", delta: "Hello" },
      { event: "message.delta", delta: " Balls" },
      { event: "run.completed", output: "Hello Balls" },
    ]);

    expect(state.status).toBe("completed");
    expect(state.assistantText).toBe("Hello Balls");
  });

  it("tracks tool start and completion without losing the preview", () => {
    const state = reduce([
      { event: "tool.started", tool: "terminal", preview: "pwd" },
      { event: "tool.completed", tool: "terminal", duration: 0.42, error: false },
    ]);

    expect(state.tools).toEqual([
      {
        name: "terminal",
        preview: "pwd",
        status: "completed",
        duration: 0.42,
        error: false,
      },
    ]);
  });

  it("exposes approval choices and resumes after a response", () => {
    const waiting = reduce([
      {
        event: "approval.request",
        command: "git status",
        choices: ["once", "session", "deny"],
      },
    ]);

    expect(waiting.status).toBe("waiting_for_approval");
    expect(waiting.approval).toEqual({
      command: "git status",
      choices: ["once", "session", "deny"],
    });

    const resumed = reduceRunEvent(waiting, {
      event: "approval.responded",
      choice: "once",
    });
    expect(resumed.status).toBe("running");
    expect(resumed.approval).toBeUndefined();
  });

  it("records failures and ignores duplicate terminal events", () => {
    const failed = reduce([
      { event: "run.failed", error: "provider unavailable" },
      { event: "run.completed", output: "should not replace failure" },
      { event: "run.cancelled" },
    ]);

    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("provider unavailable");
    expect(failed.assistantText).toBe("");
  });
});
