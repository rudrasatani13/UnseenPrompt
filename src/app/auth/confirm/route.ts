import type { NextResponse } from "next/server";

import { productSurfaceGate, redirectToPath, resolvePostSignInPath } from "@/app/auth/_shared";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";

const FAILURE_PATH = "/sign-in?error=magic_link_invalid";
const OTP_TYPE = "email";

export async function GET(request: Request): Promise<NextResponse> {
  const closed = productSurfaceGate();
  if (closed) {
    return closed;
  }

  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");

  /*
   * Only the magic-link template's own `type` is honoured. Verifying a recovery or email-change
   * hash as an email OTP would let a link minted for one flow open a session in another.
   */
  if (!tokenHash || url.searchParams.get("type") !== OTP_TYPE) {
    return redirectToPath(FAILURE_PATH);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type: OTP_TYPE,
      token_hash: tokenHash,
    });

    if (error || !data.user) {
      return redirectToPath(FAILURE_PATH);
    }

    return redirectToPath(
      await resolvePostSignInPath(supabase, data.user.id, url.searchParams.get("next")),
    );
  } catch {
    // Expired, replayed, and transport failures are indistinguishable to the browser by design.
    return redirectToPath(FAILURE_PATH);
  }
}
