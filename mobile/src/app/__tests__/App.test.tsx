import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AndroidBridgeAdapter, AndroidBridgeStatus } from "../../lib/android-bridge";
import type { ApiKeyStore } from "../../lib/credentials";

import { App } from "../App";

function createStore(apiKey?: string): ApiKeyStore {
  return {
    load: vi.fn(async () => apiKey),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
}

function createBridgeAdapter(): AndroidBridgeAdapter {
  return {
    getStatus: vi.fn(async (): Promise<AndroidBridgeStatus> => ({
      platformAvailable: true,
      bridge: "disabled" as const,
      accessibilityEnabled: false,
      serviceConnected: false,
      androidApiLevel: 36,
      capabilities: ["bridge.status", "accessibility.status"],
      disabledCapabilities: [
        "screen.read",
        "node.find",
        "node.tap",
        "input.type",
        "system.back",
        "system.home",
        "screen.capture",
      ],
    })),
    openAccessibilitySettings: vi.fn(async () => undefined),
  };
}

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("shows pairing before contacting Balls when no key is stored", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<App credentialStore={createStore()} />);

    expect(await screen.findByRole("heading", { name: /pair with balls/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("shows the backend online state and chat composer after health succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith("/api/sessions")
          ? { object: "list", data: [], limit: 50, offset: 0, has_more: false }
          : { status: "ok" };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    render(<App credentialStore={createStore("test-key")} />);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/online/i));
    expect(screen.getByRole("textbox", { name: /message/i })).toBeInTheDocument();
  });

  it("persists a selected theme from settings and applies it to the app shell", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith("/api/sessions")
          ? { object: "list", data: [], limit: 50, offset: 0, has_more: false }
          : { status: "ok" };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    const { container } = render(<App credentialStore={createStore("test-key")} />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/online/i));

    await user.click(screen.getByRole("button", { name: /open settings/i }));
    await user.click(screen.getByRole("button", { name: /gentle command/i }));

    expect(container.querySelector(".app-shell")).toHaveAttribute("data-theme", "gentle-command");
    expect(JSON.parse(window.localStorage.getItem("hermes-mobile.presentation-preferences.v1") ?? "null")).toEqual({
      theme: "gentle-command",
      showActivityConsoleOnChat: false,
    });
  });

  it("shows bridge setup state and delegates the accessibility settings action", async () => {
    const user = userEvent.setup();
    const bridgeAdapter = createBridgeAdapter();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith("/api/sessions")
          ? { object: "list", data: [], limit: 50, offset: 0, has_more: false }
          : { status: "ok" };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    render(<App credentialStore={createStore("test-key")} bridgeAdapter={bridgeAdapter} />);

    expect(await screen.findByRole("heading", { name: /phone bridge disabled/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open accessibility settings/i }));

    expect(bridgeAdapter.openAccessibilitySettings).toHaveBeenCalledOnce();
  });

  it("sends a new message to the selected session", async () => {
    const user = userEvent.setup();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });

        if (url.endsWith("/health")) {
          return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
        }
        if (url.endsWith("/api/sessions") && init?.method !== "POST") {
          return new Response(
            JSON.stringify({
              object: "list",
              data: [{ id: "session-1", title: "Existing chat" }],
              limit: 50,
              offset: 0,
              has_more: false,
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/api/sessions/session-1/messages")) {
          return new Response(
            JSON.stringify({
              object: "list",
              session_id: "session-1",
              data: [{ role: "user", content: "Previous question" }],
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/v1/runs") && init?.method === "POST") {
          return new Response(JSON.stringify({ run_id: "run-1", status: "started" }), { status: 202 });
        }
        if (url.endsWith("/v1/runs/run-1/events")) {
          return new Response(
            'data: {"event":"run.completed","output":"Done"}\n\n',
            { status: 200, headers: { "Content-Type": "text/event-stream" } },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<App credentialStore={createStore("test-key")} />);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/online/i));
    expect(await screen.findByText("Previous question")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Follow up");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      const runRequest = requests.find(
        (request) => request.url.endsWith("/v1/runs") && request.init?.method === "POST",
      );
      expect(runRequest).toBeDefined();
      expect(JSON.parse(String(runRequest?.init?.body))).toEqual({
        input: "Follow up",
        session_id: "session-1",
      });
    });
  });
});
