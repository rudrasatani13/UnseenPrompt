import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeState = vi.hoisted(() => ({
  appEnvironment: "test",
  workflowAvailable: true,
}));

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => ({
    APP_ENV: runtimeState.appEnvironment,
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    RELEASE_SHA: "test-release",
  }),
}));

vi.mock("@/lib/cloudflare/context", () => ({
  getRuntimeBindings: () => ({
    version: "local",
    workflow: runtimeState.workflowAvailable ? {} : undefined,
  }),
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "test";
    runtimeState.workflowAvailable = true;
  });

  it("returns a non-sensitive runtime readiness payload", async () => {
    const { GET } = await import("./route");
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      checks: { runtime: "ok", workflowBinding: "ok" },
      environment: "test",
      release: "test-release",
      service: "unseenprompt",
      status: "ok",
      version: "local",
    });
  });

  it("never serializes secret material", async () => {
    const { GET } = await import("./route");
    const response = GET();
    const serialized = JSON.stringify(await response.json());

    for (const secretName of [
      "HEALTHCHECK_TOKEN",
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
    ]) {
      expect(serialized).not.toContain(secretName);
    }
  });

  it("treats the intentionally unbound preview Workflow as ready", async () => {
    runtimeState.appEnvironment = "preview";
    runtimeState.workflowAvailable = false;
    const { GET } = await import("./route");

    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      checks: { runtime: "ok", workflowBinding: "not_configured" },
      status: "ok",
    });
  });
});
