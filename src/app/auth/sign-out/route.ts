import type { NextResponse } from "next/server";

import {
  authErrorResponse,
  hasAllowedOrigin,
  productSurfaceGate,
  redirectToPath,
} from "@/app/auth/_shared";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

export const dynamic = "force-dynamic";

/** Production closes the whole surface, so a wrong method must not reveal that the route exists. */
function rejectMethod(): NextResponse {
  return productSurfaceGate() ?? authErrorResponse("validation_failed", 405, { Allow: "POST" });
}

export function GET(): NextResponse {
  return rejectMethod();
}

export function PUT(): NextResponse {
  return rejectMethod();
}

export function DELETE(): NextResponse {
  return rejectMethod();
}

export async function POST(request: Request): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) {
    return closed;
  }

  if (!hasAllowedOrigin(request)) {
    return authErrorResponse("bad_origin", 403);
  }

  const context = await getAuthenticatedContext();
  if (!context) {
    return authErrorResponse("auth_required", 401);
  }

  /*
   * A failed revocation still ends the browser session: the auth cookies are cleared either way,
   * and reporting the failure would tell an attacker which sessions are still live server-side.
   */
  await context.supabase.auth.signOut().catch(() => undefined);

  return redirectToPath("/sign-in");
}
