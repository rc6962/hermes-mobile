import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionDrawer } from "../SessionDrawer";
import type { BallsApi } from "../../lib/balls-api";

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
  } as unknown as Pick<BallsApi, "listSessions" | "createSession" | "getSessionMessages">;
}

describe("SessionDrawer", () => {
  it("keeps the long session list collapsed until opened", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<SessionDrawer api={api} onSelect={vi.fn()} />);

    const toggle = await screen.findByRole("button", { name: /toggle sessions/i });
    expect(screen.queryByRole("button", { name: /First chat/i })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(await screen.findByRole("button", { name: /First chat/i })).toBeInTheDocument();
  });

  it("automatically selects the first available session on initial load", async () => {
    const api = makeApi();
    const onSelect = vi.fn();
    render(<SessionDrawer api={api} onSelect={onSelect} />);

    await waitFor(() => {
      expect(api.getSessionMessages).toHaveBeenCalledWith("session-1");
      expect(onSelect).toHaveBeenCalledWith("session-1", [
        { role: "user", content: "Previous question" },
      ]);
    });
  });

  it("lists sessions, loads history on selection, and creates a new session", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    const onSelect = vi.fn();
    render(<SessionDrawer api={api} selectedSessionId="session-existing" onSelect={onSelect} />);

    await user.click(await screen.findByRole("button", { name: /toggle sessions/i }));
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

  it("ignores history from an older selection when a newer selection finishes first", async () => {
    const user = userEvent.setup();
    let resolveFirst: ((value: { object: string; session_id: string; data: unknown[] }) => void) | undefined;
    let resolveSecond: ((value: { object: string; session_id: string; data: unknown[] }) => void) | undefined;
    const api = makeApi();
    api.listSessions = vi.fn(async () => ({
      object: "list",
      data: [
        { id: "session-1", title: "First chat" },
        { id: "session-2", title: "Second chat" },
      ],
      limit: 50,
      offset: 0,
      has_more: false,
    }));
    api.getSessionMessages = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const onSelect = vi.fn();
    render(<SessionDrawer api={api} selectedSessionId="session-existing" onSelect={onSelect} />);

    await user.click(await screen.findByRole("button", { name: /toggle sessions/i }));
    await user.click(await screen.findByRole("button", { name: /First chat/i }));
    await user.click(await screen.findByRole("button", { name: /Second chat/i }));

    resolveSecond?.({
      object: "list",
      session_id: "session-2",
      data: [{ role: "user", content: "Second history" }],
    });
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("session-2", [
        { role: "user", content: "Second history" },
      ]);
    });

    resolveFirst?.({
      object: "list",
      session_id: "session-1",
      data: [{ role: "user", content: "First history" }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
