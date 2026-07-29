import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

vi.mock("@/features/waitlist/turnstile-widget", () => ({
  TurnstileWidget: ({
    onReady,
  }: {
    onReady?: (handle: { execute: () => Promise<string | null>; reset: () => void }) => void;
  }) => {
    onReady?.({
      execute: async () => "turnstile-token",
      reset: () => undefined,
    });
    return <div data-testid="turnstile-stub" />;
  },
}));

import { WaitlistForm } from "@/features/waitlist/waitlist-form";

describe("WaitlistForm", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ kind: "accepted" }, { status: 200 }),
      ) as typeof fetch,
    );
  });

  it("exposes labelled email control and approved consent copy", async () => {
    const { container } = render(<WaitlistForm turnstileSiteKey="site-key" />);

    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("autocomplete", "email");
    expect(input).toHaveAttribute("inputMode", "email");
    expect(screen.getByRole("button", { name: "Keep me posted" })).toBeInTheDocument();
    expect(
      screen.getByText("Email me when UnseenPrompt is ready. I can unsubscribe at any time."),
    ).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows invalid email feedback without calling the API", async () => {
    const user = userEvent.setup();
    render(<WaitlistForm turnstileSiteKey="site-key" />);

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Keep me posted" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a complete email address.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts and announces success", async () => {
    const user = userEvent.setup();
    render(<WaitlistForm turnstileSiteKey="site-key" />);

    await user.type(screen.getByLabelText("Email address"), "person@example.com");
    await user.click(screen.getByRole("button", { name: "Keep me posted" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Check your inbox. We sent a confirmation email.",
      );
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/waitlist/request",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
