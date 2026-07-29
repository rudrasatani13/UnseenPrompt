import { z } from "zod";

const secretSchema = z
  .string()
  .min(32, "waitlist secret must be at least 32 characters")
  .max(512, "waitlist secret is too long");

const waitlistEnvironmentSchema = z
  .object({
    turnstileSiteKey: z.string().min(1).max(256),
    turnstileSecretKey: secretSchema,
    supabaseUrl: z
      .url()
      .refine((value) => new URL(value).protocol === "https:", {
        message: "SUPABASE_URL must use HTTPS",
      }),
    supabaseSecretKey: secretSchema,
    resendApiKey: secretSchema,
    tokenSecret: secretSchema,
    fromEmail: z.literal("UnseenPrompt <hello@unseenprompt.com>"),
    appUrl: z
      .url()
      .refine((value) => new URL(value).protocol === "https:", {
        message: "application URL must use HTTPS",
      })
      .transform((value) => new URL(value)),
  })
  .readonly();

export type WaitlistEnvironment = z.infer<typeof waitlistEnvironmentSchema>;

export interface WaitlistEnvironmentInput {
  readonly turnstileSiteKey: string | undefined;
  readonly turnstileSecretKey: string | undefined;
  readonly supabaseUrl: string | undefined;
  readonly supabaseSecretKey: string | undefined;
  readonly resendApiKey: string | undefined;
  readonly tokenSecret: string | undefined;
  readonly fromEmail: string | undefined;
  readonly appUrl: string | undefined;
}

/**
 * Parses waitlist configuration without including secret values in messages.
 */
export function parseWaitlistEnvironment(input: WaitlistEnvironmentInput): WaitlistEnvironment {
  const result = waitlistEnvironmentSchema.safeParse({
    turnstileSiteKey: input.turnstileSiteKey,
    turnstileSecretKey: input.turnstileSecretKey,
    supabaseUrl: input.supabaseUrl,
    supabaseSecretKey: input.supabaseSecretKey,
    resendApiKey: input.resendApiKey,
    tokenSecret: input.tokenSecret,
    fromEmail: input.fromEmail,
    appUrl: input.appUrl,
  });

  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const path = issue.path.join(".") || "waitlist";
      // Never embed the rejected value — secrets must not appear in messages.
      return `${path}: ${issue.message}`;
    });
    throw new Error(`Invalid waitlist environment: ${messages.join("; ")}`);
  }

  return result.data;
}
