import "server-only";

import { getServerEnvironment } from "@/config/env/server";
import {
  parseSupabasePublicEnvironment,
  type SupabasePublicEnvironment,
} from "@/config/supabase/schema";

export function getServerSupabaseEnvironment(): SupabasePublicEnvironment {
  return parseSupabasePublicEnvironment(
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
    getServerEnvironment().APP_ENV,
  );
}
