import { z } from "zod";

import type { AppEnvironment } from "@/config/env/schema";

function urlProtocol(value: string): string | null {
  try {
    return new URL(value).protocol;
  } catch {
    return null;
  }
}

const projectUrlSchema = z.url().refine(
  (value) => {
    const protocol = urlProtocol(value);
    return protocol === "http:" || protocol === "https:";
  },
  {
    message: "must use HTTP or HTTPS",
  },
);

const publishableKeySchema = z
  .string()
  .min(1, "publishable key is required")
  .max(255, "publishable key is too long")
  .refine((value) => !value.startsWith("sb_secret"), {
    message: "publishable key must not be a secret key",
  });

function supabasePublicSchema(requiresHttps: boolean) {
  return z
    .object({
      NEXT_PUBLIC_SUPABASE_URL: projectUrlSchema,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKeySchema,
    })
    .superRefine((values, context) => {
      if (requiresHttps && urlProtocol(values.NEXT_PUBLIC_SUPABASE_URL) !== "https:") {
        context.addIssue({
          code: "custom",
          path: ["NEXT_PUBLIC_SUPABASE_URL"],
          message: "HTTPS is required in staging and production",
        });
      }
    });
}

export interface SupabasePublicEnvironment {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

/**
 * Parses the public Supabase values without including a rejected key in messages,
 * so a mistakenly pasted secret key cannot leak through logs or build output.
 */
export function parseSupabasePublicEnvironment(
  values: Record<string, string | undefined>,
  appEnv: AppEnvironment["APP_ENV"],
): SupabasePublicEnvironment {
  const requiresHttps = appEnv === "staging" || appEnv === "production";
  const result = supabasePublicSchema(requiresHttps).safeParse({
    NEXT_PUBLIC_SUPABASE_URL: values.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const path = issue.path.join(".") || "supabase";
      return `${path}: ${issue.message}`;
    });
    throw new Error(`Invalid Supabase public environment: ${messages.join("; ")}`);
  }

  return {
    supabaseUrl: result.data.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: result.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
