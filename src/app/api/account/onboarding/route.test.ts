import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OnboardingAnswers } from "@/domain/account/onboarding";

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
const completeOnboarding = vi.hoisted(() => vi.fn(async () => undefined));
const createSupabaseAccountRepository = vi.hoisted(() => vi.fn(() => ({ completeOnboarding })));

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

const answers: OnboardingAnswers = {
  displayName: "Ada",
  skillLevel: "beginner",
  preferredStackBehavior: "prefer_saved",
  preferredStack: { frontend: "Next.js" },
  codingStyle: { testing: "test_first" },
  deploymentPreference: "cloudflare",
  locale: "pt-BR",
  timeZone: "Asia/Kolkata",
};

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP_URL}/api/account/onboarding`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_URL, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/account/onboarding", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "local";
    completeOnboarding.mockClear().mockResolvedValue(undefined);
    createSupabaseAccountRepository.mockClear();
    getAuthenticatedContext
      .mockClear()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
  });

  it("returns a 404 envelope in production without authenticating", async () => {
    runtimeState.appEnvironment = "production";
    const { POST } = await import("./route");

    const response = await POST(postRequest(answers));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(postRequest(answers));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "auth_required" } });
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns 405 with an Allow header for every other method", async () => {
    const route = await import("./route");

    for (const handler of [route.GET, route.PUT, route.PATCH, route.DELETE]) {
      const response = await handler();

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(await response.json()).toEqual({ error: { code: "validation_failed" } });
    }
  });

  it("returns 403 for a cross-origin post", async () => {
    const { POST } = await import("./route");

    const response = await POST(postRequest(answers, { origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "bad_origin" } });
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns 413 for a body over 64 KiB", async () => {
    const { POST } = await import("./route");

    const oversized = JSON.stringify({
      ...answers,
      displayName: "a".repeat(64 * 1024 + 1),
    });

    const response = await POST(postRequest(oversized));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: { code: "validation_failed" } });
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns 413 when the declared content length is over the limit", async () => {
    const { POST } = await import("./route");

    const response = await POST(postRequest(answers, { "content-length": String(64 * 1024 + 1) }));

    expect(response.status).toBe(413);
  });

  it("returns 422 for a body that is not JSON", async () => {
    const { POST } = await import("./route");

    const response = await POST(postRequest("{not json"));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { code: "validation_failed" } });
  });

  it("returns 422 for answers that fail the schema", async () => {
    const { POST } = await import("./route");

    const response = await POST(postRequest({ ...answers, skillLevel: "wizard" }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { code: "validation_failed" } });
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns 422 when the payload carries an owner id of its own", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      postRequest({ ...answers, ownerId: "22222222-2222-4222-8222-222222222222" }),
    );

    expect(response.status).toBe(422);
  });

  it("writes the parsed answers for the session user and reports completion", async () => {
    const { POST } = await import("./route");

    const response = await POST(postRequest(answers));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "completed" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createSupabaseAccountRepository).toHaveBeenCalledWith(supabaseClient);
    expect(completeOnboarding).toHaveBeenCalledWith(USER_ID, answers);
  });

  it("converges when the same post is repeated", async () => {
    const { POST } = await import("./route");

    const first = await POST(postRequest(answers));
    const second = await POST(postRequest(answers));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(completeOnboarding).toHaveBeenNthCalledWith(1, USER_ID, answers);
    expect(completeOnboarding).toHaveBeenNthCalledWith(2, USER_ID, answers);
  });

  it("reports a provider failure without leaking its detail, leaving the post retryable", async () => {
    completeOnboarding.mockRejectedValue(new Error("supabase:upsert_preferences"));
    const { POST } = await import("./route");

    const response = await POST(postRequest(answers));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "provider_error" } });
  });

  it("accepts a same-origin post that omits the Origin header", async () => {
    const { POST } = await import("./route");

    const request = new Request(`${APP_URL}/api/account/onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answers),
    });

    expect((await POST(request)).status).toBe(200);
  });
});
