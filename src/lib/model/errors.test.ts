import { describe, expect, it } from "vitest";

import {
  ModelGatewayError,
  mapProviderHttpStatus,
  mapProviderTransportError,
} from "@/lib/model/errors";

const correlationId = "00000000-0000-4000-8000-000000000000";

describe("ModelGatewayError", () => {
  it("exposes only stable safe details", () => {
    const secretBody = "provider-secret-raw-body";
    const error = new ModelGatewayError("provider_error", correlationId);
    const serialised = JSON.stringify({ error, secretBody });

    expect(error.message).toBe("provider_error");
    expect(error).toMatchObject({
      code: "provider_error",
      retryable: false,
      correlationId,
    });
    expect(JSON.stringify(error)).not.toContain(secretBody);
    expect(Object.isFrozen(error)).toBe(true);
    expect(serialised).toContain(secretBody); // the caller's own field is not altered
  });

  it.each([
    [401, "authentication_failed"],
    [403, "permission_denied"],
    [404, "model_not_found"],
    [408, "attempt_timeout"],
    [429, "rate_limited"],
    [503, "provider_unavailable"],
    [529, "provider_unavailable"],
    [418, "provider_error"],
  ] as const)("maps HTTP %s to %s", (status, code) => {
    const error = mapProviderHttpStatus(status, correlationId);
    expect(error.code).toBe(code);
    expect(error.httpStatus).toBe(status);
    expect(error.retryAfterMs).toBeUndefined();
  });

  it("retains only a bounded Retry-After hint for retryable responses", () => {
    const seconds = mapProviderHttpStatus(429, correlationId, new Headers({ "retry-after": "1" }));
    expect(seconds.retryAfterMs).toBe(1_000);

    const nowMs = Date.parse("Wed, 21 Oct 2015 07:27:59 GMT");
    const date = mapProviderHttpStatus(
      503,
      correlationId,
      new Headers({ "retry-after": "Wed, 21 Oct 2015 07:28:00 GMT" }),
      nowMs,
    );
    expect(date.retryAfterMs).toBe(1_000);

    const invalid = mapProviderHttpStatus(
      429,
      correlationId,
      new Headers({ "retry-after": "not-a-delay" }),
    );
    expect(invalid.retryAfterMs).toBeUndefined();

    const past = mapProviderHttpStatus(
      429,
      correlationId,
      new Headers({ "retry-after": "Wed, 21 Oct 2015 07:28:00 GMT" }),
      Date.parse("Wed, 21 Oct 2015 07:29:00 GMT"),
    );
    expect(past.retryAfterMs).toBeUndefined();

    const nonRetryable = mapProviderHttpStatus(
      401,
      correlationId,
      new Headers({ "retry-after": "1" }),
    );
    expect(nonRetryable.retryAfterMs).toBeUndefined();
  });

  it("keeps the retry hint internal and omits it from public serialization", () => {
    const error = mapProviderHttpStatus(429, correlationId, new Headers({ "retry-after": "99" }));
    expect(error.retryAfterMs).toBe(2_000);
    expect(Object.isFrozen(error)).toBe(true);
    expect(JSON.stringify(error)).not.toContain("retryAfterMs");
    expect(error.toJSON()).not.toHaveProperty("retryAfterMs");
  });

  it("does not expose transport messages and distinguishes cancellation", () => {
    const secret = new Error("secret provider body");
    const error = mapProviderTransportError(
      Object.assign(secret, { name: "AbortError" }),
      correlationId,
    );
    expect(error.code).toBe("aborted");
    expect(error.message).not.toContain("secret");

    const responseCancellation = mapProviderTransportError(
      { name: "BoundedResponseError", reason: "aborted", detail: "secret body" },
      correlationId,
    );
    expect(responseCancellation.code).toBe("aborted");
    expect(responseCancellation.message).not.toContain("secret");

    const networkError = Object.assign(new TypeError("secret network details"), {
      name: "TypeError",
    });
    const unavailable = mapProviderTransportError(networkError, correlationId);
    expect(unavailable.code).toBe("provider_unavailable");
    expect(unavailable.retryable).toBe(true);
    expect(unavailable.message).not.toContain("secret");
  });
});
