import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const DRAFT_ID = "22222222-2222-4222-8222-222222222222";
const APP_URL = "https://app.unseenprompt.test";
const supabaseClient = vi.hoisted(() => ({ marker: "supabase-client" }));
const runtimeState = vi.hoisted(() => ({ appEnvironment: "local" as "local" | "production" }));
const getAuthenticatedContext = vi.hoisted(() => vi.fn());
const executeDraftCommand = vi.hoisted(() => vi.fn());
const createDiscoveryRuntime = vi.hoisted(() => vi.fn(() => ({ executeDraftCommand })));

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => ({
    APP_ENV: runtimeState.appEnvironment,
    NEXT_PUBLIC_APP_URL: APP_URL,
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  }),
}));
vi.mock("@/lib/supabase/require-user", () => ({ getAuthenticatedContext }));
vi.mock("@/lib/discovery/runtime", () => ({ createDiscoveryRuntime }));

const receipt = {
  draftId: DRAFT_ID,
  version: 3,
  status: "promoted",
  projectId: "33333333-3333-4333-8333-333333333333",
  replayed: false,
};

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP_URL}/api/composer/drafts/${DRAFT_ID}/commands`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_URL, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    schema: "unseenprompt.composer-draft-command",
    schemaVersion: 1,
    draftId: DRAFT_ID,
    expectedVersion: 2,
    idempotencyKey: "draft-command-1",
    command: {
      type: "confirm_and_promote",
      confirmedMode: "new_build",
      confirmedTitle: "Field Notebook",
    },
    ...overrides,
  };
}

const context = { params: { draftId: DRAFT_ID } };

describe("POST /api/composer/drafts/[draftId]/commands", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "local";
    getAuthenticatedContext
      .mockReset()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
    createDiscoveryRuntime.mockClear();
    executeDraftCommand.mockReset().mockResolvedValue(receipt);
  });

  it("returns the production gate before authentication", async () => {
    runtimeState.appEnvironment = "production";
    const { POST } = await import("./route");

    const response = await POST(postRequest(validBody()), context);
    expect(response.status).toBe(404);
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
  });

  it("requires auth and gates every unsupported method", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const route = await import("./route");
    expect((await route.POST(postRequest(validBody()), context)).status).toBe(401);

    getAuthenticatedContext.mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
    for (const handler of [route.GET, route.PUT, route.PATCH, route.DELETE]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
  });

  it("rejects cross-origin, malformed, prototype-shaped, and path-mismatched commands", async () => {
    const { POST } = await import("./route");

    expect(
      (await POST(postRequest(validBody(), { origin: "https://evil.example" }), context)).status,
    ).toBe(403);
    expect(
      (
        await POST(
          postRequest({ ...validBody(), command: { type: "confirm_and_promote", __proto__: 1 } }),
          context,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await POST(
          postRequest({ ...validBody(), draftId: "44444444-4444-4444-8444-444444444444" }),
          context,
        )
      ).status,
    ).toBe(422);
    expect(
      (await POST(postRequest(validBody(), { "content-type": "text/plain" }), context)).status,
    ).toBe(422);
    expect(executeDraftCommand).not.toHaveBeenCalled();
  });

  it("forwards the strict envelope and returns the direct receipt, including replay", async () => {
    const { POST } = await import("./route");
    const body = validBody();
    const response = await POST(postRequest(body), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createDiscoveryRuntime).toHaveBeenCalledWith(supabaseClient);
    expect(executeDraftCommand).toHaveBeenCalledWith(body, {
      signal: expect.any(AbortSignal),
      deadlineMs: 30_000,
    });

    executeDraftCommand.mockResolvedValueOnce({ ...receipt, replayed: true });
    expect((await POST(postRequest(body), context)).status).toBe(200);
    expect((await POST(postRequest(body), context)).status).toBe(200);
  });

  it("maps stale/conflict and unknown provider errors safely", async () => {
    const { POST } = await import("./route");
    executeDraftCommand.mockRejectedValueOnce({ code: "stale_draft_version" });
    const stale = await POST(postRequest(validBody()), context);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: { code: "conflict" } });

    executeDraftCommand.mockRejectedValueOnce(new Error("supabase secret"));
    const unknown = await POST(
      postRequest(validBody({ idempotencyKey: "draft-command-2" })),
      context,
    );
    expect(unknown.status).toBe(502);
    expect(await unknown.json()).toEqual({ error: { code: "provider_error" } });
  });
});
