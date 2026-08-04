import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const APP_URL = "https://app.unseenprompt.test";
const supabaseClient = vi.hoisted(() => ({ marker: "supabase-client" }));
const runtimeState = vi.hoisted(() => ({ appEnvironment: "local" as "local" | "production" }));
const getAuthenticatedContext = vi.hoisted(() => vi.fn());
const createDraft = vi.hoisted(() => vi.fn());
const createDiscoveryRuntime = vi.hoisted(() => vi.fn(() => ({ createDraft })));

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

const draftResult = {
  draftId: "22222222-2222-4222-8222-222222222222",
  version: 2,
  status: "awaiting_confirmation",
  intent: {
    mode: "new_build",
    confidence: 0.9,
    rationale: "The request describes a new build.",
    detectedLanguage: "en",
  },
  replayed: false,
};

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP_URL}/api/composer/drafts`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_URL, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    schema: "unseenprompt.composer-draft-input",
    schemaVersion: 1,
    initialRequestText: "Build a multilingual field notebook.",
    idempotencyKey: "composer-key-1",
    ...overrides,
  };
}

describe("POST /api/composer/drafts", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "local";
    getAuthenticatedContext
      .mockReset()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
    createDiscoveryRuntime.mockClear();
    createDraft.mockReset().mockResolvedValue(draftResult);
  });

  it("closes the surface in production before authentication", async () => {
    runtimeState.appEnvironment = "production";
    const { POST } = await import("./route");

    const response = await POST(postRequest(validBody()));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
  });

  it("requires authoritative authentication", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(postRequest(validBody()));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "auth_required" } });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("hides method availability from production and anonymous callers", async () => {
    const { GET, PUT, PATCH, DELETE } = await import("./route");

    for (const handler of [GET, PUT, PATCH, DELETE]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(await response.json()).toEqual({ error: { code: "validation_failed" } });
    }
  });

  it("enforces origin, content type, size, UTF-8, and strict schema", async () => {
    const { POST } = await import("./route");

    expect((await POST(postRequest(validBody(), { origin: "https://evil.example" }))).status).toBe(
      403,
    );
    expect((await POST(postRequest(validBody(), { "content-type": "text/plain" }))).status).toBe(
      422,
    );
    expect(
      (await POST(postRequest(validBody({ initialRequestText: "a".repeat(64 * 1024) })))).status,
    ).toBe(413);
    const invalidUtf8 = new Request(`${APP_URL}/api/composer/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP_URL },
      body: new Uint8Array([0xc3, 0x28]),
    });
    expect((await POST(invalidUtf8)).status).toBe(422);
    expect((await POST(postRequest({ ...validBody(), ownerId: USER_ID }))).status).toBe(422);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("returns the direct service DTO, forwards identity-safe input, and supports replay", async () => {
    const { POST } = await import("./route");
    const request = postRequest(validBody());

    const first = await POST(request);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(draftResult);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    expect(createDiscoveryRuntime).toHaveBeenCalledWith(supabaseClient);
    expect(createDraft).toHaveBeenCalledWith({
      initialRequestText: validBody().initialRequestText,
      idempotencyKey: validBody().idempotencyKey,
      signal: request.signal,
      deadlineMs: 30_000,
    });

    createDraft.mockResolvedValueOnce({ ...draftResult, replayed: true });
    const replay = await POST(postRequest(validBody()));
    expect(replay.status).toBe(200);
    expect((await replay.json()) as { readonly replayed?: unknown }).toMatchObject({
      replayed: true,
    });
  });

  it("maps stable service failures without leaking provider detail", async () => {
    createDraft.mockRejectedValue(new Error("provider payload: secret prompt"));
    const { POST } = await import("./route");

    const providerFailure = await POST(postRequest(validBody()));
    expect(providerFailure.status).toBe(502);
    expect(await providerFailure.json()).toEqual({ error: { code: "provider_error" } });

    createDraft.mockRejectedValue({ code: "provider_unavailable", message: "private DNS" });
    const unavailable = await POST(postRequest(validBody({ idempotencyKey: "composer-key-2" })));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: { code: "provider_unavailable" } });
  });
});
