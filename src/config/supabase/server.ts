import "server-only";

import { z } from "zod";

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

/**
 * Server-only credentials for the generation persistence boundary. The publishable client remains
 * session-bound for owner-scoped reads and lifecycle commands; this secret client is used only for
 * the service-role generation RPCs and is never returned to client modules or logged.
 */
export interface SupabaseGenerationEnvironment {
  readonly supabaseUrl: string;
  readonly supabaseSecretKey: string;
}

const supabaseSecretKeySchema = z
  .string()
  .min(32, "SUPABASE_SECRET_KEY is too short")
  .max(512, "SUPABASE_SECRET_KEY is too long")
  .refine((value) => !value.startsWith("sb_publishable"), "SUPABASE_SECRET_KEY must be secret");

export function getServerSupabaseGenerationEnvironment(): SupabaseGenerationEnvironment {
  const publicEnvironment = getServerSupabaseEnvironment();
  const result = supabaseSecretKeySchema.safeParse(process.env.SUPABASE_SECRET_KEY);
  if (!result.success) {
    throw new Error("Invalid SUPABASE_SECRET_KEY for server-only generation persistence");
  }

  return {
    supabaseUrl: publicEnvironment.supabaseUrl,
    supabaseSecretKey: result.data,
  };
}
