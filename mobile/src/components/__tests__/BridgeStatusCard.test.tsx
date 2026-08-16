import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BridgeStatusCard } from "../BridgeStatusCard";
import type { AndroidBridgeStatus } from "../../lib/android-bridge";

const disabledStatus: AndroidBridgeStatus = {
  platformAvailable: true,
  bridge: "disabled",
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
};

describe("BridgeStatusCard", () => {
  it("shows the disabled state and opens Android accessibility settings", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn(async () => undefined);

    render(
      <BridgeStatusCard
        status={disabledStatus}
        loading={false}
        onRefresh={vi.fn(async () => undefined)}
        onOpenSettings={onOpenSettings}
      />,
    );

    expect(screen.getByRole("heading", { name: /phone bridge/i })).toBeInTheDocument();
    expect(screen.getByText(/accessibility service is disabled/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open accessibility settings/i }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("shows connected state without offering setup when accessibility is enabled", () => {
    render(
      <BridgeStatusCard
        status={{ ...disabledStatus, bridge: "ready", accessibilityEnabled: true, serviceConnected: true }}
        loading={false}
        onRefresh={vi.fn(async () => undefined)}
        onOpenSettings={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByRole("heading", { name: /phone bridge ready/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open accessibility settings/i })).not.toBeInTheDocument();
  });
});
