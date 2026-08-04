import { NextResponse } from "next/server";
import { z } from "zod";

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
import { composerDraftCommandEnvelopeSchema } from "@/domain/discovery/schemas";
import { createDiscoveryRuntime } from "@/lib/discovery/runtime";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

export const dynamic = "force-dynamic";

const ROUTE_DEADLINE_MS = 30_000;

type RouteContext = {
  readonly params: { readonly draftId: string } | Promise<{ readonly draftId: string }>;
};

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

export async function POST(request: Request, routeContext: RouteContext): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) return closed;

  const context = await getAuthenticatedContext();
  if (!context) return authErrorResponse("auth_required", 401);
  if (!hasAllowedOrigin(request)) return authErrorResponse("bad_origin", 403);

  const body = await readProductJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = composerDraftCommandEnvelopeSchema.safeParse(body.value);
  if (!parsed.success) return productErrorResponse("validation_failed", 422);

  const params = await routeContext.params;
  if (!z.uuid().safeParse(params.draftId).success) {
    return productErrorResponse("validation_failed", 422);
  }
  if (params.draftId !== parsed.data.draftId) {
    return productErrorResponse("validation_failed", 422);
  }

  try {
    const result = await createDiscoveryRuntime(context.supabase).executeDraftCommand(parsed.data, {
      signal: request.signal,
      deadlineMs: ROUTE_DEADLINE_MS,
    });
    return NextResponse.json(result, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    return productServiceErrorResponse(error);
  }
}
