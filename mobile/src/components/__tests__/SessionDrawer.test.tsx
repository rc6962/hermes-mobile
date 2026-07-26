import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionDrawer } from "../SessionDrawer";
import type { HermesApi } from "../../lib/hermes-api";

function makeApi() {
  return {
    listSessions: vi.fn(async () => ({
      object: "list",
      data: [{ id: "session-1", title: "First chat" }],
      limit: 50,
      offset: 0,
      has_more: false,
    })),
    createSession: vi.fn(async () => ({ id: "session-2", title: "New chat" })),
    getSessionMessages: vi.fn(async () => ({
      object: "list",
      session_id: "session-1",
      data: [{ role: "user", content: "Previous question" }],
    })),
  } as unknown as Pick<HermesApi, "listSessions" | "createSession" | "getSessionMessages">;
}

describe("SessionDrawer", () => {
  it("lists sessions, loads history on selection, and creates a new session", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    const onSelect = vi.fn();
    render(<SessionDrawer api={api} onSelect={onSelect} />);

    const existing = await screen.findByRole("button", { name: /First chat/i });
    await user.click(existing);
    await waitFor(() => {
      expect(api.getSessionMessages).toHaveBeenCalledWith("session-1");
      expect(onSelect).toHaveBeenCalledWith("session-1", [
        { role: "user", content: "Previous question" },
      ]);
    });

    await user.click(screen.getByRole("button", { name: /new session/i }));
    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledWith({ title: "New chat" });
      expect(onSelect).toHaveBeenCalledWith("session-2", []);
    });
  });
});
