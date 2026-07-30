import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

const getServerEnvironment = vi.fn();

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => getServerEnvironment(),
}));

vi.mock("@/features/waitlist/waitlist-form", () => ({
  WaitlistForm: () => <div data-testid="waitlist-form-stub">Form</div>,
}));

describe("HomePage environment selection", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerEnvironment.mockReset();
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  });

  it("renders ProductPreview outside production", async () => {
    getServerEnvironment.mockReturnValue({
      APP_ENV: "local",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      RELEASE_SHA: "test",
      MAINTENANCE_MODE: "off",
    });

    const { default: HomePage } = await import("./page");
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Start with the messy version.",
    );
    expect(screen.getByText("Product preview")).toBeVisible();
    expect(screen.queryByTestId("waitlist-form-stub")).not.toBeInTheDocument();
  });

  it("renders ComingSoonLanding in production", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    getServerEnvironment.mockReturnValue({
      APP_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://unseenprompt.com",
      RELEASE_SHA: "test",
      MAINTENANCE_MODE: "off",
    });

    const { default: HomePage } = await import("./page");
    const { container } = render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Bring the half-finished thing.",
    );
    expect(screen.getByText("For the work between coding sessions")).toBeVisible();
    expect(screen.getByTestId("waitlist-form-stub")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
