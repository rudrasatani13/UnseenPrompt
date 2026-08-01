import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppEnvironment } from "@/config/env/schema";
import { getPublicSupabaseEnvironment } from "@/config/supabase/public";
import type { Database } from "@/lib/supabase/database.types";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * `APP_ENV` is absent from browser bundles, so the HTTPS rule is keyed off the inlined
 * `NODE_ENV`: every deployed build maps to `production`, the strictest branch of the parser,
 * so the browser can never be handed a weaker rule than its deployment actually has.
 */
function browserAppEnv(): AppEnvironment["APP_ENV"] {
  return process.env.NODE_ENV === "production" ? "production" : "local";
}

/**
 * Singleton because `@supabase/ssr` keeps auth state per client; a second instance would
 * race the first on token refresh.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!browserClient) {
    const environment = getPublicSupabaseEnvironment(browserAppEnv());

    browserClient = createBrowserClient<Database>(
      environment.supabaseUrl,
      environment.supabasePublishableKey,
    );
  }

  return browserClient;
}
