import { describe, expect, it } from "vitest";

import {
  initialSessionState,
  normalizeSessionMessages,
  sessionStateReducer,
} from "../session-store";

describe("session store", () => {
  it("loads sessions and selects an existing session", () => {
    const loaded = sessionStateReducer(initialSessionState(), {
      type: "sessions_loaded",
      sessions: [
        { id: "session-1", title: "First chat" },
        { id: "session-2", title: "Second chat" },
      ],
    });
    const selected = sessionStateReducer(loaded, {
      type: "session_selected",
      sessionId: "session-2",
    });

    expect(selected.status).toBe("ready");
    expect(selected.sessions).toHaveLength(2);
    expect(selected.selectedSessionId).toBe("session-2");
  });

  it("normalizes only persisted user and assistant text messages", () => {
    expect(
      normalizeSessionMessages([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "tool", content: "hidden tool output" },
        { role: "assistant", content: [{ type: "text", text: "ignored multipart" }] },
      ]),
    ).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
  });

  it("clears transient errors when a new load begins", () => {
    const failed = sessionStateReducer(initialSessionState(), {
      type: "sessions_failed",
      message: "offline",
    });
    expect(sessionStateReducer(failed, { type: "sessions_loading" })).toMatchObject({
      status: "loading",
      error: undefined,
    });
  });
});
