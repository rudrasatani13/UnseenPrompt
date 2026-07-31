import { NextResponse, type NextRequest } from "next/server";

import { getServerEnvironment } from "@/config/env/server";
import { isProductSurfaceEnabled } from "@/lib/security/product-surface";
import { createProxySession } from "@/lib/supabase/proxy-session";

const SIGN_IN_PATH = "/sign-in";

/**
 * Supabase rotates refresh tokens, so a redirect that drops the `Set-Cookie` headers written
 * during the refresh would leave the browser holding a spent token.
 */
function redirectPreservingSession(destination: URL, session: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(destination);

  for (const cookie of session.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }

  return redirect;
}

/**
 * Optimistic session routing only — it refreshes tokens and steers browsers, and never
 * authorizes data access. Every protected page and route handler revalidates through
 * `getAuthenticatedContext`, with RLS as the final boundary.
 *
 * Named `middleware.ts` rather than the Next 16 `proxy.ts` convention: `proxy.ts` always
 * compiles to the Node.js runtime, which `@opennextjs/cloudflare@1.20.2` rejects at bundle
 * time. Rename once the adapter supports Node.js middleware.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const environment = getServerEnvironment();

  if (!isProductSurfaceEnabled(environment)) {
    return NextResponse.next();
  }

  const { response, user } = await createProxySession(request, environment.APP_ENV);
  const { pathname } = request.nextUrl;

  if (pathname === SIGN_IN_PATH) {
    if (!user) {
      return response;
    }

    return redirectPreservingSession(new URL("/", request.url), response);
  }

  if (!user) {
    const signInUrl = new URL(SIGN_IN_PATH, request.url);
    signInUrl.searchParams.set("next", pathname);

    return redirectPreservingSession(signInUrl, response);
  }

  return response;
}

export const config = {
  matcher: ["/sign-in", "/onboarding", "/profile", "/api/account/:path*", "/auth/sign-out"],
};
