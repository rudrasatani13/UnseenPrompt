import type { NextResponse } from "next/server";

import { authErrorResponse } from "@/app/auth/_shared";

/** Bounded well below any realistic answer set, so a runaway body is rejected before it is read. */
const MAX_BODY_BYTES = 64 * 1024;

export type BoundedJsonBody =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly response: NextResponse };

type BoundedText =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "too_large" }
  | { readonly kind: "unreadable" };

/**
 * Reads at most `MAX_BODY_BYTES`, distinguishing "too large" from "not valid JSON" so the caller
 * can answer 413 and 422 separately. A declared `Content-Length` is honoured first, but the stream
 * is still counted: the header is a claim, not a guarantee.
 */
async function readBoundedText(request: Request): Promise<BoundedText> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);

    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(declaredBytes)) {
      return { kind: "unreadable" };
    }

    if (declaredBytes > MAX_BODY_BYTES) {
      return { kind: "too_large" };
    }
  }

  if (!request.body) {
    return { kind: "unreadable" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { kind: "too_large" };
      }

      chunks.push(value);
    }
  } catch {
    return { kind: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { kind: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(body) };
  } catch {
    return { kind: "unreadable" };
  }
}

export async function readBoundedJsonBody(request: Request): Promise<BoundedJsonBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, response: authErrorResponse("validation_failed", 422) };
  }

  const raw = await readBoundedText(request);

  if (raw.kind === "too_large") {
    return { ok: false, response: authErrorResponse("validation_failed", 413) };
  }

  if (raw.kind === "unreadable") {
    return { ok: false, response: authErrorResponse("validation_failed", 422) };
  }

  try {
    return { ok: true, value: JSON.parse(raw.text) as unknown };
  } catch {
    return { ok: false, response: authErrorResponse("validation_failed", 422) };
  }
}
