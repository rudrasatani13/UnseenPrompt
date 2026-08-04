import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/domain/account/contracts";
import type { DiscoverySnapshotV1 } from "@/domain/discovery/contracts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
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
const getAuthenticatedContext = vi.hoisted(() => vi.fn());
const getProfile = vi.hoisted(() => vi.fn());
const createSupabaseAccountRepository = vi.hoisted(() => vi.fn(() => ({ getProfile })));
const getSnapshot = vi.hoisted(() => vi.fn());
const createDiscoveryRuntime = vi.hoisted(() => vi.fn(() => ({ getSnapshot })));

vi.mock("@/config/env/server", () => ({ getServerEnvironment }));
vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/lib/supabase/require-user", () => ({ getAuthenticatedContext }));
vi.mock("@/lib/account/supabase-account-repository", () => ({ createSupabaseAccountRepository }));
vi.mock("@/lib/discovery/runtime", () => ({ createDiscoveryRuntime }));
vi.mock("@/features/discovery/discovery-flow", () => ({
  DiscoveryFlow: ({ initialSnapshot }: { readonly initialSnapshot: DiscoverySnapshotV1 }) => (
    <div data-testid="discovery-flow-stub">{initialSnapshot.projectId}</div>
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

const snapshot = {
  projectId: PROJECT_ID,
} as DiscoverySnapshotV1;

function environmentFor(appEnv: string, maintenance = "off") {
  return {
    APP_ENV: appEnv,
    NEXT_PUBLIC_APP_URL: "https://app.unseenprompt.test",
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: maintenance,
  };
}

describe("DiscoveryPage", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerEnvironment.mockReset().mockReturnValue(environmentFor("local"));
    notFound.mockClear();
    redirect.mockClear();
    getProfile.mockReset().mockResolvedValue(profile);
    createSupabaseAccountRepository.mockClear();
    getSnapshot.mockReset().mockResolvedValue(snapshot);
    createDiscoveryRuntime.mockClear();
    getAuthenticatedContext.mockReset().mockResolvedValue({
      user: { id: USER_ID },
      supabase: supabaseClient,
    });
  });

  it("closes the product surface before authentication in production", async () => {
    getServerEnvironment.mockReturnValue(environmentFor("production"));
    const { default: DiscoveryPage } = await import("./page");

    await expect(DiscoveryPage({ params: { projectId: PROJECT_ID } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
  });

  it("redirects anonymous users to sign in with the project return path", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const { default: DiscoveryPage } = await import("./page");

    await expect(DiscoveryPage({ params: { projectId: PROJECT_ID } })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith(
      `/sign-in?next=${encodeURIComponent(`/projects/${PROJECT_ID}/discovery`)}`,
    );
    expect(createSupabaseAccountRepository).not.toHaveBeenCalled();
  });

  it("sends incomplete onboarding back to onboarding before reading discovery", async () => {
    getProfile.mockResolvedValue({ ...profile, onboardingCompletedAt: null });
    const { default: DiscoveryPage } = await import("./page");

    await expect(DiscoveryPage({ params: { projectId: PROJECT_ID } })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith("/onboarding");
    expect(getSnapshot).not.toHaveBeenCalled();
  });

  it("loads the owner-scoped snapshot on the server and passes only the DTO to the client flow", async () => {
    const { default: DiscoveryPage } = await import("./page");

    render(await DiscoveryPage({ params: Promise.resolve({ projectId: PROJECT_ID }) }));

    expect(createSupabaseAccountRepository).toHaveBeenCalledWith(supabaseClient);
    expect(getProfile).toHaveBeenCalledWith(USER_ID);
    expect(createDiscoveryRuntime).toHaveBeenCalledWith(supabaseClient);
    expect(getSnapshot).toHaveBeenCalledWith(PROJECT_ID);
    expect(screen.getByTestId("discovery-flow-stub")).toHaveTextContent(PROJECT_ID);
  });

  it("returns a not-found boundary for malformed or missing projects", async () => {
    const { default: DiscoveryPage } = await import("./page");
    await expect(DiscoveryPage({ params: { projectId: "not-a-uuid" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );

    getSnapshot.mockRejectedValue({ code: "project_not_found" });
    await expect(DiscoveryPage({ params: { projectId: PROJECT_ID } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
