import "server-only";

import { getServerEnvironment } from "@/config/env/server";
import { parseWaitlistEnvironment, type WaitlistEnvironment } from "@/config/waitlist/schema";

/**
 * Loads production-only waitlist credentials after verifying APP_ENV is production.
 * Never call from client modules or non-production request paths.
 */
export function getWaitlistEnvironment(): WaitlistEnvironment {
  const appEnvironment = getServerEnvironment();

  if (appEnvironment.APP_ENV !== "production") {
    throw new Error("Waitlist environment is only available in production");
  }

  return parseWaitlistEnvironment({
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    resendApiKey: process.env.RESEND_API_KEY,
    tokenSecret: process.env.WAITLIST_TOKEN_SECRET,
    fromEmail: process.env.WAITLIST_FROM_EMAIL,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
}
