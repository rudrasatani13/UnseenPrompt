import type { TurnstileVerifier } from "@/domain/waitlist/contracts";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 8_192;

export interface TurnstileVerifierOptions {
  readonly secretKey: string;
  readonly fetchImpl?: typeof fetch;
}

export function createTurnstileVerifier(options: TurnstileVerifierOptions): TurnstileVerifier {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async verify(input) {
      const body = new URLSearchParams({
        secret: options.secretKey,
        response: input.token,
        // Cloudflare accepts optional idempotency guidance via request metadata.
      });

      let response: Response;
      try {
        response = await fetchImpl(SITEVERIFY_URL, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        return "unavailable";
      }

      if (response.status === 429 || response.status >= 500) {
        return "unavailable";
      }

      if (!response.ok) {
        return "rejected";
      }

      const raw = await response.text();
      if (raw.length > MAX_RESPONSE_BYTES) {
        return "unavailable";
      }

      let payload: unknown;
      try {
        payload = JSON.parse(raw) as unknown;
      } catch {
        return "unavailable";
      }

      if (!payload || typeof payload !== "object") {
        return "unavailable";
      }

      const record = payload as Record<string, unknown>;
      if (record.success !== true) {
        return "rejected";
      }

      if (record.action !== "waitlist_request") {
        return "rejected";
      }

      if (record.hostname !== input.hostname) {
        return "rejected";
      }

      return "verified";
    },
  };
}
