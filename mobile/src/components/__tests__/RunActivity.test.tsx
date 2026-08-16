import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RunActivity } from "../RunActivity";

describe("RunActivity", () => {
  it("keeps a running tool visible without exposing its raw preview", () => {
    const { container } = render(
      <RunActivity
        state={{
          status: "running",
          assistantText: "",
          reasoningText: "",
          tools: [
            {
              name: "terminal",
              preview: "curl -H Authorization: Bearer secret-token",
              status: "running",
            },
          ],
        }}
      />,
    );

    const panel = container.querySelector("details");
    expect(panel).toHaveAttribute("open");
    expect(screen.getByText("terminal")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText(/secret-token/i)).not.toBeInTheDocument();
  });
});
