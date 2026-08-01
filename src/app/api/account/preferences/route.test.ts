import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Preferences } from "@/domain/account/contracts";

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
const updatePreferences = vi.hoisted(() => vi.fn());
const createSupabaseAccountRepository = vi.hoisted(() => vi.fn(() => ({ updatePreferences })));

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

const preferences: Preferences = {
  skillLevel: "advanced",
  preferredStackBehavior: "prefer_saved",
  preferredStack: { frontend: "Next.js" },
  codingStyle: { testing: "test_first" },
  deploymentPreference: "cloudflare",
};

function putRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP_URL}/api/account/preferences`, {
    method: "PUT",
    headers: { "content-type": "application/json", origin: APP_URL, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("PUT /api/account/preferences", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "local";
    updatePreferences.mockClear().mockResolvedValue(preferences);
    createSupabaseAccountRepository.mockClear();
    getAuthenticatedContext
      .mockClear()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
  });

  it("is hidden in production and requires a session otherwise", async () => {
    runtimeState.appEnvironment = "production";
    const { PUT } = await import("./route");
    const production = await PUT(putRequest(preferences));
    expect(production.status).toBe(404);
    expect(getAuthenticatedContext).not.toHaveBeenCalled();

    runtimeState.appEnvironment = "local";
    getAuthenticatedContext.mockResolvedValue(null);
    const anonymous = await PUT(putRequest(preferences));
    expect(anonymous.status).toBe(401);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("allows only PUT and checks the origin", async () => {
    const route = await import("./route");
    for (const handler of [route.GET, route.POST, route.PATCH, route.DELETE]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("PUT");
    }

    const response = await route.PUT(putRequest(preferences, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("bounds and validates the complete preference set", async () => {
    const { PUT } = await import("./route");

    const malformed = await PUT(putRequest("{not json"));
    expect(malformed.status).toBe(422);

    const partial = await PUT(putRequest({ skillLevel: "advanced" }));
    expect(partial.status).toBe(422);

    const invalidCombination = await PUT(
      putRequest({ ...preferences, preferredStackBehavior: "ask" }),
    );
    expect(invalidCombination.status).toBe(422);

    const oversized = await PUT(
      putRequest({ ...preferences, preferredStack: { frontend: "a".repeat(64 * 1024) } }),
    );
    expect(oversized.status).toBe(413);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("writes the parsed complete value only for the session user", async () => {
    const { PUT } = await import("./route");

    const response = await PUT(putRequest(preferences));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createSupabaseAccountRepository).toHaveBeenCalledWith(supabaseClient);
    expect(updatePreferences).toHaveBeenCalledWith(USER_ID, preferences);
    expect(await response.json()).toEqual({ preferences });
  });

  it("normalises nested values and hides provider errors", async () => {
    const { PUT } = await import("./route");
    const normalised = await PUT(
      putRequest({ ...preferences, preferredStack: { frontend: "  Next.js  " } }),
    );
    expect(normalised.status).toBe(200);
    expect(updatePreferences).toHaveBeenLastCalledWith(USER_ID, {
      ...preferences,
      preferredStack: { frontend: "Next.js" },
    });

    updatePreferences.mockRejectedValue(new Error("connection reset: private data"));
    const failure = await PUT(putRequest(preferences));
    expect(failure.status).toBe(502);
    expect(await failure.json()).toEqual({ error: { code: "provider_error" } });
  });
});
