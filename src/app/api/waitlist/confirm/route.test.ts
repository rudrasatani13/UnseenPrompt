import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeState = vi.hoisted(() => ({
  appEnvironment: "production",
  confirmResult: "confirmed" as const,
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
    request: vi.fn(),
    confirm: vi.fn(async () => runtimeState.confirmResult),
    remove: vi.fn(),
  }),
}));

describe("POST /api/waitlist/confirm", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "production";
    runtimeState.confirmResult = "confirmed";
  });

  it("maps confirmed and already_confirmed to the same public shape", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://unseenprompt.com/api/waitlist/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "opaque-token" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "confirmed" });

    vi.resetModules();
    runtimeState.confirmResult = "already_confirmed" as never;
    const reimported = await import("./route");
    const again = await reimported.POST(
      new Request("https://unseenprompt.com/api/waitlist/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "opaque-token" }),
      }),
    );
    expect(await again.json()).toEqual({ kind: "confirmed" });
  });

  it("returns 404 outside production", async () => {
    runtimeState.appEnvironment = "local";
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://unseenprompt.com/api/waitlist/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "opaque-token" }),
      }),
    );
    expect(response.status).toBe(404);
  });
});
