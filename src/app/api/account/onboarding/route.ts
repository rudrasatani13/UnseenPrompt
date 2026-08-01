import { NextResponse } from "next/server";

import { readBoundedJsonBody } from "@/app/api/account/_shared";
import {
  authErrorResponse,
  hasAllowedOrigin,
  NO_STORE_HEADERS,
  productSurfaceGate,
} from "@/app/auth/_shared";
import { onboardingAnswersSchema } from "@/domain/account/onboarding";
import { createSupabaseAccountRepository } from "@/lib/account/supabase-account-repository";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

export const dynamic = "force-dynamic";

/**
 * Production closes the whole surface, and an anonymous caller learns nothing about which methods
 * exist here: the gate and the session check run before the method is rejected.
 */
async function rejectMethod(): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) {
    return closed;
  }

  if (!(await getAuthenticatedContext())) {
    return authErrorResponse("auth_required", 401);
  }

  return authErrorResponse("validation_failed", 405, { Allow: "POST" });
}

export function GET(): Promise<NextResponse> {
  return rejectMethod();
}

export function PUT(): Promise<NextResponse> {
  return rejectMethod();
}

export function PATCH(): Promise<NextResponse> {
  return rejectMethod();
}

export function DELETE(): Promise<NextResponse> {
  return rejectMethod();
}

export async function POST(request: Request): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) {
    return closed;
  }

  const context = await getAuthenticatedContext();
  if (!context) {
    return authErrorResponse("auth_required", 401);
  }

  if (!hasAllowedOrigin(request)) {
    return authErrorResponse("bad_origin", 403);
  }

  const body = await readBoundedJsonBody(request);
  if (!body.ok) {
    return body.response;
  }

  const parsed = onboardingAnswersSchema.safeParse(body.value);
  if (!parsed.success) {
    return authErrorResponse("validation_failed", 422);
  }

  try {
    /*
     * The owner is the session user and nothing else: a caller-supplied id in the payload is
     * rejected by the schema rather than trusted, and every write below is filtered by this id.
     */
    await createSupabaseAccountRepository(context.supabase).completeOnboarding(
      context.user.id,
      parsed.data,
    );
  } catch {
    // Both writes are owner-scoped and order-fixed, so an identical retry converges.
    return authErrorResponse("provider_error", 502);
  }

  return NextResponse.json({ status: "completed" }, { status: 200, headers: NO_STORE_HEADERS });
}
