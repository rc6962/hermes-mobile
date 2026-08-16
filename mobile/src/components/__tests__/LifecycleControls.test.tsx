import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LifecycleControls } from "../LifecycleControls";

const actions = ["start", "stop", "restart", "doctor", "update"] as const;

describe("LifecycleControls", () => {
  it("offers only fixed lifecycle actions and reports accepted requests", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue({ accepted: true, action: "start" });

    render(<LifecycleControls onAction={onAction} />);

    for (const label of ["Start Balls", "Stop Balls", "Restart Balls", "Run doctor", "Update Balls"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "Start Balls" }));

    expect(onAction).toHaveBeenCalledWith("start");
    expect(screen.getByRole("status")).toHaveTextContent("Start requested");
  });

  it("surfaces a bridge failure without throwing", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockRejectedValue(new Error("Termux is unavailable"));

    render(<LifecycleControls onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Run doctor" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Termux is unavailable");
    expect(screen.getByRole("button", { name: "Run doctor" })).not.toBeDisabled();
  });

  it("keeps the action contract limited to the known action values", () => {
    expect(actions).toEqual(["start", "stop", "restart", "doctor", "update"]);
  });
});
