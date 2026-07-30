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
      vi.fn(async () => Response.json({ kind: "accepted" }, { status: 200 })) as typeof fetch,
    );
  });

  it("exposes labelled email control and approved consent copy", async () => {
    const { container } = render(<WaitlistForm turnstileSiteKey="site-key" />);

    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("autocomplete", "email");
    expect(input).toHaveAttribute("inputMode", "email");
    expect(screen.getByRole("button", { name: "Tell me when I can try it" })).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "you@example.com");
    expect(input).toHaveAttribute("aria-describedby");
    expect(
      screen.getByText(
        "One confirmation email now. After that, we’ll only write when there’s something worth trying. Unsubscribe anytime.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Double opt-in")).not.toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows invalid email feedback without calling the API", async () => {
    const user = userEvent.setup();
    render(<WaitlistForm turnstileSiteKey="site-key" />);

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Tell me when I can try it" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a complete email address.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts and announces success", async () => {
    const user = userEvent.setup();
    render(<WaitlistForm turnstileSiteKey="site-key" />);

    await user.type(screen.getByLabelText("Email address"), "person@example.com");
    await user.click(screen.getByRole("button", { name: "Tell me when I can try it" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Check your inbox to confirm your email.",
      );
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/waitlist/request",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("explains when the production rate limit asks the user to wait", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ kind: "temporary_failure" }, { status: 429 }),
    );
    const user = userEvent.setup();
    render(<WaitlistForm turnstileSiteKey="site-key" />);

    await user.type(screen.getByLabelText("Email address"), "person@example.com");
    await user.click(screen.getByRole("button", { name: "Tell me when I can try it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Wait a minute and try again.",
    );
  });
});
