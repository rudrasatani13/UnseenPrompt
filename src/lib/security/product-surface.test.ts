import { describe, expect, it } from "vitest";

import type { AppEnvironment } from "@/config/env/schema";
import { isProductSurfaceEnabled } from "@/lib/security/product-surface";

function environmentFor(appEnv: AppEnvironment["APP_ENV"]): AppEnvironment {
  return {
    APP_ENV: appEnv,
    NEXT_PUBLIC_APP_URL: "https://unseenprompt.com",
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  };
}

describe("isProductSurfaceEnabled", () => {
  it("keeps the product surface closed in production", () => {
    expect(isProductSurfaceEnabled(environmentFor("production"))).toBe(false);
  });

  it.each(["local", "test", "preview", "staging"] as const)("opens the surface in %s", (appEnv) => {
    expect(isProductSurfaceEnabled(environmentFor(appEnv))).toBe(true);
  });
});
