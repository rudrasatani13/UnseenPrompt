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
        NEXT_PUBLIC_APP_URL: "unseenprompt.cloud",
      }),
    ).toThrow();
  });
});
