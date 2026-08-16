import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VoiceTab } from "../VoiceTab";

describe("VoiceTab", () => {
  it("sends the code, confirms it, and opens the console", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, token: "tok_x", console_url: "https://app.voice.epictechservices.com/app/tok_x/" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<VoiceTab />);

    await user.type(screen.getByPlaceholderText("+1 555 123 4567"), "5551234567");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByPlaceholderText("6-digit code")).toBeTruthy());

    await user.type(screen.getByPlaceholderText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => {
      const frame = screen.getByTitle("Phone console") as HTMLIFrameElement;
      expect(frame.src).toContain("/app/tok_x/");
    });

    expect(fetchMock.mock.calls[0][0]).toContain("/auth/verify");
    expect(fetchMock.mock.calls[1][0]).toContain("/auth/confirm");
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("shows the error when the code does not match", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: "The code did not match — try again." }), { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<VoiceTab />);

    await user.type(screen.getByPlaceholderText("+1 555 123 4567"), "5551234567");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByPlaceholderText("6-digit code")).toBeTruthy());
    await user.type(screen.getByPlaceholderText("6-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(screen.getByText(/did not match/)).toBeTruthy());
    vi.unstubAllGlobals();
    localStorage.clear();
  });
});
