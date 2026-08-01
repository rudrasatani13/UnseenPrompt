import { NextResponse } from "next/server";
import { z } from "zod";

import { readBoundedJsonBody } from "@/app/api/account/_shared";
import {
  authErrorResponse,
  hasAllowedOrigin,
  NO_STORE_HEADERS,
  productSurfaceGate,
} from "@/app/auth/_shared";
import { createSupabaseAccountRepository } from "@/lib/account/supabase-account-repository";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

export const dynamic = "force-dynamic";

const emptyBodySchema = z.strictObject({});

async function rejectMethod(): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) {
    return closed;
  }

  if (!(await getAuthenticatedContext())) {
    return authErrorResponse("auth_required", 401);
  }

  return authErrorResponse("validation_failed", 405, { Allow: "POST, DELETE" });
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

async function authenticatedMutation(request: Request, operation: "request" | "cancel") {
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

  if (!emptyBodySchema.safeParse(body.value).success) {
    return authErrorResponse("validation_failed", 422);
  }

  const repository = createSupabaseAccountRepository(context.supabase);

  try {
    if (operation === "request") {
      const deletionRequestedAt = await repository.requestDeletion(context.user.id, new Date());
      return NextResponse.json({ deletionRequestedAt }, { headers: NO_STORE_HEADERS });
    }

    await repository.cancelDeletion(context.user.id);
    return NextResponse.json({ deletionRequestedAt: null }, { headers: NO_STORE_HEADERS });
  } catch {
    return authErrorResponse("provider_error", 502);
  }
}

export function POST(request: Request): Promise<NextResponse> {
  return authenticatedMutation(request, "request");
}

export function DELETE(request: Request): Promise<NextResponse> {
  return authenticatedMutation(request, "cancel");
}
