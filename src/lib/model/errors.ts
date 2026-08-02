import "server-only";

import type { ModelErrorCode, ModelGatewayErrorDetails } from "@/domain/model/contracts";
import { MAX_RETRY_AFTER_MS, parseRetryAfter } from "@/lib/model/http";

const SAFE_CORRELATION_ID = "00000000-0000-4000-8000-000000000000";
const CORRELATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RETRYABLE_CODES = new Set<ModelErrorCode>([
  "attempt_timeout",
  "rate_limited",
  "provider_unavailable",
]);

/** Options accepted by the stable, sanitized gateway error implementation. */
export interface ModelGatewayErrorOptions {
  readonly retryable?: boolean;
  readonly httpStatus?: number;
  /** Internal retry hint; never included in the public error JSON shape. */
  readonly retryAfterMs?: number;
}

function safeCorrelationId(value: string): string {
  return CORRELATION_ID_PATTERN.test(value) ? value : SAFE_CORRELATION_ID;
}

function safeHttpStatus(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
}

function safeRetryAfterMs(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) return undefined;
  return Math.min(value, MAX_RETRY_AFTER_MS);
}

/**
 * Stable error crossing the provider/gateway boundary. Its message intentionally contains only a
 * public code; provider messages, response bodies, rejected output, and causes are never retained.
 */
export class ModelGatewayError extends Error implements ModelGatewayErrorDetails {
  readonly code: ModelErrorCode;
  readonly retryable: boolean;
  readonly correlationId: string;
  httpStatus?: number;
  retryAfterMs?: number;

  constructor(code: ModelErrorCode, correlationId: string, options: ModelGatewayErrorOptions = {}) {
    super(code);
    this.name = "ModelGatewayError";
    this.code = code;
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code);
    this.correlationId = safeCorrelationId(correlationId);

    const status = safeHttpStatus(options.httpStatus);
    if (status !== undefined) this.httpStatus = status;
    const retryAfterMs = safeRetryAfterMs(options.retryAfterMs);
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;

    // Keep the public object immutable so callers cannot accidentally add sensitive details.
    Object.freeze(this);
  }

  toJSON(): ModelGatewayErrorDetails {
    const details: ModelGatewayErrorDetails = {
      code: this.code,
      retryable: this.retryable,
      correlationId: this.correlationId,
      ...(this.httpStatus === undefined ? {} : { httpStatus: this.httpStatus }),
    };
    return details;
  }
}

export function isModelGatewayError(value: unknown): value is ModelGatewayError {
  return value instanceof ModelGatewayError;
}

/** Construct a stable error without ever carrying an untrusted provider value. */
export function createModelGatewayError(
  code: ModelErrorCode,
  correlationId: string,
  options: ModelGatewayErrorOptions = {},
): ModelGatewayError {
  return new ModelGatewayError(code, correlationId, options);
}

/** HTTP status mapping shared by all direct provider adapters. */
export function mapProviderHttpStatus(
  status: number,
  correlationId: string,
  headers?: Headers,
  nowMs: number = Date.now(),
): ModelGatewayError {
  let code: ModelErrorCode;

  switch (status) {
    case 400:
    case 422:
    case 413:
      code = "invalid_provider_request";
      break;
    case 401:
      code = "authentication_failed";
      break;
    case 402:
      code = "billing_or_quota_exhausted";
      break;
    case 403:
      code = "permission_denied";
      break;
    case 404:
      code = "model_not_found";
      break;
    case 408:
      code = "attempt_timeout";
      break;
    case 429:
      code = "rate_limited";
      break;
    case 500:
    case 502:
    case 503:
    case 504:
    case 529:
      code = "provider_unavailable";
      break;
    default:
      code = "provider_error";
  }

  const retryAfterMs =
    (code === "rate_limited" || code === "provider_unavailable") && headers !== undefined
      ? parseRetryAfter(headers.get("retry-after"), nowMs)
      : null;
  const httpStatus = safeHttpStatus(status);
  const options: ModelGatewayErrorOptions = {
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(retryAfterMs === null ? {} : { retryAfterMs }),
  };
  return new ModelGatewayError(code, correlationId, options);
}

/** Map either an HTTP status or an unsuccessful Response without reading its body. */
export function mapProviderResponseError(
  responseOrStatus: number | Response,
  correlationId: string,
  nowMs: number = Date.now(),
): ModelGatewayError {
  if (typeof responseOrStatus === "number") {
    return mapProviderHttpStatus(responseOrStatus, correlationId, undefined, nowMs);
  }
  return mapProviderHttpStatus(
    responseOrStatus.status,
    correlationId,
    responseOrStatus.headers,
    nowMs,
  );
}

function errorName(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const name = (value as { readonly name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

function responseFailureReason(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const reason = (value as { readonly reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

/** Map fetch/response failures without retaining the thrown value or its message. */
export function mapProviderTransportError(
  value: unknown,
  correlationId: string,
  options: { readonly timedOut?: boolean } = {},
): ModelGatewayError {
  const name = errorName(value);
  const reason = responseFailureReason(value);
  let code: ModelErrorCode = "provider_error";

  if (options.timedOut === true || name === "TimeoutError") {
    code = "attempt_timeout";
  } else if (name === "AbortError" || reason === "aborted") {
    code = "aborted";
  } else if (name === "TypeError") {
    // Fetch surfaces DNS/TLS/network failures as TypeError in Workers and browser runtimes.
    code = "provider_unavailable";
  }

  return new ModelGatewayError(code, correlationId);
}

export function mapContentRefusal(correlationId: string): ModelGatewayError {
  return new ModelGatewayError("content_refused", correlationId);
}

export function mapOutputTruncation(correlationId: string): ModelGatewayError {
  return new ModelGatewayError("output_truncated", correlationId);
}

export function mapInvalidOutput(correlationId: string): ModelGatewayError {
  return new ModelGatewayError("invalid_output", correlationId);
}
