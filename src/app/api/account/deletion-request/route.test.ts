import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const APP_URL = "https://app.unseenprompt.test";
const REQUESTED_AT = "2026-08-01T10:00:00.000Z";

const runtimeState = vi.hoisted(() => ({ appEnvironment: "local" as "local" | "production" }));
const supabaseClient = vi.hoisted(() => ({ marker: "supabase-client" }));
const getAuthenticatedContext = vi.hoisted(() =>
  vi.fn(async (): Promise<{ user: { id: string }; supabase: unknown } | null> => ({
    user: { id: USER_ID },
    supabase: supabaseClient,
  })),
);
const requestDeletion = vi.hoisted(() => vi.fn(async () => REQUESTED_AT));
const cancelDeletion = vi.hoisted(() => vi.fn(async () => undefined));
const createSupabaseAccountRepository = vi.hoisted(() =>
  vi.fn(() => ({ requestDeletion, cancelDeletion })),
);

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

function mutationRequest(method: "POST" | "DELETE", body = "{}", origin = APP_URL): Request {
  return new Request(`${APP_URL}/api/account/deletion-request`, {
    method,
    headers: { "content-type": "application/json", origin },
    body,
  });
}

describe("/api/account/deletion-request", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "local";
    getAuthenticatedContext
      .mockClear()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
    requestDeletion.mockClear().mockResolvedValue(REQUESTED_AT);
    cancelDeletion.mockClear().mockResolvedValue(undefined);
    createSupabaseAccountRepository.mockClear();
  });

  it("returns 404 in production before authenticating", async () => {
    runtimeState.appEnvironment = "production";
    const route = await import("./route");

    for (const response of [
      await route.POST(mutationRequest("POST")),
      await route.DELETE(mutationRequest("DELETE")),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: "not_found" } });
    }
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const route = await import("./route");

    expect((await route.POST(mutationRequest("POST"))).status).toBe(401);
    expect((await route.DELETE(mutationRequest("DELETE"))).status).toBe(401);
    expect(requestDeletion).not.toHaveBeenCalled();
    expect(cancelDeletion).not.toHaveBeenCalled();
  });

  it("returns 405 with both allowed methods for every other method", async () => {
    const route = await import("./route");

    for (const handler of [route.GET, route.PUT, route.PATCH]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST, DELETE");
      expect(await response.json()).toEqual({ error: { code: "validation_failed" } });
    }
  });

  it("rejects bad origins before reading or writing", async () => {
    const route = await import("./route");

    expect((await route.POST(mutationRequest("POST", "{}", "https://evil.example"))).status).toBe(
      403,
    );
    expect(
      (await route.DELETE(mutationRequest("DELETE", "{}", "https://evil.example"))).status,
    ).toBe(403);
    expect(requestDeletion).not.toHaveBeenCalled();
    expect(cancelDeletion).not.toHaveBeenCalled();
  });

  it("rejects oversized and non-empty bodies", async () => {
    const route = await import("./route");

    expect(
      (await route.POST(mutationRequest("POST", `{"padding":"${"a".repeat(65_536)}"}`))).status,
    ).toBe(413);
    expect((await route.POST(mutationRequest("POST", '{"ownerId":"someone-else"}'))).status).toBe(
      422,
    );
    expect((await route.DELETE(mutationRequest("DELETE", "not-json"))).status).toBe(422);
  });

  it("creates an idempotent request for the session user", async () => {
    const { POST } = await import("./route");

    const first = await POST(mutationRequest("POST"));
    const second = await POST(mutationRequest("POST"));

    expect(await first.json()).toEqual({ deletionRequestedAt: REQUESTED_AT });
    expect(await second.json()).toEqual({ deletionRequestedAt: REQUESTED_AT });
    expect(requestDeletion).toHaveBeenNthCalledWith(1, USER_ID, expect.any(Date));
    expect(requestDeletion).toHaveBeenNthCalledWith(2, USER_ID, expect.any(Date));
  });

  it("cancels the request without deleting account data", async () => {
    const { DELETE } = await import("./route");

    const response = await DELETE(mutationRequest("DELETE"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deletionRequestedAt: null });
    expect(cancelDeletion).toHaveBeenCalledWith(USER_ID);
    expect(requestDeletion).not.toHaveBeenCalled();
  });

  it("returns a stable provider error", async () => {
    requestDeletion.mockRejectedValue(new Error("private provider detail"));
    const { POST } = await import("./route");

    const response = await POST(mutationRequest("POST"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "provider_error" } });
  });
});
