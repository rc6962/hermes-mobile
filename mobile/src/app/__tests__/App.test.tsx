import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ApiKeyStore } from "../../lib/credentials";

import { App } from "../App";

function createStore(apiKey?: string): ApiKeyStore {
  return {
    load: vi.fn(async () => apiKey),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
}

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows pairing before contacting Hermes when no key is stored", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<App credentialStore={createStore()} />);

    expect(await screen.findByRole("heading", { name: /pair with hermes/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("forgets a stored key and returns to pairing", async () => {
    const user = userEvent.setup();
    const store = createStore("test-key");
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

    render(<App credentialStore={store} />);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/online/i));
    await user.click(screen.getByRole("button", { name: /forget pairing/i }));

    expect(store.clear).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: /pair with hermes/i })).toBeInTheDocument();
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
});
