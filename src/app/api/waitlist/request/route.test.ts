import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeState = vi.hoisted(() => ({
  appEnvironment: "production",
  requestResult: { kind: "accepted" as const },
}));

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => ({
    APP_ENV: runtimeState.appEnvironment,
    NEXT_PUBLIC_APP_URL: "https://unseenprompt.com",
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  }),
}));

vi.mock("@/lib/waitlist/runtime", () => ({
  getProductionWaitlistService: () => ({
    request: vi.fn(async () => runtimeState.requestResult),
    confirm: vi.fn(),
    remove: vi.fn(),
  }),
}));

function jsonRequest(body: unknown, init?: RequestInit): Request {
  return new Request("https://unseenprompt.com/api/waitlist/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
    ...init,
  });
}

describe("POST /api/waitlist/request", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "production";
    runtimeState.requestResult = { kind: "accepted" };
  });

  it("returns 404 outside production", async () => {
    runtimeState.appEnvironment = "staging";
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest({
        email: "a@b.co",
        turnstileToken: "token",
        requestId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    );
    expect(response.status).toBe(404);
  });

  it("accepts a valid production request", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest({
        email: "a@b.co",
        turnstileToken: "token",
        requestId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({ kind: "accepted" });
  });

  it("rejects non-JSON, oversized bodies, and non-POST methods", async () => {
    const { POST, GET } = await import("./route");

    const nonJson = await POST(
      new Request("https://unseenprompt.com/api/waitlist/request", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "x",
      }),
    );
    expect(nonJson.status).toBe(400);

    const oversized = await POST(
      new Request("https://unseenprompt.com/api/waitlist/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a".repeat(5000), turnstileToken: "t", requestId: "x" }),
      }),
    );
    expect(oversized.status).toBe(400);

    const get = GET();
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
  });

  it("maps verification_failed to 403 and temporary_failure to 503", async () => {
    runtimeState.requestResult = { kind: "verification_failed" } as never;
    let { POST } = await import("./route");
    let response = await POST(
      jsonRequest({
        email: "a@b.co",
        turnstileToken: "token",
        requestId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    );
    expect(response.status).toBe(403);

    vi.resetModules();
    runtimeState.requestResult = { kind: "temporary_failure" } as never;
    ({ POST } = await import("./route"));
    response = await POST(
      jsonRequest({
        email: "a@b.co",
        turnstileToken: "token",
        requestId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    );
    expect(response.status).toBe(503);
  });
});
