import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Composer } from "../Composer";

describe("Composer attachments", () => {
  it("opens the picker, reports selected files, and removes an attachment", async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    const onRemoveAttachment = vi.fn();
    const file = new File(["image"], "photo.png", { type: "image/png" });

    const view = render(
      <Composer
        value=""
        busy={false}
        attachments={[{ id: "photo-1", file, kind: "image" }]}
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onAddFiles={onAddFiles}
        onRemoveAttachment={onRemoveAttachment}
      />,
    );

    expect(screen.getByText("photo.png")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add attachment/i }));
    const picker = screen.getByLabelText("Choose attachments");
    await user.upload(picker, file);
    expect(onAddFiles).toHaveBeenCalledWith([file]);

    await user.click(screen.getByRole("button", { name: /remove photo\.png/i }));
    expect(onRemoveAttachment).toHaveBeenCalledWith("photo-1");
    view.unmount();
  });

  it("reports pasted images through the same file handler", async () => {
    const onAddFiles = vi.fn();
    render(
      <Composer
        value=""
        busy={false}
        attachments={[]}
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onAddFiles={onAddFiles}
        onRemoveAttachment={vi.fn()}
      />,
    );

    const image = new File(["image"], "pasted.png", { type: "image/png" });
    const input = screen.getByRole("textbox", { name: /message/i });
    fireEvent.paste(input, { clipboardData: { files: [image] } });

    expect(onAddFiles).toHaveBeenCalledWith([image]);
  });
});
