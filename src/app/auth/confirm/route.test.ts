import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeState = vi.hoisted(() => ({
  appEnvironment: "local" as "local" | "production",
  verifyResult: { error: null } as { error: { message: string } | null },
}));

const verifyOtp = vi.hoisted(() =>
  vi.fn(async () => ({ data: {}, error: runtimeState.verifyResult.error })),
);

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => ({
    APP_ENV: runtimeState.appEnvironment,
    NEXT_PUBLIC_APP_URL: "https://app.unseenprompt.test",
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  }),
}));

vi.mock("@/lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { verifyOtp } })),
}));

function confirmRequest(query: string): Request {
  return new Request(`https://app.unseenprompt.test/auth/confirm${query}`);
}

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.resetModules();
    verifyOtp.mockClear();
    runtimeState.appEnvironment = "local";
    runtimeState.verifyResult = { error: null };
  });

  it("returns a 404 envelope in production without touching Supabase", async () => {
    runtimeState.appEnvironment = "production";
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to the stable failure code when token_hash is missing", async () => {
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?type=email"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to the stable failure code when type is not an email OTP", async () => {
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=recovery"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to the stable failure code for an invalid or expired token", async () => {
    runtimeState.verifyResult = { error: { message: "Token has expired or is invalid" } };
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=stale&type=email&next=%2Fprofile"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
  });

  it("redirects to the stable failure code when verification throws", async () => {
    verifyOtp.mockRejectedValueOnce(new Error("network unreachable"));
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email"));

    expect(response.headers.get("location")).toBe(
      "https://app.unseenprompt.test/sign-in?error=magic_link_invalid",
    );
  });

  it("verifies the token hash as an email OTP and redirects to the validated next path", async () => {
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email&next=%2Fprofile"));

    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.unseenprompt.test/profile");
  });

  it("falls back to the root path when next is hostile or absent", async () => {
    const { GET } = await import("./route");

    const hostile = await GET(confirmRequest("?token_hash=abc&type=email&next=https%3A%2F%2Fevil"));
    expect(hostile.headers.get("location")).toBe("https://app.unseenprompt.test/");

    const absent = await GET(confirmRequest("?token_hash=abc&type=email"));
    expect(absent.headers.get("location")).toBe("https://app.unseenprompt.test/");
  });

  it("marks the redirect uncacheable", async () => {
    const { GET } = await import("./route");

    const response = await GET(confirmRequest("?token_hash=abc&type=email"));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
