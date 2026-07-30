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
      "Bring the half-finished thing.",
    );
    expect(
      screen.getByText(
        "A bug. A half-built feature. A project you haven’t touched in two weeks. UnseenPrompt is being built to keep the decisions, evidence, and next step together—and prepare one focused prompt for Claude Code, Codex, or Cursor.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("For the work between coding sessions")).toBeInTheDocument();
    expect(screen.getByText("Building now")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "The next tool gets the state, not the whole story.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Bring what exists")).toBeInTheDocument();
    expect(screen.getByText("Keep what matters")).toBeInTheDocument();
    expect(screen.getByText("Continue where you work")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What happened" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What stays decided" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What counts as proof" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What happens next" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Keep using it." })).toBeInTheDocument();
    expect(screen.getByText("Why not just use CLAUDE.md?")).toBeInTheDocument();
    expect(screen.getByText("One email when there’s something usable.")).toBeInTheDocument();
    expect(screen.getByText("Built independently by Rudra Satani")).toBeInTheDocument();
    expect(
      screen.getByText("No countdown. We’ll share a date when one is real."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No tracking pixels. Email confirmation required. Unsubscribe anytime."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the full example" })).toHaveAttribute(
      "href",
      "#handoff",
    );
    expect(
      screen.getByText(
        "Carry the handoff into Claude Code, Codex, Cursor, or wherever you work next.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "UnseenPrompt is for the moving state: what failed today, what you decided, which evidence is confirmed, and what the next session should do.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tell me when I can try it" })).toHaveAttribute(
      "href",
      "#join",
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "mailto:hello@unseenprompt.com",
    );
    expect(screen.queryByText("Double opt-in")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirmation first")).not.toBeInTheDocument();
    expect(screen.getByTestId("waitlist-form-stub")).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
