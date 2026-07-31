import { NextResponse } from "next/server";

import { getServerEnvironment } from "@/config/env/server";
import { resolveNextPath } from "@/domain/account/redirect";
import { isProductSurfaceEnabled } from "@/lib/security/product-surface";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export type AuthErrorCode =
  | "auth_required"
  | "bad_origin"
  | "validation_failed"
  | "not_found"
  | "conflict"
  | "provider_error";

export function authErrorResponse(
  code: AuthErrorCode,
  status: number,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code } },
    { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } },
  );
}

/**
 * Auth surfaces stay closed while production serves only the waitlist. Returns the 404 envelope
 * to send, or null when the surface is open.
 */
export function productSurfaceGate(): NextResponse | null {
  if (isProductSurfaceEnabled(getServerEnvironment())) {
    return null;
  }

  return authErrorResponse("not_found", 404);
}

/**
 * Redirects are built against the configured application origin rather than the request's `Host`
 * header, so a forged host cannot turn an auth redirect into an off-site one.
 */
export function redirectToPath(path: string): NextResponse {
  const destination = new URL(path, getServerEnvironment().NEXT_PUBLIC_APP_URL);

  return NextResponse.redirect(destination, { status: 303, headers: NO_STORE_HEADERS });
}

/**
 * Cross-origin form posts are rejected when the browser tells us where the request came from.
 * A missing `Origin` header is allowed: same-origin GET-initiated navigations omit it.
 */
export function hasAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) {
    return true;
  }

  return origin === new URL(getServerEnvironment().NEXT_PUBLIC_APP_URL).origin;
}

/**
 * Single extension point for where a freshly signed-in browser lands. P4-04 replaces the body
 * with the profile-bootstrap and onboarding-aware decision; both callback handlers stay
 * unchanged.
 */
export function resolvePostSignInPath(nextParam: string | null): string {
  return resolveNextPath(nextParam);
}
