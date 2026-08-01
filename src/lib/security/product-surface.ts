import type { AppEnvironment } from "@/config/env/schema";

/**
 * Gates the authenticated product surface while the public site is waitlist-only.
 * A later release phase replaces this environment check with a launch flag.
 */
export function isProductSurfaceEnabled(environment: AppEnvironment): boolean {
  return environment.APP_ENV !== "production";
}
