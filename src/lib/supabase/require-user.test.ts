import type { SupabaseClient, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

const authState = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

const clientStub = vi.hoisted(
  () => ({ auth: { getUser: authState.getUser } }) as unknown as SupabaseClient<Database>,
);

vi.mock("@/lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(async () => clientStub),
}));

const user = { id: "11111111-1111-4111-8111-111111111111" } as User;

describe("getAuthenticatedContext", () => {
  beforeEach(() => {
    vi.resetModules();
    authState.getUser.mockReset();
  });

  it("returns null when the request carries no session", async () => {
    authState.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { getAuthenticatedContext } = await import("./require-user");

    expect(await getAuthenticatedContext()).toBeNull();
  });

  it("returns null when getUser reports an expired or tampered token", async () => {
    authState.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", message: "invalid claim: missing sub claim" },
    });

    const { getAuthenticatedContext } = await import("./require-user");

    expect(await getAuthenticatedContext()).toBeNull();
  });

  it("returns the user alongside the same client instance that validated it", async () => {
    authState.getUser.mockResolvedValue({ data: { user }, error: null });

    const { getAuthenticatedContext } = await import("./require-user");
    const context = await getAuthenticatedContext();

    expect(context?.user).toBe(user);
    expect(context?.supabase).toBe(clientStub);
  });

  it("never throws for authentication failures", async () => {
    authState.getUser.mockRejectedValue(new Error("network unreachable"));

    const { getAuthenticatedContext } = await import("./require-user");

    await expect(getAuthenticatedContext()).resolves.toBeNull();
  });
});

describe("supabase client module boundaries", () => {
  it("keeps server modules server-only and the proxy bridge free of the marker", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

    expect(read("src/lib/supabase/server-client.ts")).toMatch(/import ["']server-only["']/);
    expect(read("src/lib/supabase/require-user.ts")).toMatch(/import ["']server-only["']/);
    expect(read("src/lib/supabase/browser-client.ts")).not.toMatch(/import ["']server-only["']/);
    expect(read("src/lib/supabase/proxy-session.ts")).not.toMatch(/import ["']server-only["']/);
  });
});
