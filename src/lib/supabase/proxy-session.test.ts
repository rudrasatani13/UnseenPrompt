import type { CookieOptions, SetAllCookies } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

interface CookieAdapter {
  getAll: () => { name: string; value: string }[];
  setAll: SetAllCookies;
}

const bridge = vi.hoisted(() => ({
  cookies: null as CookieAdapter | null,
  getUser: vi.fn(),
}));

const createServerClient = vi.hoisted(() =>
  vi.fn((_url: string, _key: string, options: { cookies: CookieAdapter }) => {
    bridge.cookies = options.cookies;

    return { auth: { getUser: bridge.getUser } } as unknown as SupabaseClient<Database>;
  }),
);

vi.mock("@supabase/ssr", () => ({ createServerClient }));

const user = { id: "11111111-1111-4111-8111-111111111111" } as User;

const NO_STORE = "private, no-cache, no-store, must-revalidate, max-age=0";
const CACHE_SUPPRESSION = {
  "Cache-Control": NO_STORE,
  Expires: "0",
  Pragma: "no-cache",
};

const rotatedCookies: { name: string; value: string; options: CookieOptions }[] = [
  { name: "sb-access-token", value: "rotated-access", options: { path: "/" } },
  { name: "sb-refresh-token", value: "rotated-refresh", options: { path: "/" } },
];

function requestWithCookies(cookies: Record<string, string> = {}): NextRequest {
  const request = new NextRequest(new URL("/profile", "https://unseenprompt.com"));

  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }

  return request;
}

/** Resolves a session with no user unless a test opts into a refresh or a signed-in user. */
function resolveWithoutRefresh(): void {
  bridge.getUser.mockResolvedValue({ data: { user: null }, error: null });
}

/** Mirrors real `@supabase/ssr` behavior: the refresh writes cookies before `getUser` resolves. */
function refreshDuringGetUser(result: { data: { user: User | null }; error: unknown }): void {
  bridge.getUser.mockImplementation(async () => {
    bridge.cookies?.setAll(rotatedCookies, CACHE_SUPPRESSION);
    return result;
  });
}

describe("createProxySession", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerClient.mockClear();
    bridge.cookies = null;
    bridge.getUser.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_local_test_value_000000000");
  });

  it("exposes the request cookies through the adapter's getAll", async () => {
    resolveWithoutRefresh();

    const { createProxySession } = await import("./proxy-session");
    const request = requestWithCookies({ "sb-access-token": "stored", theme: "dark" });

    await createProxySession(request, "local");

    expect(bridge.cookies?.getAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sb-access-token", value: "stored" }),
        expect.objectContaining({ name: "theme", value: "dark" }),
      ]),
    );
  });

  it("mirrors setAll onto the request so the rest of the pipeline reads refreshed tokens", async () => {
    refreshDuringGetUser({ data: { user }, error: null });

    const { createProxySession } = await import("./proxy-session");
    const request = requestWithCookies({ "sb-access-token": "stale" });

    await createProxySession(request, "local");

    expect(request.cookies.get("sb-access-token")?.value).toBe("rotated-access");
    expect(request.cookies.get("sb-refresh-token")?.value).toBe("rotated-refresh");
  });

  it("mirrors setAll onto the response as Set-Cookie plus the cache-suppression headers", async () => {
    refreshDuringGetUser({ data: { user }, error: null });

    const { createProxySession } = await import("./proxy-session");
    const { response } = await createProxySession(requestWithCookies(), "local");

    expect(response.cookies.get("sb-access-token")?.value).toBe("rotated-access");
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("rotated-refresh");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sb-access-token=rotated-access");
    expect(setCookie).toContain("sb-refresh-token=rotated-refresh");

    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("returns the response rebuilt by setAll rather than the one created before the refresh", async () => {
    refreshDuringGetUser({ data: { user }, error: null });

    const { createProxySession } = await import("./proxy-session");
    const request = requestWithCookies({ "sb-access-token": "stale" });
    const { response } = await createProxySession(request, "local");

    /*
     * The rebuilt response is constructed from the already-mutated request, so its
     * `x-middleware-request-cookie` header carries the rotated value. A returned response
     * captured before `setAll` ran would still advertise the stale cookie.
     */
    expect(response.headers.get("x-middleware-request-cookie")).toContain("rotated-access");
    expect(response.headers.get("x-middleware-request-cookie")).not.toContain("stale");
  });

  it("returns the authenticated user reported by getUser", async () => {
    bridge.getUser.mockResolvedValue({ data: { user }, error: null });

    const { createProxySession } = await import("./proxy-session");
    const session = await createProxySession(requestWithCookies(), "local");

    expect(session.user).toBe(user);
  });

  it("returns a null user when getUser reports an expired or tampered token", async () => {
    bridge.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", message: "invalid claim: missing sub claim" },
    });

    const { createProxySession } = await import("./proxy-session");
    const session = await createProxySession(requestWithCookies(), "local");

    expect(session.user).toBeNull();
  });

  it("builds the client from the client-safe public Supabase configuration", async () => {
    resolveWithoutRefresh();

    const { createProxySession } = await import("./proxy-session");
    await createProxySession(requestWithCookies(), "local");

    expect(createServerClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "sb_publishable_local_test_value_000000000",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
  });
});
