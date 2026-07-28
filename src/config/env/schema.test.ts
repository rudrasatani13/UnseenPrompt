import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/config/env/schema";

describe("parseEnvironment", () => {
  it("accepts the committed local-development contract", () => {
    expect(
      parseEnvironment({
        APP_ENV: "local",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        RELEASE_SHA: "local",
      }),
    ).toEqual({
      APP_ENV: "local",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      RELEASE_SHA: "local",
      MAINTENANCE_MODE: "off",
    });
  });

  it("accepts a deployed release identifier", () => {
    expect(
      parseEnvironment({
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_URL: "https://staging.unseenprompt.com",
        RELEASE_SHA: "3546ac4f0c7c",
      }),
    ).toMatchObject({ APP_ENV: "staging", RELEASE_SHA: "3546ac4f0c7c" });
  });

  it("rejects an absent or malformed release identifier", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_URL: "https://staging.unseenprompt.com",
        RELEASE_SHA: undefined,
      }),
    ).toThrow(/RELEASE_SHA/);

    expect(() =>
      parseEnvironment({
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_URL: "https://staging.unseenprompt.com",
        RELEASE_SHA: "contains spaces",
      }),
    ).toThrow(/RELEASE_SHA/);
  });

  it("fails when a required value is absent", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "local",
        NEXT_PUBLIC_APP_URL: undefined,
        RELEASE_SHA: "local",
      }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("rejects unsupported environments and malformed URLs", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "prod",
        NEXT_PUBLIC_APP_URL: "unseenprompt.com",
        RELEASE_SHA: "local",
      }),
    ).toThrow();
  });

  it("rejects non-HTTP application URLs", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "production",
        NEXT_PUBLIC_APP_URL: "javascript:alert(1)",
        RELEASE_SHA: "local",
      }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("requires HTTPS in staging and production", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_URL: "http://staging.unseenprompt.com",
        RELEASE_SHA: "local",
      }),
    ).toThrow(/HTTPS/);
  });
});

describe("parseEnvironment maintenance contract", () => {
  const baseEnvironment = {
    APP_ENV: "local",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    RELEASE_SHA: "local",
  } as const;

  it("defaults an absent maintenance value to off", () => {
    expect(parseEnvironment({ ...baseEnvironment }).MAINTENANCE_MODE).toBe("off");
    expect(
      parseEnvironment({ ...baseEnvironment, MAINTENANCE_MODE: undefined }).MAINTENANCE_MODE,
    ).toBe("off");
  });

  it("preserves an explicit off value", () => {
    expect(parseEnvironment({ ...baseEnvironment, MAINTENANCE_MODE: "off" }).MAINTENANCE_MODE).toBe(
      "off",
    );
  });

  it("accepts an explicit on value", () => {
    expect(parseEnvironment({ ...baseEnvironment, MAINTENANCE_MODE: "on" }).MAINTENANCE_MODE).toBe(
      "on",
    );
  });

  it.each(["true", "1", "", "ON"])("rejects the unsupported value %o", (value) => {
    expect(() => parseEnvironment({ ...baseEnvironment, MAINTENANCE_MODE: value })).toThrow(
      /MAINTENANCE_MODE/,
    );
  });
});
