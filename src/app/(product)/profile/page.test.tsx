import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Preferences, Profile } from "@/domain/account/contracts";

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
const getProfile = vi.hoisted(() => vi.fn());
const getPreferences = vi.hoisted(() => vi.fn());
const createSupabaseAccountRepository = vi.hoisted(() =>
  vi.fn(() => ({ getProfile, getPreferences })),
);

vi.mock("@/config/env/server", () => ({ getServerEnvironment }));
vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/lib/supabase/require-user", () => ({ getAuthenticatedContext }));
vi.mock("@/lib/account/supabase-account-repository", () => ({ createSupabaseAccountRepository }));
vi.mock("@/features/account/profile-form", () => ({
  ProfileForm: () => <div data-testid="profile-form-stub" />,
}));
vi.mock("@/features/account/preferences-form", () => ({
  PreferencesForm: () => <div data-testid="preferences-form-stub" />,
}));
vi.mock("@/features/account/sign-out-button", () => ({
  SignOutButton: () => <div data-testid="sign-out-button-stub" />,
}));
vi.mock("@/features/account/deletion-request-card", () => ({
  DeletionRequestCard: ({ deletionRequestedAt }: { deletionRequestedAt: string | null }) => (
    <div data-testid="deletion-request-card-stub">{deletionRequestedAt ?? "none"}</div>
  ),
}));

const profile: Profile = {
  id: USER_ID,
  displayName: "Ada",
  locale: "en",
  timeZone: "UTC",
  onboardingCompletedAt: "2026-08-01T00:00:00.000Z",
  deletionRequestedAt: null,
};
const preferences: Preferences = {
  skillLevel: "advanced",
  preferredStackBehavior: "recommend",
  preferredStack: {},
  codingStyle: {},
  deploymentPreference: null,
};

function environmentFor(appEnv: string) {
  return {
    APP_ENV: appEnv,
    NEXT_PUBLIC_APP_URL: "https://app.unseenprompt.test",
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  };
}

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerEnvironment.mockReset().mockReturnValue(environmentFor("local"));
    notFound.mockClear();
    redirect.mockClear();
    getProfile.mockClear().mockResolvedValue(profile);
    getPreferences.mockClear().mockResolvedValue(preferences);
    createSupabaseAccountRepository.mockClear();
    getAuthenticatedContext
      .mockClear()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
  });

  it("is not found in production before authenticating", async () => {
    getServerEnvironment.mockReturnValue(environmentFor("production"));
    const { default: ProfilePage } = await import("./page");

    await expect(ProfilePage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
  });

  it("sends a sessionless visitor to sign in with the profile return path", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const { default: ProfilePage } = await import("./page");

    await expect(ProfilePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in?next=%2Fprofile");
  });

  it("returns an unfinished or incomplete account to onboarding", async () => {
    getProfile.mockResolvedValue({ ...profile, onboardingCompletedAt: null });
    const { default: ProfilePage } = await import("./page");

    await expect(ProfilePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("renders all three account sections from owner-scoped repository reads", async () => {
    const { default: ProfilePage } = await import("./page");

    render(await ProfilePage());

    expect(createSupabaseAccountRepository).toHaveBeenCalledWith(supabaseClient);
    expect(getProfile).toHaveBeenCalledWith(USER_ID);
    expect(getPreferences).toHaveBeenCalledWith(USER_ID);
    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByTestId("profile-form-stub")).toBeInTheDocument();
    expect(screen.getByTestId("preferences-form-stub")).toBeInTheDocument();
    expect(screen.getByTestId("sign-out-button-stub")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export account data" })).toHaveAttribute(
      "href",
      "/api/account/export",
    );
    expect(screen.getByTestId("deletion-request-card-stub")).toHaveTextContent("none");
  });
});
