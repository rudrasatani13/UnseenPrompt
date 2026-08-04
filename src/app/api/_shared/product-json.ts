import { NextResponse } from "next/server";

import { NO_STORE_HEADERS } from "@/app/auth/_shared";

/** Product JSON requests are deliberately bounded before parsing or schema validation. */
export const MAX_PRODUCT_BODY_BYTES = 64 * 1024;

export type ProductErrorCode =
  | "auth_required"
  | "bad_origin"
  | "conflict"
  | "not_found"
  | "provider_error"
  | "provider_unavailable"
  | "rate_limited"
  | "validation_failed";

export function productErrorResponse(
  code: ProductErrorCode,
  status: number,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code } },
    { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } },
  );
}

const NOT_FOUND_ERRORS = new Set(["draft_not_found", "project_not_found", "discovery_not_found"]);
const CONFLICT_ERRORS = new Set([
  "stale_draft_version",
  "stale_state_version",
  "idempotency_conflict",
  "idempotency_in_progress",
  "invalid_draft_state",
  "invalid_discovery_state",
  "active_question_exists",
  "question_not_found",
  "question_not_active",
  "answer_not_allowed",
  "duplicate_question",
  "invalid_missing_fact",
  "sufficiency_policy_failed",
  "discovery_turn_limit_reached",
  "proposal_incomplete",
]);

/** Convert only the stable service error taxonomy into a public response. */
export function productServiceErrorResponse(error: unknown): NextResponse {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { readonly code?: unknown }).code
      : undefined;

  if (code === "auth_required") {
    return productErrorResponse("auth_required", 401);
  }
  if (code === "validation_failed") {
    return productErrorResponse("validation_failed", 422);
  }
  if (typeof code === "string" && NOT_FOUND_ERRORS.has(code)) {
    return productErrorResponse("not_found", 404);
  }
  if (typeof code === "string" && CONFLICT_ERRORS.has(code)) {
    return productErrorResponse(
      "conflict",
      409,
      code === "idempotency_in_progress" ? { "Retry-After": "1" } : {},
    );
  }
  if (code === "rate_limited") {
    return productErrorResponse("rate_limited", 429, { "Retry-After": "1" });
  }
  if (code === "provider_unavailable" || code === "deadline_exceeded" || code === "aborted") {
    return productErrorResponse("provider_unavailable", 503);
  }
  return productErrorResponse("provider_error", 502);
}

type BoundedText =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "too_large" }
  | { readonly kind: "unreadable" };

export type BoundedProductJsonBody =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly response: NextResponse };

async function readBoundedText(request: Request): Promise<BoundedText> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(declaredBytes)) {
      return { kind: "unreadable" };
    }
    if (declaredBytes > MAX_PRODUCT_BODY_BYTES) {
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
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_PRODUCT_BODY_BYTES) {
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

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { kind: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { kind: "unreadable" };
  }
}

const MEDIA_TYPE_OWS = /[ \t]/;

function isTokenCharacter(character: string): boolean {
  const codePoint = character.charCodeAt(0);
  return (
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    (codePoint >= 0x41 && codePoint <= 0x5a) ||
    (codePoint >= 0x61 && codePoint <= 0x7a) ||
    "!#$%&'*+-.^_`|~".includes(character)
  );
}

function consumeToken(value: string, start: number): number {
  let cursor = start;
  while (cursor < value.length && isTokenCharacter(value[cursor]!)) cursor += 1;
  return cursor;
}

function skipOptionalWhitespace(value: string, start: number): number {
  let cursor = start;
  while (cursor < value.length && MEDIA_TYPE_OWS.test(value[cursor]!)) cursor += 1;
  return cursor;
}

/**
 * Content-Type is a single media type, not a substring or a comma-separated list. Keep this
 * parser deliberately small and standards-shaped so `application/jsonp` and header smuggling do
 * not reach JSON parsing while valid parameters such as `charset=utf-8` remain supported.
 */
function isApplicationJsonMediaType(value: string): boolean {
  let cursor = skipOptionalWhitespace(value, 0);
  const typeEnd = consumeToken(value, cursor);
  if (typeEnd === cursor || value.slice(cursor, typeEnd).toLowerCase() !== "application") {
    return false;
  }

  cursor = typeEnd;
  if (value[cursor] !== "/") return false;
  cursor += 1;

  const subtypeStart = cursor;
  const subtypeEnd = consumeToken(value, subtypeStart);
  if (
    subtypeEnd === subtypeStart ||
    value.slice(subtypeStart, subtypeEnd).toLowerCase() !== "json"
  ) {
    return false;
  }

  cursor = skipOptionalWhitespace(value, subtypeEnd);
  const parameterNames = new Set<string>();
  while (cursor < value.length) {
    if (value[cursor] !== ";") return false;
    cursor = skipOptionalWhitespace(value, cursor + 1);

    const parameterNameEnd = consumeToken(value, cursor);
    if (parameterNameEnd === cursor) return false;
    const parameterName = value.slice(cursor, parameterNameEnd).toLowerCase();
    if (parameterNames.has(parameterName)) return false;
    parameterNames.add(parameterName);
    cursor = parameterNameEnd;
    if (value[cursor] !== "=") return false;
    cursor += 1;
    if (cursor >= value.length) return false;

    if (value[cursor] === '"') {
      cursor += 1;
      let closed = false;
      while (cursor < value.length) {
        const character = value[cursor]!;
        const codePoint = character.charCodeAt(0);
        if (character === '"') {
          cursor += 1;
          closed = true;
          break;
        }
        if (character === "\\") {
          cursor += 1;
          if (cursor >= value.length) return false;
          const escapedCodePoint = value[cursor]!.charCodeAt(0);
          if (
            escapedCodePoint !== 0x09 &&
            escapedCodePoint !== 0x20 &&
            (escapedCodePoint < 0x21 || escapedCodePoint > 0x7e) &&
            escapedCodePoint < 0x80
          ) {
            return false;
          }
          cursor += 1;
          continue;
        }
        if (codePoint !== 0x09 && (codePoint < 0x20 || codePoint === 0x7f) && codePoint < 0x80) {
          return false;
        }
        cursor += 1;
      }
      if (!closed) return false;
    } else {
      const parameterValueEnd = consumeToken(value, cursor);
      if (parameterValueEnd === cursor) return false;
      cursor = parameterValueEnd;
    }

    cursor = skipOptionalWhitespace(value, cursor);
  }

  return true;
}

export async function readProductJsonBody(request: Request): Promise<BoundedProductJsonBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!isApplicationJsonMediaType(contentType)) {
    return { ok: false, response: productErrorResponse("validation_failed", 422) };
  }

  const raw = await readBoundedText(request);
  if (raw.kind === "too_large") {
    return { ok: false, response: productErrorResponse("validation_failed", 413) };
  }
  if (raw.kind === "unreadable") {
    return { ok: false, response: productErrorResponse("validation_failed", 422) };
  }

  try {
    return { ok: true, value: JSON.parse(raw.text) as unknown };
  } catch {
    return { ok: false, response: productErrorResponse("validation_failed", 422) };
  }
}
