import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RuntimeSettings } from "../RuntimeSettings";

vi.mock("../../lib/runtime/managed-runtime", () => ({
  getManagedRuntimeStatus: vi.fn().mockResolvedValue({ running: false }),
  startManagedRuntime: vi.fn().mockResolvedValue({ started: true }),
  stopManagedRuntime: vi.fn().mockResolvedValue({ stopped: true }),
  setManagedProviderConfig: vi.fn().mockResolvedValue({ stored: true }),
  hasLocalModel: vi.fn().mockResolvedValue({ present: false, path: "/models/qwen3-0.6b-q4_k_m.gguf", size: 0 }),
  downloadLocalModel: vi.fn().mockResolvedValue({ ok: true, path: "/models/qwen3-0.6b-q4_k_m.gguf" }),
  startLocalModel: vi.fn().mockResolvedValue({ ok: true, port: 8080 }),
  stopLocalModel: vi.fn().mockResolvedValue({ ok: true }),
  getLocalModelStatus: vi.fn().mockResolvedValue({ ok: true, running: false }),
}));

describe("RuntimeSettings", () => {
  it("shows engine status with Start when stopped", () => {
    render(<RuntimeSettings />);
    expect(screen.getByText(/Status: stopped/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("defaults to Epic Cloud as the model source", () => {
    render(<RuntimeSettings />);
    expect(screen.getByRole("button", { name: "Epic Cloud" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("hides the custom provider box until Custom is selected", async () => {
    const user = userEvent.setup();
    render(<RuntimeSettings />);
    expect(screen.queryByLabelText("Provider config JSON")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Custom (developer)" }));
    expect(screen.getByLabelText("Provider config JSON")).toBeTruthy();
  });

  it("downloads and starts the Balls of Steel local model from the on-device source", async () => {
    const user = userEvent.setup();
    render(<RuntimeSettings />);
    await user.click(screen.getByRole("button", { name: /On this device/ }));
    expect(screen.getByRole("button", { name: /Download local model/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Download local model/ }));
    expect(await screen.findByRole("button", { name: "Start local engine" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Start local engine" }));
    expect(await screen.findByText(/Local engine is running/)).toBeTruthy();
  });

  it("saves valid provider JSON in the custom view", async () => {
    const user = userEvent.setup();
    render(<RuntimeSettings />);
    await user.click(screen.getByRole("button", { name: "Custom (developer)" }));
    const textarea = screen.getByLabelText("Provider config JSON");
    await user.click(textarea);
    await user.paste('{"providers":{}}');
    await user.click(screen.getByRole("button", { name: "Save to this device" }));
    expect(screen.getByRole("button", { name: /Saved/ })).toBeTruthy();
  });
});
