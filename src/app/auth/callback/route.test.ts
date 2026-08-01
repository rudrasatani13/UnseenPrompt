import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/domain/account/contracts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const runtimeState = vi.hoisted(() => ({
  appEnvironment: "local" as "local" | "production",
  exchangeResult: { error: null } as { error: { message: string } | null },
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
}));

const exchangeCodeForSession = vi.hoisted(() =>
  vi.fn(async () => ({
    data: { user: runtimeState.user },
    error: runtimeState.exchangeResult.error,
  })),
);

const supabaseClient = vi.hoisted(() => ({ auth: { exchangeCodeForSession } }));
const ensureProfile = vi.hoisted(() => vi.fn(async () => undefined));
const getProfile = vi.hoisted(() => vi.fn(async (): Promise<Profile | null> => null));
const createSupabaseAccountRepository = vi.hoisted(() =>
  vi.fn(() => ({ ensureProfile, getProfile })),
);

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => ({
    APP_ENV: runtimeState.appEnvironment,
    NEXT_PUBLIC_APP_URL: "https://app.unseenprompt.test",
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  }),
}));

vi.mock("@/lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(async () => supabaseClient),
}));

vi.mock("@/lib/account/supabase-account-repository", () => ({ createSupabaseAccountRepository }));

function onboardedProfile(onboardingCompletedAt: string | null): Profile {
  return {
    id: USER_ID,
    displayName: null,
    locale: "en",
    timeZone: "UTC",
    onboardingCompletedAt,
    deletionRequestedAt: null,
  };
}

function callbackRequest(query: string): Request {
  return new Request(`https://app.unseenprompt.test/auth/callback${query}`);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    exchangeCodeForSession.mockClear();
    ensureProfile.mockClear().mockResolvedValue(undefined);
    getProfile.mockClear().mockResolvedValue(onboardedProfile("2026-08-01T00:00:00.000Z"));
    createSupabaseAccountRepository.mockClear();
    runtimeState.appEnvironment = "local";
    runtimeState.exchangeResult = { error: null };
    runtimeState.user = { id: USER_ID };
  });

  it("returns a 404 envelope in production without touching Supabase", async () => {
    runtimeState.appEnvironment = "production";
    const { GET } = await import("./route");

    const response = await GET(callbackRequest("?code=abc"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to the stable failure code when the code parameter is missing", async () => {
    const { GET } = await import("./route");

    const response = await GET(callbackRequest(""));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=auth_callback_failed",
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to the stable failure code when the exchange fails, leaking no provider detail", async () => {
    runtimeState.exchangeResult = { error: { message: "invalid pkce verifier for state abc" } };
    const { GET } = await import("./route");

    const response = await GET(callbackRequest("?code=abc&next=%2Fprofile"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=auth_callback_failed",
    );
    expect(ensureProfile).not.toHaveBeenCalled();
  });

  it("redirects to the stable failure code when the exchange throws", async () => {
    exchangeCodeForSession.mockRejectedValueOnce(new Error("network unreachable"));
    const { GET } = await import("./route");

    const response = await GET(callbackRequest("?code=abc"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=auth_callback_failed",
    );
  });

  it("redirects to the stable failure code when the exchange returns no user", async () => {
    runtimeState.user = null;
    const { GET } = await import("./route");

    const response = await GET(callbackRequest("?code=abc"));

    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=auth_callback_failed",
    );
    expect(ensureProfile).not.toHaveBeenCalled();
  });

  it("bootstraps the profile for the authenticated user before redirecting", async () => {
    const { GET } = await import("./route");

    await GET(callbackRequest("?code=abc&next=%2Fprofile"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(createSupabaseAccountRepository).toHaveBeenCalledWith(supabaseClient);
    expect(ensureProfile).toHaveBeenCalledWith(USER_ID);
    expect(getProfile).toHaveBeenCalledWith(USER_ID);
  });

  it("sends an onboarded user to the validated next path", async () => {
    const { GET } = await import("./route");

    const response = await GET(callbackRequest("?code=abc&next=%2Fprofile"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.unseenprompt.test/profile");
  });

  it("sends a user who has not finished onboarding to /onboarding", async () => {
    getProfile.mockResolvedValue(onboardedProfile(null));
    const { GET } = await import("./route");

    const response = await GET(callbackRequest("?code=abc&next=%2Fprofile"));

    expect(response.headers.get("location")).toBe("https://app.unseenprompt.test/onboarding");
  });

  it("returns a stable retryable sign-in error when the profile read fails", async () => {
    getProfile.mockRejectedValue(new Error("connection reset"));
    const { GET } = await import("./route");

    const response = await GET(callbackRequest("?code=abc&next=%2Fprofile"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=auth_callback_failed",
    );
  });

  it("returns a stable retryable sign-in error when the bootstrap write fails", async () => {
    ensureProfile.mockRejectedValue(new Error("permission denied"));
    const { GET } = await import("./route");

    const response = await GET(callbackRequest("?code=abc&next=%2Fprofile"));

    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=auth_callback_failed",
    );
  });

  it("falls back to the root path when next is hostile or absent", async () => {
    const { GET } = await import("./route");

    const hostile = await GET(callbackRequest("?code=abc&next=%2F%2Fevil.example"));
    expect(hostile.headers.get("location")).toBe("https://app.unseenprompt.test/");

    const absent = await GET(callbackRequest("?code=abc"));
    expect(absent.headers.get("location")).toBe("https://app.unseenprompt.test/");
  });

  it("marks the redirect uncacheable", async () => {
    const { GET } = await import("./route");

    const response = await GET(callbackRequest("?code=abc"));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
