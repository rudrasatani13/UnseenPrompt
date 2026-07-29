import { describe, expect, it } from "vitest";

import { parseWaitlistEnvironment } from "@/config/waitlist/schema";

const valid = {
  turnstileSiteKey: "1x00000000000000000000AA",
  turnstileSecretKey: "1x0000000000000000000000000000000AA",
  supabaseUrl: "https://waitlist.invalid",
  supabaseSecretKey: "sb_secret_local_test_value_000000000000",
  resendApiKey: "re_local_test_value_0000000000000000",
  tokenSecret: "local_test_token_secret_0000000000000000",
  fromEmail: "UnseenPrompt <hello@unseenprompt.com>" as const,
  appUrl: "https://unseenprompt.com",
};

describe("parseWaitlistEnvironment", () => {
  it("accepts production HTTPS configuration with long secrets", () => {
    const environment = parseWaitlistEnvironment(valid);

    expect(environment.turnstileSiteKey).toBe(valid.turnstileSiteKey);
    expect(environment.fromEmail).toBe("UnseenPrompt <hello@unseenprompt.com>");
    expect(environment.appUrl.href).toBe("https://unseenprompt.com/");
  });

  it("rejects missing values", () => {
    expect(() =>
      parseWaitlistEnvironment({
        ...valid,
        turnstileSecretKey: undefined,
      }),
    ).toThrow(/Invalid waitlist environment/);
  });

  it("rejects secrets shorter than 32 characters", () => {
    expect(() =>
      parseWaitlistEnvironment({
        ...valid,
        tokenSecret: "too-short",
      }),
    ).toThrow(/at least 32 characters/);
  });

  it("rejects non-HTTPS application URLs", () => {
    expect(() =>
      parseWaitlistEnvironment({
        ...valid,
        appUrl: "http://unseenprompt.com",
      }),
    ).toThrow(/HTTPS/i);
  });

  it("rejects non-HTTPS Supabase URLs", () => {
    expect(() =>
      parseWaitlistEnvironment({
        ...valid,
        supabaseUrl: "http://waitlist.invalid",
      }),
    ).toThrow(/HTTPS/i);
  });

  it("never includes secret values in error messages", () => {
    const secret = "super_secret_value_that_must_not_leak_0001";

    try {
      parseWaitlistEnvironment({
        ...valid,
        tokenSecret: "short",
        resendApiKey: secret,
      });
      expect.unreachable("expected parse to throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
      expect(message).not.toContain("short");
    }
  });

  it("rejects incorrect from-email literals", () => {
    expect(() =>
      parseWaitlistEnvironment({
        ...valid,
        fromEmail: "Other <other@example.com>",
      }),
    ).toThrow(/Invalid waitlist environment/);
  });
});

describe("waitlist server module isolation", () => {
  it("imports server-only", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "src/config/waitlist/server.ts"), "utf8");

    expect(source).toMatch(/import ["']server-only["']/);
  });
});
