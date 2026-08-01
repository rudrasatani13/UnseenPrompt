import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import type { Database } from "@/lib/supabase/database.types";

export interface AuthenticatedContext {
  readonly user: User;
  readonly supabase: SupabaseClient<Database>;
}

/**
 * Authoritative server-side identity: `getUser()` revalidates the token against Supabase Auth
 * rather than trusting the cookie. Returns null for every auth failure — missing session,
 * expired or tampered token, transport error — so callers choose redirect or 401 themselves.
 */
export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    return { user: data.user, supabase };
  } catch {
    return null;
  }
}
