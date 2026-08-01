import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeState = vi.hoisted(() => ({
  appEnvironment: "local" as "local" | "production",
  user: null as User | null,
}));

const signOut = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => ({
    APP_ENV: runtimeState.appEnvironment,
    NEXT_PUBLIC_APP_URL: "https://app.unseenprompt.test",
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  }),
}));

vi.mock("@/lib/supabase/require-user", () => ({
  getAuthenticatedContext: vi.fn(async () =>
    runtimeState.user ? { user: runtimeState.user, supabase: { auth: { signOut } } } : null,
  ),
}));

const signedInUser = { id: "11111111-1111-4111-8111-111111111111" } as User;

function signOutRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://app.unseenprompt.test/auth/sign-out", { method: "POST", headers });
}

describe("POST /auth/sign-out", () => {
  beforeEach(() => {
    vi.resetModules();
    signOut.mockClear();
    runtimeState.appEnvironment = "local";
    runtimeState.user = signedInUser;
  });

  it("returns a 404 envelope in production", async () => {
    runtimeState.appEnvironment = "production";
    const { POST } = await import("./route");

    const response = await POST(signOutRequest());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("rejects non-POST methods with 405", async () => {
    const { GET, PUT, DELETE } = await import("./route");

    for (const handler of [GET, PUT, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(await response.json()).toEqual({ error: { code: "validation_failed" } });
    }
  });

  it("hides the route from non-POST methods in production", async () => {
    runtimeState.appEnvironment = "production";
    const { GET, PUT, DELETE } = await import("./route");

    for (const handler of [GET, PUT, DELETE]) {
      const response = handler();
      expect(response.status).toBe(404);
      expect(response.headers.get("allow")).toBeNull();
      expect(await response.json()).toEqual({ error: { code: "not_found" } });
    }
  });

  it("rejects a mismatched Origin header with 403", async () => {
    const { POST } = await import("./route");

    const response = await POST(signOutRequest({ origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "bad_origin" } });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("accepts a matching Origin header and a request with no Origin header", async () => {
    const { POST } = await import("./route");

    const matching = await POST(signOutRequest({ origin: "https://app.unseenprompt.test" }));
    expect(matching.status).toBe(303);

    const absent = await POST(signOutRequest());
    expect(absent.status).toBe(303);
  });

  it("returns 401 when the request carries no session", async () => {
    runtimeState.user = null;
    const { POST } = await import("./route");

    const response = await POST(signOutRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "auth_required" } });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs the user out and redirects 303 to sign-in", async () => {
    const { POST } = await import("./route");

    const response = await POST(signOutRequest());

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.unseenprompt.test/sign-in");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("still redirects when Supabase reports a sign-out failure", async () => {
    signOut.mockResolvedValueOnce({ error: { message: "session already revoked" } } as never);
    const { POST } = await import("./route");

    const response = await POST(signOutRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.unseenprompt.test/sign-in");
  });
});
