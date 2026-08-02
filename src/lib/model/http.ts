import "server-only";

/** Hard upper bound required for every provider response in Phase 5. */
export const MAX_RESPONSE_BYTES = 1 * 1024 * 1024;
export const MAX_PROVIDER_RESPONSE_BYTES = MAX_RESPONSE_BYTES;
export const MAX_RETRY_AFTER_MS = 2_000;

export type BoundedResponseErrorReason = "too_large" | "aborted" | "read_failed";

/** Safe response-reader failure. It intentionally has no body, status text, or thrown cause. */
export class BoundedResponseError extends Error {
  readonly reason: BoundedResponseErrorReason;
  readonly maxBytes: number;

  constructor(reason: BoundedResponseErrorReason, maxBytes: number) {
    super(reason === "too_large" ? "response_too_large" : "response_read_failed");
    this.name = "BoundedResponseError";
    this.reason = reason;
    this.maxBytes = maxBytes;
    Object.freeze(this);
  }
}

/** A parse failure whose message contains no excerpt of the untrusted response. */
export class MalformedJsonError extends Error {
  constructor() {
    super("malformed_json");
    this.name = "MalformedJsonError";
    Object.freeze(this);
  }
}

/**
 * Parse an HTTP Retry-After value without allowing provider-controlled delays to extend the
 * gateway deadline. Both delay-seconds and HTTP-date forms are accepted and clamped to two seconds.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (value === null || value === undefined) return null;
  const header = value.trim();
  if (header.length === 0) return null;

  if (/^\d+$/.test(header)) {
    const seconds = Number(header);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.min(Math.ceil(seconds * 1_000), MAX_RETRY_AFTER_MS);
  }

  const targetMs = Date.parse(header);
  if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return null;
  if (targetMs < nowMs) return null;
  return Math.min(targetMs - nowMs, MAX_RETRY_AFTER_MS);
}

function isAbortLike(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const name = (value as { readonly name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return MAX_RESPONSE_BYTES;
  if (!Number.isFinite(value) || value <= 0) return MAX_RESPONSE_BYTES;
  return Math.min(Math.floor(value), MAX_RESPONSE_BYTES);
}

function contentLengthExceeds(response: Response, maxBytes: number): boolean {
  const header = response.headers.get("content-length");
  if (header === null || !/^\d+$/.test(header)) return false;
  const length = Number(header);
  return !Number.isSafeInteger(length) || length > maxBytes;
}

/**
 * Read a Response as UTF-8 while enforcing a byte (not JavaScript code-unit) bound. The stream is
 * cancelled before throwing when a provider sends an oversized body.
 */
export async function readBoundedResponseText(
  response: Response,
  maxBytes: number = MAX_RESPONSE_BYTES,
): Promise<string> {
  const limit = boundedLimit(maxBytes);
  if (contentLengthExceeds(response, limit)) {
    try {
      await response.body?.cancel();
    } catch {
      // Cancellation is best effort; the stable error remains the same.
    }
    throw new BoundedResponseError("too_large", limit);
  }

  const body = response.body;
  if (body === null || typeof body.getReader !== "function") {
    try {
      const text = await response.text();
      const bytes = new TextEncoder().encode(text).byteLength;
      if (bytes > limit) throw new BoundedResponseError("too_large", limit);
      return text;
    } catch (error) {
      if (error instanceof BoundedResponseError) throw error;
      throw new BoundedResponseError(isAbortLike(error) ? "aborted" : "read_failed", limit);
    }
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;

      const chunkValue: unknown = result.value;
      if (!(chunkValue instanceof Uint8Array) && !ArrayBuffer.isView(chunkValue)) {
        throw new BoundedResponseError("read_failed", limit);
      }

      // Fetch implementations may return a Uint8Array from another realm (notably jsdom tests).
      // Copy through the view instead of relying on `instanceof` across realms.
      const bytes =
        chunkValue instanceof Uint8Array
          ? chunkValue
          : Uint8Array.from(chunkValue as unknown as ArrayLike<number>);

      totalBytes += bytes.byteLength;
      if (!Number.isSafeInteger(totalBytes) || totalBytes > limit) {
        try {
          await reader.cancel();
        } catch {
          // The size violation is the authoritative failure even if cancellation fails.
        }
        throw new BoundedResponseError("too_large", limit);
      }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof BoundedResponseError) throw error;
    try {
      await reader.cancel();
    } catch {
      // Best effort only. Do not expose a stream implementation's message.
    }
    throw new BoundedResponseError(isAbortLike(error) ? "aborted" : "read_failed", limit);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Some synthetic test streams do not implement releaseLock.
    }
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Parse a bounded response body only after it has been read as untrusted text. */
export async function readBoundedJsonResponse(
  response: Response,
  maxBytes: number = MAX_RESPONSE_BYTES,
): Promise<unknown> {
  const text = await readBoundedResponseText(response, maxBytes);
  return parseJsonFromUnknown(text);
}

/** Parse JSON from an unknown body without leaking malformed content through an error message. */
export function parseJsonFromUnknown(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new MalformedJsonError();
  }
}
