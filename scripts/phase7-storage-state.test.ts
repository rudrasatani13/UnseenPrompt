import { describe, expect, it } from "vitest";

import { buildPhase7StorageState } from "../tests/e2e/phase7-storage-state";

const session = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "11111111-1111-4111-8111-111111111111" },
} as const;

describe("Phase 7 Playwright storage state", () => {
  it("writes a host/path cookie accepted by Playwright and scoped to the local app", () => {
    const state = buildPhase7StorageState("http://127.0.0.1:54321", session, 1_700_000_000_000);
    const [cookie] = state.cookies;

    expect(cookie).toEqual({
      name: "sb-127-auth-token",
      value: expect.stringContaining("base64-"),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
      expires: 1_700_003_600,
    });
    expect(cookie).not.toHaveProperty("url");
    expect(state.origins).toEqual([]);
  });
});
