import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import type { Profile } from "@/domain/account/contracts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const supabaseClient = vi.hoisted(() => ({ marker: "supabase-client" }));
const getServerEnvironment = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
);
const getAuthenticatedContext = vi.hoisted(() => vi.fn());
const getProfile = vi.hoisted(() => vi.fn());
const createSupabaseAccountRepository = vi.hoisted(() => vi.fn(() => ({ getProfile })));

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => getServerEnvironment(),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/require-user", () => ({ getAuthenticatedContext }));
vi.mock("@/lib/account/supabase-account-repository", () => ({ createSupabaseAccountRepository }));
vi.mock("@/features/home/home-workspace", () => ({
  HomeWorkspace: () => <div data-testid="home-workspace-stub">Home workspace</div>,
}));
vi.mock("@/features/waitlist/waitlist-form", () => ({
  WaitlistForm: () => <div data-testid="waitlist-form-stub">Form</div>,
}));

function environmentFor(appEnv: string, maintenance = "off") {
  return {
    APP_ENV: appEnv,
    NEXT_PUBLIC_APP_URL:
      appEnv === "production" ? "https://unseenprompt.com" : "http://127.0.0.1:3000",
    RELEASE_SHA: "test",
    MAINTENANCE_MODE: maintenance,
  };
}

function profileWith(onboardingCompletedAt: string | null): Profile {
  return {
    id: USER_ID,
    displayName: null,
    locale: "en",
    timeZone: "UTC",
    onboardingCompletedAt,
    deletionRequestedAt: null,
  };
}

describe("HomePage environment and account gates", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerEnvironment.mockReset().mockReturnValue(environmentFor("local"));
    redirect.mockClear();
    getProfile.mockReset().mockResolvedValue(profileWith("2026-08-01T00:00:00.000Z"));
    createSupabaseAccountRepository.mockClear();
    getAuthenticatedContext.mockReset().mockResolvedValue({
      user: { id: USER_ID },
      supabase: supabaseClient,
    });
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  });

  it("renders the authenticated composer for an onboarded non-production user", async () => {
    const { default: HomePage } = await import("./page");

    render(await HomePage());

    expect(createSupabaseAccountRepository).toHaveBeenCalledWith(supabaseClient);
    expect(getProfile).toHaveBeenCalledWith(USER_ID);
    expect(screen.getByTestId("home-workspace-stub")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a sessionless visitor to sign in with the home return path", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const { default: HomePage } = await import("./page");

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in?next=%2F");
    expect(createSupabaseAccountRepository).not.toHaveBeenCalled();
  });

  it("sends an incomplete account to onboarding", async () => {
    getProfile.mockResolvedValue(profileWith(null));
    const { default: HomePage } = await import("./page");

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("keeps production on the waitlist without authenticating", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    getServerEnvironment.mockReturnValue(environmentFor("production"));
    const { default: HomePage } = await import("./page");

    const { container } = render(await HomePage());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Bring the half-finished thing.",
    );
    expect(screen.getByText("For the work between coding sessions")).toBeVisible();
    expect(screen.getByTestId("waitlist-form-stub")).toBeInTheDocument();
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("leaves authentication to the maintenance layout while maintenance is on", async () => {
    getServerEnvironment.mockReturnValue(environmentFor("local", "on"));
    const { default: HomePage } = await import("./page");

    expect(await HomePage()).toBeNull();
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
    expect(createSupabaseAccountRepository).not.toHaveBeenCalled();
  });
});
