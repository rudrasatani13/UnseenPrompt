import type { NextResponse } from "next/server";

import { productSurfaceGate, redirectToPath, resolvePostSignInPath } from "@/app/auth/_shared";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";

const FAILURE_PATH = "/sign-in?error=auth_callback_failed";

export async function GET(request: Request): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) {
    return closed;
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return redirectToPath(FAILURE_PATH);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      return redirectToPath(FAILURE_PATH);
    }

    return redirectToPath(
      await resolvePostSignInPath(supabase, data.user.id, url.searchParams.get("next")),
    );
  } catch {
    // Provider and transport detail never reaches the browser; only the stable code does.
    return redirectToPath(FAILURE_PATH);
  }
}
