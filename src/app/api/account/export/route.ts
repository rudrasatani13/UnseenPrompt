import { NextResponse } from "next/server";

import { authErrorResponse, NO_STORE_HEADERS, productSurfaceGate } from "@/app/auth/_shared";
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

  return authErrorResponse("validation_failed", 405, { Allow: "GET" });
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

export async function GET(): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) {
    return closed;
  }

  const context = await getAuthenticatedContext();
  if (!context) {
    return authErrorResponse("auth_required", 401);
  }

  try {
    const accountExport = await createSupabaseAccountRepository(
      context.supabase,
    ).buildAccountExport(context.user.id);

    return new NextResponse(JSON.stringify(accountExport), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="unseenprompt-export.json"',
      },
    });
  } catch {
    return authErrorResponse("provider_error", 502);
  }
}
