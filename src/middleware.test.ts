import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeState = vi.hoisted(() => ({
  appEnvironment: "local" as "local" | "production",
  user: null as User | null,
  refreshedCookie: null as string | null,
}));

const createProxySession = vi.hoisted(() =>
  vi.fn(async () => {
    const response = NextResponse.next();

    if (runtimeState.refreshedCookie) {
      response.cookies.set("sb-auth-token", runtimeState.refreshedCookie);
      response.headers.set(
        "cache-control",
        "private, no-cache, no-store, must-revalidate, max-age=0",
      );
      response.headers.set("expires", "0");
      response.headers.set("pragma", "no-cache");
    }

    return { response, user: runtimeState.user };
  }),
);

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => ({
    APP_ENV: runtimeState.appEnvironment,
    NEXT_PUBLIC_APP_URL: "https://unseenprompt.com",
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  }),
}));

vi.mock("@/lib/supabase/proxy-session", () => ({ createProxySession }));

const signedInUser = { id: "11111111-1111-4111-8111-111111111111" } as User;

function requestFor(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "https://unseenprompt.com"));
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    createProxySession.mockClear();
    runtimeState.appEnvironment = "local";
    runtimeState.user = null;
    runtimeState.refreshedCookie = null;
  });

  it("redirects a sessionless request for a protected path to sign-in with the return path", async () => {
    const { middleware } = await import("./middleware");
    const response = await middleware(requestFor("/profile"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://unseenprompt.com/sign-in?next=%2Fprofile",
    );
  });

  it("protects the home composer and project pages while APIs keep JSON auth semantics", async () => {
    const { middleware } = await import("./middleware");

    const homeResponse = await middleware(requestFor("/"));
    const projectResponse = await middleware(requestFor("/projects/project-1/discovery"));

    expect(homeResponse.headers.get("location")).toBe("https://unseenprompt.com/sign-in?next=%2F");
    expect(projectResponse.headers.get("location")).toBe(
      "https://unseenprompt.com/sign-in?next=%2Fprojects%2Fproject-1%2Fdiscovery",
    );
  });

  it("lets a sessionless request reach the anonymous sign-in page", async () => {
    const { middleware } = await import("./middleware");
    const request = requestFor("/sign-in");
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(createProxySession).toHaveBeenCalledWith(request, "local");
  });

  it("redirects an authenticated visitor away from sign-in", async () => {
    runtimeState.user = signedInUser;

    const { middleware } = await import("./middleware");
    const response = await middleware(requestFor("/sign-in"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://unseenprompt.com/");
  });

  it("passes an authenticated request for a protected path straight through", async () => {
    runtimeState.user = signedInUser;

    const { middleware } = await import("./middleware");
    const response = await middleware(requestFor("/profile"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("exits immediately in production without constructing a Supabase client", async () => {
    runtimeState.appEnvironment = "production";

    const { middleware } = await import("./middleware");
    const response = await middleware(requestFor("/profile"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(createProxySession).not.toHaveBeenCalled();
  });

  it("carries refreshed session cookies and cache suppression onto the redirect", async () => {
    runtimeState.user = signedInUser;
    runtimeState.refreshedCookie = "rotated-token";

    const { middleware } = await import("./middleware");
    const response = await middleware(requestFor("/sign-in"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://unseenprompt.com/");
    expect(response.cookies.get("sb-auth-token")?.value).toBe("rotated-token");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("matches only the authenticated surface, leaving waitlist and health untouched", async () => {
    const { config } = await import("./middleware");

    expect(config.matcher).toEqual([
      "/",
      "/sign-in",
      "/onboarding",
      "/profile",
      "/projects/:path*",
      "/api/account/:path*",
      "/auth/sign-out",
    ]);
  });
});
