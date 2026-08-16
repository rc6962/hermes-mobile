import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RuntimeSettings } from "../RuntimeSettings";

vi.mock("../../lib/runtime/managed-runtime", () => ({
  getManagedRuntimeStatus: vi.fn().mockResolvedValue({ running: false }),
  startManagedRuntime: vi.fn().mockResolvedValue({ started: true }),
  stopManagedRuntime: vi.fn().mockResolvedValue({ stopped: true }),
  setManagedProviderConfig: vi.fn().mockResolvedValue({ stored: true }),
}));

describe("RuntimeSettings", () => {
  it("renders both runtime modes and reflects the current kind", () => {
    render(<RuntimeSettings kind="termux" onKindChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Termux (advanced)" })).toHaveProperty(
      "ariaPressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Embedded (Balls)" })).toBeTruthy();
  });

  it("switching to embedded reports the new kind", async () => {
    const user = userEvent.setup();
    const onKindChange = vi.fn();
    render(<RuntimeSettings kind="termux" onKindChange={onKindChange} />);
    await user.click(screen.getByRole("button", { name: "Embedded (Balls)" }));
    expect(onKindChange).toHaveBeenCalledWith("managed");
  });

  it("shows the provider config editor and saves valid JSON in embedded mode", async () => {
    const user = userEvent.setup();
    render(<RuntimeSettings kind="managed" onKindChange={() => undefined} />);
    const textarea = screen.getByLabelText("Provider config JSON");
    await user.click(textarea);
    await user.paste('{"providers":{}}');
    await user.click(screen.getByRole("button", { name: "Save to this device" }));
    expect(screen.getByRole("button", { name: "Saved" })).toBeTruthy();
  });

  it("rejects invalid provider JSON", async () => {
    const user = userEvent.setup();
    render(<RuntimeSettings kind="managed" onKindChange={() => undefined} />);
    await user.type(screen.getByLabelText("Provider config JSON"), "not json");
    await user.click(screen.getByRole("button", { name: "Save to this device" }));
    expect(screen.getByText("That is not valid JSON.")).toBeTruthy();
  });
});
