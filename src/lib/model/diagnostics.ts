import "server-only";

import type {
  ModelCallKind,
  ModelErrorCode,
  RecordedModelValidationResult,
} from "@/domain/model/contracts";
import { PROVIDER_IDS, type ProviderId } from "@/lib/model/provider";

const SAFE_CORRELATION_ID = "00000000-0000-4000-8000-000000000000";
const CORRELATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_EVENT_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const SAFE_MODEL_MAX = 160;

export interface ModelDiagnosticEvent {
  readonly event: string;
  readonly correlationId: string;
  readonly provider: ProviderId;
  readonly model: string;
  readonly kind: ModelCallKind;
  readonly attempt: number;
  readonly durationMs: number;
  readonly status: number | null;
  readonly code: ModelErrorCode | "success" | null;
  readonly retryCount: number;
  readonly validationResult: RecordedModelValidationResult;
  readonly usedFallback: boolean;
  readonly usedRepair: boolean;
  readonly usedReviewer: boolean;
}

export interface ModelDiagnosticLogger {
  log(event: ModelDiagnosticEvent): void;
}

export type ModelDiagnosticSink = (event: ModelDiagnosticEvent) => void;

const NOOP_DIAGNOSTIC_LOGGER: ModelDiagnosticLogger = Object.freeze({
  log: (): void => {},
});

export { NOOP_DIAGNOSTIC_LOGGER };

function boundedNonNegativeInteger(value: number, fallback = 0): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function boundedDuration(value: number): number {
  return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : 0;
}

function boundedStatus(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function boundedString(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maximum);
}

function boundedCorrelationId(value: string): string {
  return CORRELATION_ID_PATTERN.test(value) ? value : SAFE_CORRELATION_ID;
}

const CALL_KINDS = new Set<ModelCallKind>([
  "primary",
  "transport_retry",
  "repair",
  "fallback",
  "reviewer",
]);
const VALIDATION_RESULTS = new Set<RecordedModelValidationResult>([
  "not_attempted",
  "passed",
  "repaired",
  "reviewed",
  "failed",
]);
const PROVIDERS = new Set<ProviderId>(PROVIDER_IDS);
const ERROR_CODES = new Set<ModelErrorCode | "success">([
  "aborted",
  "deadline_exceeded",
  "attempt_timeout",
  "authentication_failed",
  "permission_denied",
  "billing_or_quota_exhausted",
  "rate_limited",
  "provider_unavailable",
  "invalid_provider_request",
  "model_not_found",
  "content_refused",
  "output_truncated",
  "invalid_output",
  "configuration_error",
  "idempotency_conflict",
  "idempotency_in_progress",
  "idempotency_replay_unavailable",
  "persistence_failed",
  "provider_error",
  "success",
]);

/**
 * Strip an event down to the allowlist and freeze it. This protects injected sinks from accidental
 * mutation and makes it impossible for an extra prompt/body field to reach ordinary diagnostics.
 */
export function sanitizeDiagnosticEvent(event: ModelDiagnosticEvent): ModelDiagnosticEvent {
  const sanitized: ModelDiagnosticEvent = {
    event: SAFE_EVENT_PATTERN.test(event.event) ? event.event : "model.gateway",
    correlationId: boundedCorrelationId(event.correlationId),
    provider: PROVIDERS.has(event.provider) ? event.provider : "anthropic",
    model: boundedString(event.model, SAFE_MODEL_MAX),
    kind: CALL_KINDS.has(event.kind) ? event.kind : "primary",
    attempt: boundedNonNegativeInteger(event.attempt),
    durationMs: boundedDuration(event.durationMs),
    status: boundedStatus(event.status),
    code: event.code !== null && ERROR_CODES.has(event.code) ? event.code : null,
    retryCount: boundedNonNegativeInteger(event.retryCount),
    validationResult: VALIDATION_RESULTS.has(event.validationResult)
      ? event.validationResult
      : "not_attempted",
    usedFallback: event.usedFallback === true,
    usedRepair: event.usedRepair === true,
    usedReviewer: event.usedReviewer === true,
  };
  return Object.freeze(sanitized);
}

/** Build a logger whose default sink is deliberately a no-op. */
export function createDiagnosticLogger(
  sink?: ModelDiagnosticSink | ModelDiagnosticLogger,
): ModelDiagnosticLogger {
  if (sink === undefined) return NOOP_DIAGNOSTIC_LOGGER;

  return Object.freeze({
    log(event: ModelDiagnosticEvent): void {
      const safeEvent = sanitizeDiagnosticEvent(event);
      if (typeof sink === "function") sink(safeEvent);
      else sink.log(safeEvent);
    },
  });
}

export function emitDiagnostic(
  logger: ModelDiagnosticLogger | undefined,
  event: ModelDiagnosticEvent,
): void {
  (logger ?? NOOP_DIAGNOSTIC_LOGGER).log(sanitizeDiagnosticEvent(event));
}
