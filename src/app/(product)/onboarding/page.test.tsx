import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/domain/account/contracts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const getServerEnvironment = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const redirect = vi.hoisted(() =>
  vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
);
const supabaseClient = vi.hoisted(() => ({ marker: "supabase-client" }));
const getAuthenticatedContext = vi.hoisted(() =>
  vi.fn(async (): Promise<{ user: { id: string }; supabase: unknown } | null> => ({
    user: { id: USER_ID },
    supabase: supabaseClient,
  })),
);
const getProfile = vi.hoisted(() => vi.fn(async (): Promise<Profile | null> => null));
const createSupabaseAccountRepository = vi.hoisted(() => vi.fn(() => ({ getProfile })));

vi.mock("@/config/env/server", () => ({ getServerEnvironment }));
vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/lib/supabase/require-user", () => ({ getAuthenticatedContext }));
vi.mock("@/lib/account/supabase-account-repository", () => ({ createSupabaseAccountRepository }));
vi.mock("@/features/account/onboarding-flow", () => ({
  OnboardingFlow: () => <div data-testid="onboarding-flow-stub" />,
}));

function environmentFor(appEnv: string) {
  return {
    APP_ENV: appEnv,
    NEXT_PUBLIC_APP_URL: "https://app.unseenprompt.test",
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
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

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerEnvironment.mockReset().mockReturnValue(environmentFor("local"));
    notFound.mockClear();
    redirect.mockClear();
    getProfile.mockClear().mockResolvedValue(profileWith(null));
    createSupabaseAccountRepository.mockClear();
    getAuthenticatedContext
      .mockClear()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
  });

  it("is not found in production", async () => {
    getServerEnvironment.mockReturnValue(environmentFor("production"));
    const { default: OnboardingPage } = await import("./page");

    await expect(OnboardingPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
  });

  it("sends a sessionless visitor to sign in with the return path", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const { default: OnboardingPage } = await import("./page");

    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in?next=%2Fonboarding");
  });

  it("sends an already onboarded user to their profile", async () => {
    getProfile.mockResolvedValue(profileWith("2026-08-01T00:00:00.000Z"));
    const { default: OnboardingPage } = await import("./page");

    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/profile");
  });

  it("renders the flow for a user who has not finished onboarding", async () => {
    const { default: OnboardingPage } = await import("./page");

    render(await OnboardingPage());

    expect(createSupabaseAccountRepository).toHaveBeenCalledWith(supabaseClient);
    expect(getProfile).toHaveBeenCalledWith(USER_ID);
    expect(screen.getByTestId("onboarding-flow-stub")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("renders the flow rather than failing when the profile cannot be read", async () => {
    getProfile.mockRejectedValue(new Error("connection reset"));
    const { default: OnboardingPage } = await import("./page");

    render(await OnboardingPage());

    expect(screen.getByTestId("onboarding-flow-stub")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
});
