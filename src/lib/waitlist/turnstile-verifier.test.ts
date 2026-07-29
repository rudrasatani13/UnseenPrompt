import { describe, expect, it, vi } from "vitest";

import { createTurnstileVerifier } from "@/lib/waitlist/turnstile-verifier";

const input = {
  token: "token",
  action: "waitlist_request" as const,
  hostname: "unseenprompt.com",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("createTurnstileVerifier", () => {
  it("accepts a successful Siteverify response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        success: true,
        action: "waitlist_request",
        hostname: "unseenprompt.com",
      }),
    );
    const verifier = createTurnstileVerifier({
      secretKey: "1x0000000000000000000000000000000AA",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(verifier.verify(input)).resolves.toBe("verified");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects bad action or hostname", async () => {
    const verifier = createTurnstileVerifier({
      secretKey: "secret-secret-secret-secret-secret-12",
      fetchImpl: vi.fn(async () =>
        jsonResponse({
          success: true,
          action: "other",
          hostname: "unseenprompt.com",
        }),
      ) as typeof fetch,
    });
    await expect(verifier.verify(input)).resolves.toBe("rejected");
  });

  it("maps timeout and 5xx to unavailable", async () => {
    const timeoutVerifier = createTurnstileVerifier({
      secretKey: "secret-secret-secret-secret-secret-12",
      fetchImpl: vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      }) as typeof fetch,
    });
    await expect(timeoutVerifier.verify(input)).resolves.toBe("unavailable");

    const serverVerifier = createTurnstileVerifier({
      secretKey: "secret-secret-secret-secret-secret-12",
      fetchImpl: vi.fn(async () => new Response("nope", { status: 503 })) as typeof fetch,
    });
    await expect(serverVerifier.verify(input)).resolves.toBe("unavailable");
  });

  it("maps success:false and 4xx to rejected", async () => {
    const failed = createTurnstileVerifier({
      secretKey: "secret-secret-secret-secret-secret-12",
      fetchImpl: vi.fn(async () =>
        jsonResponse({ success: false, "error-codes": ["timeout-or-duplicate"] }),
      ) as typeof fetch,
    });
    await expect(failed.verify(input)).resolves.toBe("rejected");

    const clientError = createTurnstileVerifier({
      secretKey: "secret-secret-secret-secret-secret-12",
      fetchImpl: vi.fn(async () => new Response("bad", { status: 400 })) as typeof fetch,
    });
    await expect(clientError.verify(input)).resolves.toBe("rejected");
  });

  it("maps malformed and oversized JSON to unavailable", async () => {
    const malformed = createTurnstileVerifier({
      secretKey: "secret-secret-secret-secret-secret-12",
      fetchImpl: vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch,
    });
    await expect(malformed.verify(input)).resolves.toBe("unavailable");

    const oversized = createTurnstileVerifier({
      secretKey: "secret-secret-secret-secret-secret-12",
      fetchImpl: vi.fn(
        async () => new Response("x".repeat(9_000), { status: 200 }),
      ) as typeof fetch,
    });
    await expect(oversized.verify(input)).resolves.toBe("unavailable");
  });
});
