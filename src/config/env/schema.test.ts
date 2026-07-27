import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/config/env/schema";

describe("parseEnvironment", () => {
  it("accepts the committed local-development contract", () => {
    expect(
      parseEnvironment({
        APP_ENV: "local",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      }),
    ).toEqual({
      APP_ENV: "local",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
  });

  it("fails when a required value is absent", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "local",
        NEXT_PUBLIC_APP_URL: undefined,
      }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("rejects unsupported environments and malformed URLs", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "prod",
        NEXT_PUBLIC_APP_URL: "unseenprompt.com",
      }),
    ).toThrow();
  });

  it("rejects non-HTTP application URLs", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "production",
        NEXT_PUBLIC_APP_URL: "javascript:alert(1)",
      }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("requires HTTPS in staging and production", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_URL: "http://staging.unseenprompt.com",
      }),
    ).toThrow(/HTTPS/);
  });
});
