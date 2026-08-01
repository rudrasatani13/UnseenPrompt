import type { AppEnvironment } from "@/config/env/schema";
import {
  parseSupabasePublicEnvironment,
  type SupabasePublicEnvironment,
} from "@/config/supabase/schema";

/**
 * Client-safe accessor. The `process.env` reads are static so Next.js inlines them into the
 * browser bundle; `appEnv` is a parameter because `APP_ENV` is server-only and would silently
 * resolve to `undefined` in a client bundle, weakening the HTTPS rule.
 */
export function getPublicSupabaseEnvironment(
  appEnv: AppEnvironment["APP_ENV"],
): SupabasePublicEnvironment {
  return parseSupabasePublicEnvironment(
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
    appEnv,
  );
}
