import { describe, expect, it } from "vitest";

import { parseSupabasePublicEnvironment } from "@/config/supabase/schema";

const localValues = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_value_000000000000",
};

const stagingValues = {
  NEXT_PUBLIC_SUPABASE_URL: "https://staging-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging_value_000000000000",
};

describe("parseSupabasePublicEnvironment", () => {
  it("accepts the committed local defaults over HTTP", () => {
    expect(parseSupabasePublicEnvironment(localValues, "local")).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "sb_publishable_local_test_value_000000000000",
    });
  });

  it("accepts the same local defaults under the test environment", () => {
    expect(parseSupabasePublicEnvironment(localValues, "test").supabaseUrl).toBe(
      "http://127.0.0.1:54321",
    );
  });

  it("accepts an HTTPS project URL in staging", () => {
    expect(parseSupabasePublicEnvironment(stagingValues, "staging")).toEqual({
      supabaseUrl: "https://staging-project.supabase.co",
      supabasePublishableKey: "sb_publishable_staging_value_000000000000",
    });
  });

  it.each(["staging", "production"] as const)("rejects an HTTP project URL in %s", (appEnv) => {
    expect(() =>
      parseSupabasePublicEnvironment(
        { ...stagingValues, NEXT_PUBLIC_SUPABASE_URL: "http://staging-project.supabase.co" },
        appEnv,
      ),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL: HTTPS is required in staging and production/);
  });

  it("rejects a malformed project URL", () => {
    expect(() =>
      parseSupabasePublicEnvironment(
        { ...localValues, NEXT_PUBLIC_SUPABASE_URL: "127.0.0.1:54321" },
        "local",
      ),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("rejects a pasted secret key", () => {
    const secret = "sb_secret_local_test_value_000000000000";

    expect(() =>
      parseSupabasePublicEnvironment(
        { ...localValues, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret },
        "local",
      ),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable key must not be a secret key/);
  });

  it("never includes the rejected key value in the failure message", () => {
    const secret = "sb_secret_value_that_must_not_leak_0001";

    try {
      parseSupabasePublicEnvironment(
        { ...localValues, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret },
        "local",
      );
      expect.unreachable("expected parse to throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
    }
  });

  it("rejects an empty publishable key", () => {
    expect(() =>
      parseSupabasePublicEnvironment(
        { ...localValues, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
        "local",
      ),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("rejects a publishable key longer than 255 characters", () => {
    expect(() =>
      parseSupabasePublicEnvironment(
        { ...localValues, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "a".repeat(256) },
        "local",
      ),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable key is too long/);
  });

  it("rejects missing values", () => {
    expect(() =>
      parseSupabasePublicEnvironment(
        {
          NEXT_PUBLIC_SUPABASE_URL: undefined,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
        },
        "local",
      ),
    ).toThrow(/Invalid Supabase public environment/);
  });
});

describe("supabase config module isolation", () => {
  it("keeps the server accessor server-only and the public accessor client-safe", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const serverSource = readFileSync(join(process.cwd(), "src/config/supabase/server.ts"), "utf8");
    const publicSource = readFileSync(join(process.cwd(), "src/config/supabase/public.ts"), "utf8");

    expect(serverSource).toMatch(/import ["']server-only["']/);
    expect(publicSource).not.toMatch(/import ["']server-only["']/);
  });
});
