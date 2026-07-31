import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getServerSupabaseEnvironment } from "@/config/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Created per request — a shared instance would leak one visitor's session into another's render.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const environment = getServerSupabaseEnvironment();
  const cookieStore = await cookies();

  return createServerClient<Database>(environment.supabaseUrl, environment.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /*
           * Server Components cannot write cookies. The proxy refreshes tokens on every
           * matched request, so dropping the write here loses nothing.
           */
        }
      },
    },
  });
}
