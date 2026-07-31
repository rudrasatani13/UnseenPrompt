import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

const createBrowserClient = vi.hoisted(() =>
  vi.fn(() => ({ auth: {} }) as unknown as SupabaseClient<Database>),
);

vi.mock("@supabase/ssr", () => ({ createBrowserClient }));

describe("getSupabaseBrowserClient", () => {
  beforeEach(() => {
    vi.resetModules();
    createBrowserClient.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_browser_test_000000000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("constructs the client once and returns the same instance on every call", async () => {
    const { getSupabaseBrowserClient } = await import("./browser-client");

    const first = getSupabaseBrowserClient();
    const second = getSupabaseBrowserClient();

    expect(second).toBe(first);
    expect(createBrowserClient).toHaveBeenCalledTimes(1);
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "sb_publishable_browser_test_000000000",
    );
  });
});
