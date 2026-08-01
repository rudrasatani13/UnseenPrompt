import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountExportV1 } from "@/domain/account/export";

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
const buildAccountExport = vi.hoisted(() => vi.fn());
const createSupabaseAccountRepository = vi.hoisted(() => vi.fn(() => ({ buildAccountExport })));

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => ({
    APP_ENV: runtimeState.appEnvironment,
    NEXT_PUBLIC_APP_URL: APP_URL,
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  }),
}));
vi.mock("@/lib/supabase/require-user", () => ({ getAuthenticatedContext }));
vi.mock("@/lib/account/supabase-account-repository", () => ({
  createSupabaseAccountRepository,
}));

const accountExport: AccountExportV1 = {
  schema: "unseenprompt.account-export",
  schemaVersion: 1,
  generatedAt: "2026-08-01T12:00:00.000Z",
  profile: {
    id: USER_ID,
    displayName: "Ada",
    locale: "en",
    timeZone: "UTC",
    onboardingCompletedAt: "2026-08-01T10:00:00.000Z",
    deletionRequestedAt: null,
  },
  preferences: null,
  projects: [],
  requirements: [],
  decisions: [],
  milestones: [],
  projectEvents: [],
  promptVersions: [],
  projectPreferenceOverrides: [],
};

describe("GET /api/account/export", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "local";
    getAuthenticatedContext
      .mockClear()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
    buildAccountExport.mockReset().mockResolvedValue(accountExport);
    createSupabaseAccountRepository.mockClear();
  });

  it("returns 404 in production before authenticating", async () => {
    runtimeState.appEnvironment = "production";
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "auth_required" } });
    expect(buildAccountExport).not.toHaveBeenCalled();
  });

  it("streams a no-store JSON attachment for the session user", async () => {
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="unseenprompt-export.json"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual(accountExport);
    expect(buildAccountExport).toHaveBeenCalledWith(USER_ID);
  });

  it("returns a stable provider error without leaking details", async () => {
    buildAccountExport.mockRejectedValue(new Error("private provider detail"));
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(body)).toEqual({ error: { code: "provider_error" } });
    expect(body).not.toContain("private provider detail");
  });

  it("rejects every other method after authoritative authentication", async () => {
    const route = await import("./route");

    for (const handler of [route.POST, route.PUT, route.PATCH, route.DELETE]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      expect(await response.json()).toEqual({ error: { code: "validation_failed" } });
    }
  });
});
