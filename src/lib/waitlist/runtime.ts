import "server-only";

import { getWaitlistEnvironment } from "@/config/waitlist/server";
import type { WaitlistService } from "@/domain/waitlist/contracts";
import { createWaitlistService } from "@/domain/waitlist/service";
import { WebCryptoTokenCodec } from "@/domain/waitlist/tokens";
import { createResendMailer } from "@/lib/waitlist/resend-mailer";
import { createSupabaseWaitlistRepository } from "@/lib/waitlist/supabase-repository";
import { createTurnstileVerifier } from "@/lib/waitlist/turnstile-verifier";

/**
 * Wires production waitlist adapters only after environment validation succeeds.
 */
export function getProductionWaitlistService(): WaitlistService {
  const environment = getWaitlistEnvironment();

  return createWaitlistService({
    repository: createSupabaseWaitlistRepository(environment),
    turnstile: createTurnstileVerifier({ secretKey: environment.turnstileSecretKey }),
    mailer: createResendMailer({
      apiKey: environment.resendApiKey,
      fromEmail: environment.fromEmail,
      appOrigin: environment.appUrl.origin,
    }),
    tokens: new WebCryptoTokenCodec(environment.tokenSecret),
    clock: { now: () => new Date() },
    idempotencyKeys: {
      create: () => crypto.randomUUID(),
    },
    appUrl: environment.appUrl,
    hostname: environment.appUrl.hostname,
  });
}
