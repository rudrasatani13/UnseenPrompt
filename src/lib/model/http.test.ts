import { describe, expect, it } from "vitest";

import {
  BoundedResponseError,
  MalformedJsonError,
  MAX_RESPONSE_BYTES,
  MAX_RETRY_AFTER_MS,
  parseJsonFromUnknown,
  parseRetryAfter,
  readBoundedJsonResponse,
  readBoundedResponseText,
} from "@/lib/model/http";

describe("bounded provider response handling", () => {
  it("parses seconds and HTTP dates with a hard clamp", () => {
    expect(parseRetryAfter("1")).toBe(1_000);
    expect(parseRetryAfter("99")).toBe(MAX_RETRY_AFTER_MS);
    expect(
      parseRetryAfter("Wed, 21 Oct 2015 07:28:00 GMT", Date.parse("Wed, 21 Oct 2015 07:27:59 GMT")),
    ).toBe(1_000);
    expect(
      parseRetryAfter("Wed, 21 Oct 2015 07:28:00 GMT", Date.parse("Wed, 21 Oct 2015 07:20:00 GMT")),
    ).toBe(MAX_RETRY_AFTER_MS);
    expect(
      parseRetryAfter("Wed, 21 Oct 2015 07:28:00 GMT", Date.parse("Wed, 21 Oct 2015 07:29:00 GMT")),
    ).toBeNull();
    expect(parseRetryAfter("not-a-retry-after")).toBeNull();
    expect(parseRetryAfter("1.5")).toBeNull();
  });

  it("cancels and rejects an oversized streaming body", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(MAX_RESPONSE_BYTES)));
        controller.enqueue(new Uint8Array([120]));
      },
      cancel() {
        cancelled = true;
      },
    });

    await expect(readBoundedResponseText(new Response(stream))).rejects.toMatchObject({
      reason: "too_large",
      maxBytes: MAX_RESPONSE_BYTES,
    });
    expect(cancelled).toBe(true);
  });

  it("rejects malformed JSON without including the body", async () => {
    const body = "{secret-provider-body";
    await expect(readBoundedJsonResponse(new Response(body))).rejects.toBeInstanceOf(
      MalformedJsonError,
    );
    expect(() => parseJsonFromUnknown(body)).toThrowError("malformed_json");
    expect(() => parseJsonFromUnknown(body)).toThrowError(
      expect.not.stringContaining("secret-provider-body"),
    );
  });

  it("maps aborts while reading to a safe bounded error", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return Promise.reject(Object.assign(new Error("secret"), { name: "AbortError" }));
      },
    });
    await expect(readBoundedResponseText(new Response(stream))).rejects.toMatchObject({
      reason: "aborted",
    } satisfies Partial<BoundedResponseError>);
  });
});
