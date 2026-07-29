import type { TurnstileVerifier } from "@/domain/waitlist/contracts";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 8_192;
const KNOWN_ERROR_CODES = new Set([
  "bad-request",
  "internal-error",
  "invalid-input-response",
  "invalid-input-secret",
  "missing-input-response",
  "missing-input-secret",
  "timeout-or-duplicate",
]);

function reportRejection(category: string, errorCodes: unknown = []): void {
  const codes = Array.isArray(errorCodes)
    ? errorCodes.filter(
        (code): code is string => typeof code === "string" && KNOWN_ERROR_CODES.has(code),
      )
    : [];
  console.warn("waitlist.turnstile.rejected", { category, codes });
}

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
        idempotency_key: input.idempotencyKey,
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
        reportRejection(`http-${response.status}`);
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
        reportRejection("provider", record["error-codes"]);
        return "rejected";
      }

      if (record.action !== "waitlist_request") {
        reportRejection("action");
        return "rejected";
      }

      if (record.hostname !== input.hostname) {
        reportRejection("hostname");
        return "rejected";
      }

      return "verified";
    },
  };
}
