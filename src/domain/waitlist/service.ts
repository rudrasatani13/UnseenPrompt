import type {
  Clock,
  ConfirmationMailer,
  ConfirmationResult,
  IdempotencyKeyGenerator,
  PublicWaitlistResult,
  RemovalResult,
  TokenCodec,
  TurnstileVerifier,
  WaitlistRepository,
  WaitlistRequest,
  WaitlistService,
} from "@/domain/waitlist/contracts";
import { normalizeEmail } from "@/domain/waitlist/email";

const CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface WaitlistServiceDependencies {
  readonly repository: WaitlistRepository;
  readonly turnstile: TurnstileVerifier;
  readonly mailer: ConfirmationMailer;
  readonly tokens: TokenCodec;
  readonly clock: Clock;
  readonly idempotencyKeys: IdempotencyKeyGenerator;
  readonly appUrl: URL;
  readonly hostname: string;
}

export function createWaitlistService(deps: WaitlistServiceDependencies): WaitlistService {
  return {
    async request(input: WaitlistRequest): Promise<PublicWaitlistResult> {
      const normalized = normalizeEmail(input.email);
      if (!normalized) {
        return { kind: "invalid_email" };
      }

      let verification: "verified" | "rejected" | "unavailable";
      try {
        verification = await deps.turnstile.verify({
          token: input.turnstileToken,
          action: "waitlist_request",
          hostname: deps.hostname,
          idempotencyKey: input.requestId,
        });
      } catch {
        return { kind: "temporary_failure" };
      }

      if (verification === "rejected") {
        return { kind: "verification_failed" };
      }
      if (verification === "unavailable") {
        return { kind: "temporary_failure" };
      }

      const candidateIdempotencyKey = deps.idempotencyKeys.create();
      const candidateToken = await deps.tokens.deriveConfirmation(candidateIdempotencyKey);
      const candidateTokenHash = await deps.tokens.hashConfirmation(candidateToken);
      const now = deps.clock.now();
      const candidateExpiresAt = new Date(now.getTime() + CONFIRMATION_TTL_MS);

      let decision;
      try {
        decision = await deps.repository.requestConfirmation({
          email: normalized.email,
          emailNormalized: normalized.normalized,
          consentAt: now,
          candidateTokenHash,
          candidateExpiresAt,
          candidateIdempotencyKey,
        });
      } catch {
        return { kind: "temporary_failure" };
      }

      if (decision.kind === "cooldown" || decision.kind === "confirmed") {
        return { kind: "accepted" };
      }

      const effectiveKey = decision.idempotencyKey;
      const rawToken = await deps.tokens.deriveConfirmation(effectiveKey);
      const confirmationUrl = new URL("/waitlist/confirm", deps.appUrl);
      confirmationUrl.hash = `token=${encodeURIComponent(rawToken)}`;

      let sendResult: "sent" | "unavailable" | "misconfigured";
      try {
        sendResult = await deps.mailer.send({
          email: normalized.email,
          confirmationUrl: confirmationUrl.toString(),
          idempotencyKey: effectiveKey,
        });

        if (sendResult === "unavailable") {
          // One retry for ambiguous timeout with identical body/key.
          sendResult = await deps.mailer.send({
            email: normalized.email,
            confirmationUrl: confirmationUrl.toString(),
            idempotencyKey: effectiveKey,
          });
        }
      } catch {
        return { kind: "temporary_failure" };
      }

      if (sendResult !== "sent") {
        return { kind: "temporary_failure" };
      }

      try {
        await deps.repository.markConfirmationSent({
          emailNormalized: normalized.normalized,
          idempotencyKey: effectiveKey,
          sentAt: deps.clock.now(),
        });
      } catch {
        // Delivery already succeeded; public result stays accepted.
      }

      return { kind: "accepted" };
    },

    async confirm(token: string): Promise<ConfirmationResult> {
      if (typeof token !== "string" || token.length === 0 || token.length > 1024) {
        return "invalid";
      }

      try {
        const tokenHash = await deps.tokens.hashConfirmation(token);
        return await deps.repository.confirm({ tokenHash, now: deps.clock.now() });
      } catch {
        return "invalid";
      }
    },

    async remove(token: string): Promise<RemovalResult> {
      if (typeof token !== "string" || token.length === 0 || token.length > 1024) {
        return "invalid";
      }

      try {
        const verified = await deps.tokens.verifyManagement(token);
        if (!verified) {
          return "invalid";
        }

        return await deps.repository.remove({
          entryId: verified.entryId,
          managementVersion: verified.managementVersion,
          now: deps.clock.now(),
        });
      } catch {
        return "invalid";
      }
    },
  };
}

export async function requestWaitlist(
  service: WaitlistService,
  input: WaitlistRequest,
): Promise<PublicWaitlistResult> {
  return service.request(input);
}

export async function confirmWaitlist(
  service: WaitlistService,
  token: string,
): Promise<ConfirmationResult> {
  return service.confirm(token);
}

export async function removeWaitlist(
  service: WaitlistService,
  token: string,
): Promise<RemovalResult> {
  return service.remove(token);
}
