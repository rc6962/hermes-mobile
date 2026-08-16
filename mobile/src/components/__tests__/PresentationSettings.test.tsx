import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PresentationSettings } from "../PresentationSettings";

describe("PresentationSettings", () => {
  it("opens settings and changes to the dark theme", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PresentationSettings
        preferences={{ theme: "soft-haven", showActivityConsoleOnChat: false }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open settings/i }));
    expect(screen.getByRole("dialog", { name: /settings/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /gentle command/i }));

    expect(onChange).toHaveBeenCalledWith({
      theme: "gentle-command",
      showActivityConsoleOnChat: false,
    });
  });

  it("toggles the optional in-chat activity console", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PresentationSettings
        preferences={{ theme: "gentle-command", showActivityConsoleOnChat: false }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open settings/i }));
    await user.click(screen.getByRole("switch", { name: /show activity console in chat/i }));

    expect(onChange).toHaveBeenCalledWith({
      theme: "gentle-command",
      showActivityConsoleOnChat: true,
    });
  });
});
