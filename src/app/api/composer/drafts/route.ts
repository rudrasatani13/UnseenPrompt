import { NextResponse } from "next/server";

import {
  authErrorResponse,
  hasAllowedOrigin,
  NO_STORE_HEADERS,
  productSurfaceGate,
} from "@/app/auth/_shared";
import {
  productErrorResponse,
  productServiceErrorResponse,
  readProductJsonBody,
} from "@/app/api/_shared/product-json";
import { composerDraftCreateInputSchema } from "@/domain/discovery/schemas";
import { createDiscoveryRuntime } from "@/lib/discovery/runtime";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

export const dynamic = "force-dynamic";

const ROUTE_DEADLINE_MS = 30_000;

async function rejectMethod(): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) return closed;

  if (!(await getAuthenticatedContext())) {
    return authErrorResponse("auth_required", 401);
  }

  return productErrorResponse("validation_failed", 405, { Allow: "POST" });
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
  if (closed) return closed;

  const context = await getAuthenticatedContext();
  if (!context) return authErrorResponse("auth_required", 401);
  if (!hasAllowedOrigin(request)) return authErrorResponse("bad_origin", 403);

  const body = await readProductJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = composerDraftCreateInputSchema.safeParse(body.value);
  if (!parsed.success) return productErrorResponse("validation_failed", 422);

  try {
    const draft = await createDiscoveryRuntime(context.supabase).createDraft({
      initialRequestText: parsed.data.initialRequestText,
      idempotencyKey: parsed.data.idempotencyKey,
      signal: request.signal,
      deadlineMs: ROUTE_DEADLINE_MS,
    });

    return NextResponse.json(draft, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    return productServiceErrorResponse(error);
  }
}
