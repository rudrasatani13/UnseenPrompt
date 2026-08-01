import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/domain/account/contracts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const runtimeState = vi.hoisted(() => ({
  appEnvironment: "local" as "local" | "production",
  verifyResult: { error: null } as { error: { message: string } | null },
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
}));

const verifyOtp = vi.hoisted(() =>
  vi.fn(async () => ({
    data: { user: runtimeState.user },
    error: runtimeState.verifyResult.error,
  })),
);

const supabaseClient = vi.hoisted(() => ({ auth: { verifyOtp } }));
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

function confirmRequest(query: string): Request {
  return new Request(`https://app.unseenprompt.test/auth/confirm${query}`);
}

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.resetModules();
    verifyOtp.mockClear();
    ensureProfile.mockClear().mockResolvedValue(undefined);
    getProfile.mockClear().mockResolvedValue(profileWith("2026-08-01T00:00:00.000Z"));
    createSupabaseAccountRepository.mockClear();
    runtimeState.appEnvironment = "local";
    runtimeState.verifyResult = { error: null };
    runtimeState.user = { id: USER_ID };
  });

  it("returns a 404 envelope in production without touching Supabase", async () => {
    runtimeState.appEnvironment = "production";
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to the stable failure code when token_hash is missing", async () => {
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?type=email"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to the stable failure code when type is not an email OTP", async () => {
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=recovery"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to the stable failure code for an invalid or expired token", async () => {
    runtimeState.verifyResult = { error: { message: "Token has expired or is invalid" } };
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=stale&type=email&next=%2Fprofile"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
    expect(ensureProfile).not.toHaveBeenCalled();
  });

  it("redirects to the stable failure code when verification throws", async () => {
    verifyOtp.mockRejectedValueOnce(new Error("network unreachable"));
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email"));

    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
  });

  it("redirects to the stable failure code when verification returns no user", async () => {
    runtimeState.user = null;
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email"));

    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
    expect(ensureProfile).not.toHaveBeenCalled();
  });

  it("verifies the token hash as an email OTP and bootstraps the profile", async () => {
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email&next=%2Fprofile"));

    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
    expect(createSupabaseAccountRepository).toHaveBeenCalledWith(supabaseClient);
    expect(ensureProfile).toHaveBeenCalledWith(USER_ID);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.unseenprompt.test/profile");
  });

  it("sends a user who has not finished onboarding to /onboarding", async () => {
    getProfile.mockResolvedValue(profileWith(null));
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email&next=%2Fprofile"));

    expect(response.headers.get("location")).toBe("https://app.unseenprompt.test/onboarding");
  });

  it("returns a stable retryable sign-in error when the profile read fails", async () => {
    getProfile.mockRejectedValue(new Error("connection reset"));
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email&next=%2Fprofile"));

    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
  });

  it("returns a stable retryable sign-in error when the bootstrap write fails", async () => {
    ensureProfile.mockRejectedValue(new Error("permission denied"));
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email"));

    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
  });

  it("falls back to the root path when next is hostile or absent", async () => {
    const { GET } = await import("./route");

    const hostile = await GET(confirmRequest("?token_hash=abc&type=email&next=https%3A%2F%2Fevil"));
    expect(hostile.headers.get("location")).toBe("https://app.unseenprompt.test/");

    const absent = await GET(confirmRequest("?token_hash=abc&type=email"));
    expect(absent.headers.get("location")).toBe("https://app.unseenprompt.test/");
  });

  it("marks the redirect uncacheable", async () => {
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email"));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
