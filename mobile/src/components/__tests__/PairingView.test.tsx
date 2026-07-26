import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PairingView } from "../PairingView";

describe("PairingView", () => {
  it("submits a trimmed bearer key without rendering the key", async () => {
    const user = userEvent.setup();
    const onPair = vi.fn(async () => undefined);

    render(<PairingView apiUrl="http://127.0.0.1:8642" onPair={onPair} />);

    const input = screen.getByLabelText(/api server key/i);
    await user.type(input, "  local-test-key  ");
    await user.click(screen.getByRole("button", { name: /pair/i }));

    expect(onPair).toHaveBeenCalledWith("local-test-key");
    expect(screen.queryByText("local-test-key")).not.toBeInTheDocument();
  });

  it("does not submit an empty key", async () => {
    const user = userEvent.setup();
    const onPair = vi.fn(async () => undefined);

    render(<PairingView apiUrl="http://127.0.0.1:8642" onPair={onPair} />);

    await user.click(screen.getByRole("button", { name: /pair/i }));

    expect(onPair).not.toHaveBeenCalled();
  });
});
