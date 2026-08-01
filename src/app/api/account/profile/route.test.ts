import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/domain/account/contracts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const APP_URL = "https://app.unseenprompt.test";

const runtimeState = vi.hoisted(() => ({ appEnvironment: "local" as "local" | "production" }));
const supabaseClient = vi.hoisted(() => ({ marker: "supabase-client" }));
const getAuthenticatedContext = vi.hoisted(() =>
  vi.fn(async (): Promise<{ user: { id: string }; supabase: unknown } | null> => ({
    user: { id: USER_ID },
    supabase: supabaseClient,
  })),
);
const updateProfile = vi.hoisted(() => vi.fn());
const createSupabaseAccountRepository = vi.hoisted(() => vi.fn(() => ({ updateProfile })));

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => ({
    APP_ENV: runtimeState.appEnvironment,
    NEXT_PUBLIC_APP_URL: APP_URL,
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  }),
}));
vi.mock("@/lib/supabase/require-user", () => ({ getAuthenticatedContext }));
vi.mock("@/lib/account/supabase-account-repository", () => ({ createSupabaseAccountRepository }));

const profile: Profile = {
  id: USER_ID,
  displayName: "Ada",
  locale: "en",
  timeZone: "UTC",
  onboardingCompletedAt: "2026-08-01T00:00:00.000Z",
  deletionRequestedAt: null,
};

function patchRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP_URL}/api/account/profile`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: APP_URL, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("PATCH /api/account/profile", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "local";
    updateProfile.mockClear().mockResolvedValue(profile);
    createSupabaseAccountRepository.mockClear();
    getAuthenticatedContext
      .mockClear()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
  });

  it("is hidden in production without authenticating", async () => {
    runtimeState.appEnvironment = "production";
    const { PATCH } = await import("./route");

    const response = await PATCH(patchRequest({ displayName: "Grace" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const { PATCH } = await import("./route");

    const response = await PATCH(patchRequest({ displayName: "Grace" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "auth_required" } });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("rejects non-PATCH methods after session validation", async () => {
    const route = await import("./route");

    for (const handler of [route.GET, route.POST, route.PUT, route.DELETE]) {
      const response = await handler();

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("PATCH");
      expect(await response.json()).toEqual({ error: { code: "validation_failed" } });
    }
  });

  it("rejects a cross-origin request, oversized body, and invalid payload", async () => {
    const { PATCH } = await import("./route");

    const crossOrigin = await PATCH(
      patchRequest({ displayName: "Grace" }, { origin: "https://evil.example" }),
    );
    expect(crossOrigin.status).toBe(403);

    const oversized = await PATCH(patchRequest({ displayName: "a".repeat(64 * 1024 + 1) }));
    expect(oversized.status).toBe(413);

    const invalid = await PATCH(patchRequest({ ownerId: USER_ID }));
    expect(invalid.status).toBe(422);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("updates only the parsed patch for the session user", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(patchRequest({ displayName: "  Grace  ", locale: "pt-BR" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createSupabaseAccountRepository).toHaveBeenCalledWith(supabaseClient);
    expect(updateProfile).toHaveBeenCalledWith(USER_ID, { displayName: "Grace", locale: "pt-BR" });
    expect(await response.json()).toEqual({ profile });
  });

  it("returns a stable provider error without leaking provider detail", async () => {
    updateProfile.mockRejectedValue(new Error("permission denied: internal host"));
    const { PATCH } = await import("./route");

    const response = await PATCH(patchRequest({ displayName: "Grace" }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "provider_error" } });
  });
});
