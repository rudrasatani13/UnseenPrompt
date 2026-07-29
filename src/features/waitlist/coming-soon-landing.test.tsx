import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

vi.mock("@/features/waitlist/waitlist-form", () => ({
  WaitlistForm: () => <div data-testid="waitlist-form-stub">Form</div>,
}));

import { ComingSoonLanding } from "@/features/waitlist/coming-soon-landing";

describe("ComingSoonLanding", () => {
  it("renders approved copy and a single H1", async () => {
    const { container } = render(<ComingSoonLanding turnstileSiteKey="1x00000000000000000000AA" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Start with the messy version.",
    );
    expect(screen.getByText("UnseenPrompt is being built")).toBeInTheDocument();
    expect(screen.getByText("Work in progress")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "From rough input to a useful next prompt." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Bring the rough version")).toBeInTheDocument();
    expect(screen.getByText("Keep the decisions")).toBeInTheDocument();
    expect(screen.getByText("Continue in your coding tool")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByTestId("waitlist-form-stub")).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
