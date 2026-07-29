import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeState = vi.hoisted(() => ({
  appEnvironment: "production",
  removeResult: "removed" as const,
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
    confirm: vi.fn(),
    remove: vi.fn(async () => runtimeState.removeResult),
  }),
}));

describe("POST /api/waitlist/remove", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "production";
    runtimeState.removeResult = "removed";
  });

  it("maps removed and already_removed to the same public shape", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://unseenprompt.com/api/waitlist/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "opaque-token" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ kind: "removed" });
  });
});
