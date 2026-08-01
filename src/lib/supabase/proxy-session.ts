import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import type { AppEnvironment } from "@/config/env/schema";
import { getPublicSupabaseEnvironment } from "@/config/supabase/public";
import type { Database } from "@/lib/supabase/database.types";

export interface ProxySession {
  readonly response: NextResponse;
  readonly user: User | null;
}

/**
 * Request/response cookie bridge for the proxy: refreshed tokens are written back to both the
 * request (so the rest of the pipeline sees them) and the outgoing response (so the browser
 * stores them). Config comes from the client-safe accessor because the proxy bundle must stay
 * free of the "server-only" marker.
 */
export async function createProxySession(
  request: NextRequest,
  appEnv: AppEnvironment["APP_ENV"],
): Promise<ProxySession> {
  const environment = getPublicSupabaseEnvironment(appEnv);
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          for (const [header, value] of Object.entries(headers)) {
            response.headers.set(header, value);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();

  return { response, user: data.user };
}
