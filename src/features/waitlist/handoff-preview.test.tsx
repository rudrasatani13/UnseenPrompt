import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { HandoffPreview } from "@/features/waitlist/handoff-preview";

describe("HandoffPreview", () => {
  it("reveals each part of the handoff without autoplay", async () => {
    const user = userEvent.setup();
    const { container } = render(<HandoffPreview />);

    expect(screen.getByText("Example", { selector: "span" })).toBeVisible();
    expect(screen.queryByText("Synthetic")).not.toBeInTheDocument();
    expect(screen.getByText(/Checkout works locally/)).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Decisions" }));
    expect(screen.getByText("Reproduce before changing code")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(screen.getByText("Return callback not confirmed")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Next prompt" }));
    expect(screen.getByText(/Reproduce the stalled payment return path/)).toBeVisible();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("copies the prepared prompt and announces the result", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<HandoffPreview />);

    await user.click(screen.getByRole("tab", { name: "Next prompt" }));
    await user.click(screen.getByRole("button", { name: "Copy prompt" }));

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Reproduce the stalled payment"),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Prompt copied.");
  });
});
