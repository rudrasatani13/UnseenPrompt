import { NextResponse } from "next/server";

import { readBoundedJsonBody } from "@/app/api/account/_shared";
import {
  authErrorResponse,
  hasAllowedOrigin,
  NO_STORE_HEADERS,
  productSurfaceGate,
} from "@/app/auth/_shared";
import { preferencesSchema } from "@/domain/account/onboarding";
import { createSupabaseAccountRepository } from "@/lib/account/supabase-account-repository";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

export const dynamic = "force-dynamic";

async function rejectMethod(): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) {
    return closed;
  }

  if (!(await getAuthenticatedContext())) {
    return authErrorResponse("auth_required", 401);
  }

  return authErrorResponse("validation_failed", 405, { Allow: "PUT" });
}

export function GET(): Promise<NextResponse> {
  return rejectMethod();
}

export function POST(): Promise<NextResponse> {
  return rejectMethod();
}

export function PATCH(): Promise<NextResponse> {
  return rejectMethod();
}

export function DELETE(): Promise<NextResponse> {
  return rejectMethod();
}

export async function PUT(request: Request): Promise<NextResponse> {
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

  const parsed = preferencesSchema.safeParse(body.value);
  if (!parsed.success) {
    return authErrorResponse("validation_failed", 422);
  }

  try {
    const preferences = await createSupabaseAccountRepository(context.supabase).updatePreferences(
      context.user.id,
      parsed.data,
    );

    return NextResponse.json({ preferences }, { status: 200, headers: NO_STORE_HEADERS });
  } catch {
    return authErrorResponse("provider_error", 502);
  }
}
