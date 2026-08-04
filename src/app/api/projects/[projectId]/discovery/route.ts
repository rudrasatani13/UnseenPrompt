import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse, NO_STORE_HEADERS, productSurfaceGate } from "@/app/auth/_shared";
import { productErrorResponse, productServiceErrorResponse } from "@/app/api/_shared/product-json";
import { createDiscoveryRuntime } from "@/lib/discovery/runtime";
import { getAuthenticatedContext } from "@/lib/supabase/require-user";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: { readonly projectId: string } | Promise<{ readonly projectId: string }>;
};

async function rejectMethod(): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) return closed;

  if (!(await getAuthenticatedContext())) {
    return authErrorResponse("auth_required", 401);
  }

  return productErrorResponse("validation_failed", 405, { Allow: "GET" });
}

export function POST(): Promise<NextResponse> {
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

export async function GET(_request: Request, routeContext: RouteContext): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) return closed;

  const context = await getAuthenticatedContext();
  if (!context) return authErrorResponse("auth_required", 401);

  const params = await routeContext.params;
  if (!z.uuid().safeParse(params.projectId).success) {
    return productErrorResponse("validation_failed", 422);
  }
  try {
    const snapshot = await createDiscoveryRuntime(context.supabase).getSnapshot(params.projectId);
    return NextResponse.json(snapshot, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    return productServiceErrorResponse(error);
  }
}
