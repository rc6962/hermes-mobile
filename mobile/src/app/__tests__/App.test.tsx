import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { App } from "../App";

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

    render(<App />);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/online/i));
    expect(screen.getByRole("textbox", { name: /message/i })).toBeInTheDocument();
  });
});
