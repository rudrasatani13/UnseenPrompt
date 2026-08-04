import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { DiscoveryStatus } from "./discovery-status";

describe("DiscoveryStatus", () => {
  it("announces provider failures and exposes an explicit retry action", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    render(
      <DiscoveryStatus
        variant="provider-error"
        title="Discovery needs a retry"
        description="Try again in a moment."
        action={{ label: "Try again", onClick: retry }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Try again in a moment.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("supports blocked lifecycle actions and has no axe violations", async () => {
    const { container } = render(
      <DiscoveryStatus
        variant="blocked"
        title="Discovery is blocked"
        description="The question limit was reached."
        action={{ label: "Abandon discovery", onClick: () => undefined }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Discovery is blocked");
    expect(await axe(container)).toHaveNoViolations();
  });
});
