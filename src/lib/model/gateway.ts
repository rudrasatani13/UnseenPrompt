import "server-only";

import type {
  ModelCallKind,
  ModelErrorCode,
  ModelExecutionSubject,
  ModelExecutionMetadata,
  ModelGatewayRequestInput,
  ModelOperation,
  ModelOutputSchema,
  ModelUsage,
  RecordedModelValidationResult,
  TypedModelOperation,
  TypedModelGatewayRequest,
  ValidatedModelResponse,
} from "@/domain/model/contracts";
import { MODEL_OUTPUT_SCHEMA_REGISTRY, projectDeltaV1Schema } from "@/domain/model/schemas";
import { serializeCanonicalJsonV1 } from "@/domain/project/commands";
import {
  MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX,
  MODEL_EXECUTION_BUDGETS,
  type ModelEnvironment,
  type ModelRoute,
} from "@/config/model/schema";
import { aggregateEstimatedCostMicros, aggregateUsage, estimateCostMicros } from "@/lib/model/cost";
import {
  abortableDelay,
  createCombinedAttemptSignal,
  DEFAULT_DEADLINE_TIMER,
  effectiveDeadlineMs,
  remainingDeadlineMs,
  type DeadlineTimer,
} from "@/lib/model/deadline";
import {
  createModelGatewayError,
  isModelGatewayError,
  type ModelGatewayError,
} from "@/lib/model/errors";
import { emitDiagnostic, type ModelDiagnosticLogger } from "@/lib/model/diagnostics";
import type { ProviderAdapter, ProviderAdapterResult, ProviderId } from "@/lib/model/provider";
import {
  type GenerationRunClaim,
  type GenerationRunClaimV3,
  type GenerationRunCompletion,
  type GenerationRunCompletionInput,
  type GenerationRunCompletionV3,
  type GenerationRunCompletionInputV3,
  type GenerationRunStore,
  GENERATION_RUN_INPUT_SCHEMA_VERSION,
  GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
  MODEL_REQUEST_FINGERPRINT_VERSION,
  MAX_VALIDATED_OUTPUT_BYTES,
  MAX_VALIDATED_PROJECT_DELTA_BYTES,
} from "@/lib/model/generation-run-store";

export const MAX_GATEWAY_INPUT_BYTES = 256 * 1024;
export const MAX_GATEWAY_CANDIDATE_BYTES = 1 * 1024 * 1024;
export const MAX_REPAIR_CANDIDATE_BYTES = 180 * 1024;
export const MAX_REPAIR_ISSUES = 32;
export const MAX_REPAIR_ISSUE_BYTES = 200;
export const MAX_METADATA_TEXT_BYTES = 160;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_ERROR_CODES = new Set<ModelErrorCode>([
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
]);
const NO_FALLBACK_CODES = new Set<ModelErrorCode>([
  "aborted",
  "deadline_exceeded",
  "authentication_failed",
  "permission_denied",
  "billing_or_quota_exhausted",
  "invalid_provider_request",
  "model_not_found",
  "content_refused",
  "configuration_error",
  "provider_error",
  "idempotency_conflict",
  "idempotency_in_progress",
  "idempotency_replay_unavailable",
  "persistence_failed",
]);
const RETRYABLE_CODES = new Set<ModelErrorCode>([
  "attempt_timeout",
  "rate_limited",
  "provider_unavailable",
]);
const PROVIDER_IDS = new Set<ProviderId>(["anthropic", "openai", "gemini", "opencode"]);

type Clock = () => number;
type Digest = (input: Uint8Array) => Promise<ArrayBuffer>;
type CreateUuid = () => string;
type Sleep = (delayMs: number, signal?: AbortSignal) => Promise<void>;

class CompletionEchoMismatch extends Error {
  constructor() {
    super("completion_mismatch");
    this.name = "CompletionEchoMismatch";
  }
}

export interface ModelGatewayDependencies {
  readonly environment: ModelEnvironment;
  readonly adapters: Readonly<Partial<Record<ProviderId, ProviderAdapter>>>;
  readonly store: GenerationRunStore;
  readonly logger?: ModelDiagnosticLogger;
  readonly now?: Clock;
  readonly timer?: DeadlineTimer;
  readonly sleep?: Sleep;
  readonly digest?: Digest;
  readonly createCorrelationId?: CreateUuid;
}

interface CallRecord extends ModelCallMetadataInternal {
  readonly route: ModelRoute;
  readonly callIndex: number;
}

interface ModelCallMetadataInternal {
  readonly provider: string;
  readonly model: string;
  readonly resolvedModel: string | null;
  readonly kind: ModelCallKind;
  readonly latencyMs: number;
  readonly usage: ModelUsage;
  readonly estimatedCostMicros: number | null;
  readonly outcome: ModelErrorCode | "success";
  readonly validationResult: RecordedModelValidationResult;
  readonly requestId: string | null;
}

interface ValidCandidate<T> {
  readonly data: T;
  readonly route: ModelRoute;
  readonly resolvedModel: string | null;
  readonly validationResult: "passed" | "repaired" | "reviewed";
}

interface AttemptFailure {
  readonly error: ModelGatewayError;
  readonly route: ModelRoute;
  readonly calls: readonly CallRecord[];
  readonly result?: never;
  readonly call?: never;
}

interface AttemptSuccess {
  readonly result: ProviderAdapterResult;
  readonly route: ModelRoute;
  readonly call: CallRecord;
  readonly error?: never;
}

interface ParsedCandidate<T> {
  readonly data: T | null;
  readonly issuePaths: readonly string[];
}

type GatewayRequest<T> = ModelGatewayRequestInput<T>;
type GatewayClaim = GenerationRunClaim | GenerationRunClaimV3;
type GatewayCompletionInput = GenerationRunCompletionInput | GenerationRunCompletionInputV3;
type GatewayCompletion = GenerationRunCompletion | GenerationRunCompletionV3;

function isTypedRequest<T>(request: GatewayRequest<T>): request is TypedModelGatewayRequest<T> {
  return typeof request === "object" && request !== null && "subject" in request;
}

function isReplayableTypedOperation(operation: ModelOperation): operation is TypedModelOperation {
  return (
    operation === "intent_detection" ||
    operation === "discovery_sufficiency" ||
    operation === "clarification_question"
  );
}

function isProjectTypedOperation(
  operation: ModelOperation,
): operation is "discovery_sufficiency" | "clarification_question" {
  return operation === "discovery_sufficiency" || operation === "clarification_question";
}

interface GatewayRuntime<T> {
  readonly request: GatewayRequest<T>;
  readonly generationRunId: string;
  readonly projectStateVersion: number;
  readonly correlationId: string;
  readonly startedAtMs: number;
  readonly deadlineAtMs: number;
  readonly calls: CallRecord[];
  productionCallCount: number;
  transportRetryCount: number;
  repairCount: number;
  fallbackCount: number;
  absoluteCallCount: number;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function boundedText(value: string, maximumBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maximumBytes) return value;
  if (maximumBytes <= 0) return "";

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const end = Math.min(Math.floor(maximumBytes), bytes.byteLength);
  // A UTF-8 code point is at most four bytes, so at most three boundary bytes need removal.
  for (let candidateEnd = end; candidateEnd >= Math.max(0, end - 3); candidateEnd -= 1) {
    try {
      return decoder.decode(bytes.slice(0, candidateEnd));
    } catch {
      // The candidate ends in a partial code point; try the previous byte boundary.
    }
  }
  return "";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function safeNow(now: Clock): number {
  const value = now();
  return Number.isFinite(value) ? value : Date.now();
}

function safeCorrelationId(createUuid: CreateUuid | undefined): string {
  try {
    const candidate = createUuid?.() ?? globalThis.crypto?.randomUUID?.();
    return isUuid(candidate) ? candidate : "00000000-0000-4000-8000-000000000000";
  } catch {
    return "00000000-0000-4000-8000-000000000000";
  }
}

function safeMetadataString(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== "string") return fallback;
  const clean = boundedText(value.replace(/[\u0000-\u001f\u007f]/g, ""), MAX_METADATA_TEXT_BYTES);
  return clean.length > 0 ? clean : fallback;
}

function safeUsage(value: unknown): ModelUsage {
  if (typeof value !== "object" || value === null) {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }
  const usage = value as Partial<ModelUsage>;
  return {
    inputTokens: isSafeNonNegativeInteger(usage.inputTokens) ? usage.inputTokens : null,
    outputTokens: isSafeNonNegativeInteger(usage.outputTokens) ? usage.outputTokens : null,
    totalTokens: isSafeNonNegativeInteger(usage.totalTokens) ? usage.totalTokens : null,
  };
}

function isAdapterResult(value: unknown): value is ProviderAdapterResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ProviderAdapterResult>;
  if (typeof candidate.resolvedModel !== "string" || candidate.resolvedModel.trim().length === 0)
    return false;
  if (candidate.requestId !== null && typeof candidate.requestId !== "string") return false;
  return typeof candidate.usage === "object" && candidate.usage !== null && "value" in candidate;
}

function safeError(
  value: unknown,
  correlationId: string,
  fallback: ModelErrorCode,
): ModelGatewayError {
  if (isModelGatewayError(value) && SAFE_ERROR_CODES.has(value.code)) {
    return createModelGatewayError(value.code, correlationId, {
      retryable: value.retryable,
      ...(value.httpStatus === undefined ? {} : { httpStatus: value.httpStatus }),
      ...(value.retryAfterMs === undefined ? {} : { retryAfterMs: value.retryAfterMs }),
    });
  }

  if (typeof value === "object" && value !== null) {
    const candidate = (value as { readonly code?: unknown }).code;
    if (typeof candidate === "string" && SAFE_ERROR_CODES.has(candidate as ModelErrorCode)) {
      return createModelGatewayError(candidate as ModelErrorCode, correlationId);
    }
    const message = (value as { readonly message?: unknown }).message;
    if (typeof message === "string" && SAFE_ERROR_CODES.has(message as ModelErrorCode)) {
      return createModelGatewayError(message as ModelErrorCode, correlationId);
    }
  }

  return createModelGatewayError(fallback, correlationId);
}

function normalizeIssuePaths(error: unknown): readonly string[] {
  if (typeof error !== "object" || error === null) return ["$"];
  const issues = (error as { readonly issues?: unknown }).issues;
  if (!Array.isArray(issues)) return ["$"];
  const paths: string[] = [];
  for (const issue of issues.slice(0, MAX_REPAIR_ISSUES)) {
    if (typeof issue !== "object" || issue === null) {
      paths.push("$");
      continue;
    }
    const path = (issue as { readonly path?: unknown }).path;
    const parts = Array.isArray(path)
      ? path.filter(
          (part): part is string | number => typeof part === "string" || typeof part === "number",
        )
      : [];
    const safeParts = parts.map((part) =>
      typeof part === "number"
        ? String(part)
        : boundedText(part.replace(/[^A-Za-z0-9_$-]/g, "_"), MAX_REPAIR_ISSUE_BYTES),
    );
    const rendered = safeParts.length === 0 ? "$" : `$.${safeParts.join(".")}`;
    paths.push(boundedText(rendered, MAX_REPAIR_ISSUE_BYTES));
  }
  return paths.length > 0 ? paths : ["$"];
}

function parseCandidate<T>(value: unknown, schema: ModelOutputSchema<T>): ParsedCandidate<T> {
  if (typeof value !== "string" || byteLength(value) > MAX_GATEWAY_CANDIDATE_BYTES) {
    return { data: null, issuePaths: ["$"] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return { data: null, issuePaths: ["$"] };
  }

  const result = schema.schema.safeParse(parsed);
  if (!result.success) return { data: null, issuePaths: normalizeIssuePaths(result.error) };
  return { data: result.data, issuePaths: [] };
}

function operationSchemaIsTrusted<T>(request: GatewayRequest<T>): boolean {
  const registered = MODEL_OUTPUT_SCHEMA_REGISTRY[request.operation];
  return (
    registered === request.schema &&
    registered.operation === request.operation &&
    registered.version === 1 &&
    registered.versionedId === request.schema.versionedId &&
    registered.schemaVersion === request.schema.schemaVersion
  );
}

function providerOutputSchemaName<T>(request: GatewayRequest<T>): string {
  return `${request.operation}_v${request.schema.version}`;
}

function canonicalLengthDelimited(parts: readonly string[]): Uint8Array {
  const encoded = parts.map((part) => `${byteLength(part)}:${part}`).join("|");
  return new TextEncoder().encode(encoded);
}

async function defaultDigest(input: Uint8Array): Promise<ArrayBuffer> {
  if (globalThis.crypto?.subtle === undefined) throw new Error("crypto_unavailable");
  return globalThis.crypto.subtle.digest("SHA-256", input as unknown as BufferSource);
}

function hexDigest(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  if (bytes.byteLength !== 32) throw new Error("invalid_digest");
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestUtf8(value: string, digest: Digest | undefined): Promise<string> {
  return hexDigest(await (digest ?? defaultDigest)(new TextEncoder().encode(value)));
}

/** Serialize only the exact, registered project_delta.v1 shape for durable persistence. */
function canonicalProjectDeltaText(value: unknown): string {
  const parsed = projectDeltaV1Schema.safeParse(value);
  if (!parsed.success) throw new Error("invalid_project_delta");
  const text = serializeCanonicalJsonV1(parsed.data);
  if (byteLength(text) > MAX_VALIDATED_PROJECT_DELTA_BYTES) {
    throw new Error("project_delta_too_large");
  }
  return text;
}

/** Serialize a validated subject-aware output for the bounded v3 replay contract. */
function canonicalValidatedOutputText<T>(
  request: GatewayRequest<T>,
  value: unknown,
): string | null {
  if (!isTypedRequest(request) || !isReplayableTypedOperation(request.operation)) return null;
  const parsed = request.schema.schema.safeParse(value);
  if (!parsed.success) throw new Error("invalid_validated_output");
  const text = serializeCanonicalJsonV1(parsed.data);
  if (byteLength(text) > MAX_VALIDATED_OUTPUT_BYTES) {
    throw new Error("validated_output_too_large");
  }
  return text;
}

async function requestFingerprint<T>(
  request: GatewayRequest<T>,
  digest: Digest | undefined,
): Promise<string> {
  const basis = isTypedRequest(request)
    ? request.logicalIdempotencyFingerprint === undefined
      ? [
          MODEL_REQUEST_FINGERPRINT_VERSION,
          request.subject.kind,
          request.subject.id,
          String(request.subject.version),
          request.operation,
          request.schema.id,
          request.schema.versionedId,
          request.schema.schemaVersion,
          request.reviewPolicy,
          request.systemInstruction,
          request.input,
        ]
      : [
          MODEL_REQUEST_FINGERPRINT_VERSION,
          request.logicalIdempotencyFingerprint,
          request.operation,
          request.schema.id,
          request.schema.versionedId,
          request.schema.schemaVersion,
          request.subject.kind,
          request.subject.id,
          String(request.subject.version),
          request.reviewPolicy,
          request.systemInstruction,
        ]
    : request.logicalIdempotencyFingerprint === undefined
      ? [
          request.operation,
          request.schema.id,
          request.schema.versionedId,
          request.projectId,
          String(request.projectStateVersion),
          request.reviewPolicy,
          request.systemInstruction,
          request.input,
        ]
      : [
          "unseenprompt.logical-idempotency-fingerprint.v1",
          request.logicalIdempotencyFingerprint,
          request.operation,
          request.schema.id,
          request.schema.versionedId,
          request.schema.schemaVersion,
          request.projectId,
          request.reviewPolicy,
          request.systemInstruction,
        ];
  const hash = await (digest ?? defaultDigest)(canonicalLengthDelimited(basis));
  const bytes = new Uint8Array(hash);
  if (bytes.byteLength !== 32) throw new Error("invalid_digest");
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function completionMetadata<T>(
  runtime: GatewayRuntime<T>,
  errorCode: ModelErrorCode | null,
  validationResult: RecordedModelValidationResult,
  route: ModelRoute | null,
): GenerationRunCompletionInput {
  const usages = runtime.calls.map((call) => call.usage);
  const costs = runtime.calls.map((call) => call.estimatedCostMicros);
  const latency = runtime.calls.reduce((sum, call) => sum + call.latencyMs, 0);
  return {
    runId: "",
    status: errorCode === "aborted" || errorCode === "deadline_exceeded" ? "canceled" : "failed",
    provider: route?.provider ?? null,
    model: route?.model ?? null,
    latencyMs: Number.isSafeInteger(latency) ? latency : null,
    inputTokens: aggregateUsage(usages).inputTokens,
    outputTokens: aggregateUsage(usages).outputTokens,
    retryCount: runtime.transportRetryCount,
    estimatedCostMicros: aggregateEstimatedCostMicros(costs),
    validationResult,
    errorCode,
  };
}

function publicCallMetadata(call: CallRecord): ModelCallMetadataInternal {
  const usage = Object.freeze({ ...call.usage });
  return Object.freeze({
    provider: call.provider,
    model: call.model,
    resolvedModel: call.resolvedModel,
    kind: call.kind,
    latencyMs: call.latencyMs,
    usage,
    estimatedCostMicros: call.estimatedCostMicros,
    outcome: call.outcome,
    validationResult: call.validationResult,
    requestId: call.requestId,
  });
}

function aggregateExecutionMetadata<T>(
  runtime: GatewayRuntime<T>,
  candidate: ValidCandidate<T>,
  errorCode: ModelErrorCode | null,
): ModelExecutionMetadata {
  const usages = runtime.calls.map((call) => call.usage);
  const costs = runtime.calls.map((call) => call.estimatedCostMicros);
  const usage = aggregateUsage(usages);
  const calls = runtime.calls.map((call) => Object.freeze(publicCallMetadata(call)));
  Object.freeze(usage);
  Object.freeze(calls);
  return Object.freeze({
    generationRunId: runtime.generationRunId,
    projectStateVersion: runtime.projectStateVersion,
    correlationId: runtime.correlationId,
    provider: candidate.route.provider,
    model: candidate.route.model,
    resolvedModel: candidate.resolvedModel,
    latencyMs: runtime.calls.reduce((sum, call) => sum + call.latencyMs, 0),
    usage,
    estimatedCostMicros: aggregateEstimatedCostMicros(costs),
    retryCount: runtime.transportRetryCount,
    validationResult: candidate.validationResult,
    calls,
    errorCode,
    replayed: false,
  });
}

function validateEnvironment(
  environment: ModelEnvironment,
  adapters: ModelGatewayDependencies["adapters"],
): boolean {
  const budgets = environment.budgets;
  if (
    budgets.productionCalls !== 3 ||
    budgets.transportRetries !== 1 ||
    budgets.repairs !== 1 ||
    budgets.fallbackEntries !== 1 ||
    budgets.reviewerCalls !== 1 ||
    budgets.absoluteCalls !== 4 ||
    !Number.isSafeInteger(environment.totalDeadlineMs) ||
    environment.totalDeadlineMs < 1_000 ||
    environment.totalDeadlineMs > 120_000 ||
    !Number.isSafeInteger(environment.attemptTimeoutMs) ||
    environment.attemptTimeoutMs < 500 ||
    environment.attemptTimeoutMs > 60_000 ||
    environment.attemptTimeoutMs > environment.totalDeadlineMs
  ) {
    return false;
  }
  if (environment.primary.provider === environment.fallback.provider) return false;
  for (const route of [environment.primary, environment.fallback, environment.reviewer]) {
    if (route === null) continue;
    if (
      !PROVIDER_IDS.has(route.provider) ||
      route.model.trim() !== route.model ||
      route.model.length === 0 ||
      route.model.length > 160
    )
      return false;
    if (
      !Number.isSafeInteger(route.inputCostMicrosPerMillionTokens) ||
      route.inputCostMicrosPerMillionTokens < 0 ||
      route.inputCostMicrosPerMillionTokens > MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX
    )
      return false;
    if (
      !Number.isSafeInteger(route.outputCostMicrosPerMillionTokens) ||
      route.outputCostMicrosPerMillionTokens < 0 ||
      route.outputCostMicrosPerMillionTokens > MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX
    )
      return false;
    const adapter = adapters[route.provider];
    if (adapter === undefined || adapter.providerId !== route.provider) return false;
  }
  if (
    !Number.isSafeInteger(environment.maxOutputTokens) ||
    environment.maxOutputTokens < 64 ||
    environment.maxOutputTokens > 65_536
  )
    return false;
  return true;
}

function isValidSubject(value: unknown): value is ModelExecutionSubject {
  if (typeof value !== "object" || value === null) return false;
  const subject = value as Partial<ModelExecutionSubject>;
  if (subject.kind !== "composer_draft" && subject.kind !== "project") return false;
  if (!isUuid(subject.id)) return false;
  if (!isSafeNonNegativeInteger(subject.version) || subject.version <= 0) return false;
  try {
    return (
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).sort().join(",") === "id,kind,version"
    );
  } catch {
    return false;
  }
}

function validateRequest<T>(request: GatewayRequest<T>, environment: ModelEnvironment): boolean {
  if (typeof request !== "object" || request === null) return false;
  if (isTypedRequest(request)) {
    if (!isValidSubject(request.subject)) return false;
    if (
      (request.subject.kind === "composer_draft" && request.operation !== "intent_detection") ||
      (request.subject.kind === "project" && !isProjectTypedOperation(request.operation))
    ) {
      return false;
    }
    // The typed request must not carry a second, legacy identity even if a caller uses a cast.
    if (Object.prototype.hasOwnProperty.call(request, "projectId")) return false;
    if (Object.prototype.hasOwnProperty.call(request, "projectStateVersion")) return false;
  } else {
    if (!isUuid(request.projectId)) return false;
    if (!Number.isSafeInteger(request.projectStateVersion) || request.projectStateVersion <= 0)
      return false;
  }
  if (typeof request.idempotencyKey !== "string") return false;
  const keyBytes = byteLength(request.idempotencyKey);
  if (keyBytes <= 0 || keyBytes > 255 || request.idempotencyKey.trim() !== request.idempotencyKey)
    return false;
  if (typeof request.systemInstruction !== "string" || typeof request.input !== "string")
    return false;
  if (
    request.systemInstruction.trim().length === 0 ||
    request.input.trim().length === 0 ||
    byteLength(request.systemInstruction) + byteLength(request.input) > MAX_GATEWAY_INPUT_BYTES
  )
    return false;
  if (!operationSchemaIsTrusted(request)) return false;
  if (
    request.logicalIdempotencyFingerprint !== undefined &&
    (typeof request.logicalIdempotencyFingerprint !== "string" ||
      !SHA256_PATTERN.test(request.logicalIdempotencyFingerprint))
  )
    return false;
  if (
    request.reviewPolicy !== "none" &&
    request.reviewPolicy !== "best_effort" &&
    request.reviewPolicy !== "required"
  )
    return false;
  if (request.reviewPolicy !== "none" && environment.reviewer === null) return false;
  if (
    request.deadlineMs !== undefined &&
    (!Number.isSafeInteger(request.deadlineMs) || request.deadlineMs <= 0)
  )
    return false;
  return true;
}

function updateCallValidation(
  call: CallRecord,
  validationResult: RecordedModelValidationResult,
): CallRecord {
  return { ...call, validationResult };
}

function isRetryAfterCode(error: ModelGatewayError): boolean {
  return RETRYABLE_CODES.has(error.code);
}

function isAttemptFailure(value: AttemptSuccess | AttemptFailure): value is AttemptFailure {
  return "error" in value;
}

function makeAttemptSignal(
  callerSignal: AbortSignal | undefined,
  totalRemainingMs: number,
  attemptTimeoutMs: number,
  timer: DeadlineTimer,
) {
  const options = { totalRemainingMs, attemptTimeoutMs, timer };
  return callerSignal === undefined
    ? createCombinedAttemptSignal(options)
    : createCombinedAttemptSignal({ ...options, callerSignal });
}

function canFallback(error: ModelGatewayError): boolean {
  return !NO_FALLBACK_CODES.has(error.code);
}

/** Provider-neutral bounded gateway state machine. */
export interface ModelGateway {
  execute<T>(request: GatewayRequest<T>): Promise<ValidatedModelResponse<T>>;
}

export function createModelGateway(dependencies: ModelGatewayDependencies): ModelGateway {
  const now = dependencies.now ?? (() => Date.now());
  const timer = dependencies.timer ?? DEFAULT_DEADLINE_TIMER;
  const sleep = dependencies.sleep ?? ((delayMs, signal) => abortableDelay(delayMs, signal, timer));

  const completeWithRetry = async (
    input: GatewayCompletionInput,
    correlationId: string,
    identity: {
      readonly correlationId: string;
      readonly projectStateVersion?: number;
      readonly subject?: ModelExecutionSubject;
      readonly operationKind: string;
      readonly inputSchemaVersion: string;
      readonly outputSchemaVersion: string;
    },
  ): Promise<GatewayCompletion> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if ("subject" in input) {
          const completeV3 = dependencies.store.completeV3;
          if (completeV3 === undefined) throw new CompletionEchoMismatch();
          const completed = await completeV3(input);
          if (
            completed.runId !== input.runId ||
            completed.status !== input.status ||
            completed.subject.kind !== input.subject.kind ||
            completed.subject.id !== input.subject.id ||
            completed.subject.version !== input.subject.version ||
            completed.provider !== input.provider ||
            completed.model !== input.model ||
            completed.latencyMs !== input.latencyMs ||
            completed.inputTokens !== input.inputTokens ||
            completed.outputTokens !== input.outputTokens ||
            completed.retryCount !== input.retryCount ||
            completed.estimatedCostMicros !== input.estimatedCostMicros ||
            completed.validationResult !== input.validationResult ||
            completed.errorCode !== input.errorCode ||
            completed.correlationId !== identity.correlationId ||
            completed.operationKind !== identity.operationKind ||
            completed.inputSchemaVersion !== identity.inputSchemaVersion ||
            completed.outputSchemaVersion !== identity.outputSchemaVersion ||
            completed.validatedOutputText !== (input.validatedOutputText ?? null)
          ) {
            throw new CompletionEchoMismatch();
          }
          if (input.validatedOutputText !== undefined && input.validatedOutputText !== null) {
            if (completed.validatedOutputHash === null) throw new CompletionEchoMismatch();
            const expectedHash = await digestUtf8(input.validatedOutputText, dependencies.digest);
            if (completed.validatedOutputHash !== expectedHash) {
              throw new CompletionEchoMismatch();
            }
          } else if (completed.validatedOutputHash !== null) {
            throw new CompletionEchoMismatch();
          }
          return completed;
        }

        const completed = await dependencies.store.complete(input);
        if (
          completed.runId !== input.runId ||
          completed.status !== input.status ||
          completed.provider !== input.provider ||
          completed.model !== input.model ||
          completed.latencyMs !== input.latencyMs ||
          completed.inputTokens !== input.inputTokens ||
          completed.outputTokens !== input.outputTokens ||
          completed.retryCount !== input.retryCount ||
          completed.estimatedCostMicros !== input.estimatedCostMicros ||
          completed.validationResult !== input.validationResult ||
          completed.errorCode !== input.errorCode ||
          completed.correlationId !== identity.correlationId ||
          completed.projectStateVersion !== identity.projectStateVersion ||
          completed.operationKind !== identity.operationKind ||
          completed.inputSchemaVersion !== identity.inputSchemaVersion ||
          completed.outputSchemaVersion !== identity.outputSchemaVersion ||
          completed.validatedProjectDeltaText !== (input.validatedProjectDeltaText ?? null)
        ) {
          throw new CompletionEchoMismatch();
        }
        if (
          input.validatedProjectDeltaText !== undefined &&
          input.validatedProjectDeltaText !== null
        ) {
          if (completed.validatedProjectDeltaHash === null) throw new CompletionEchoMismatch();
          const expectedHash = await digestUtf8(
            input.validatedProjectDeltaText,
            dependencies.digest,
          );
          if (completed.validatedProjectDeltaHash !== expectedHash) {
            throw new CompletionEchoMismatch();
          }
        } else if (completed.validatedProjectDeltaHash !== null) {
          throw new CompletionEchoMismatch();
        }
        return completed;
      } catch (error: unknown) {
        if (error instanceof CompletionEchoMismatch) {
          throw createModelGatewayError("persistence_failed", correlationId);
        }
        const mapped = safeError(error, correlationId, "persistence_failed");
        // A persistence failure has an unknown commit outcome. Retry the idempotent completion
        // once, but never call a provider again.
        if (attempt === 0 && mapped.code === "persistence_failed") continue;
        throw createModelGatewayError("persistence_failed", correlationId);
      }
    }
    throw createModelGatewayError("persistence_failed", correlationId);
  };

  const execute = async <T>(request: GatewayRequest<T>): Promise<ValidatedModelResponse<T>> => {
    const correlationId = safeCorrelationId(dependencies.createCorrelationId);
    const startedAtMs = safeNow(now);
    const configuredTotal = effectiveDeadlineMs(
      dependencies.environment.totalDeadlineMs,
      request.deadlineMs,
    );
    const deadlineAtMs = startedAtMs + configuredTotal;

    if (
      !validateEnvironment(dependencies.environment, dependencies.adapters) ||
      !validateRequest(request, dependencies.environment) ||
      (isTypedRequest(request) &&
        (dependencies.store.claimV3 === undefined ||
          dependencies.store.completeV3 === undefined)) ||
      configuredTotal <= 0
    ) {
      throw createModelGatewayError("configuration_error", correlationId);
    }
    if (request.signal?.aborted === true) throw createModelGatewayError("aborted", correlationId);
    if (remainingDeadlineMs(deadlineAtMs, safeNow(now)) <= 0) {
      throw createModelGatewayError("deadline_exceeded", correlationId);
    }

    let fingerprint: string;
    try {
      fingerprint = await requestFingerprint(request, dependencies.digest);
    } catch {
      throw createModelGatewayError("configuration_error", correlationId);
    }

    let claim: GatewayClaim;
    try {
      if (isTypedRequest(request)) {
        if (dependencies.store.claimV3 === undefined) {
          throw createModelGatewayError("configuration_error", correlationId);
        }
        claim = await dependencies.store.claimV3({
          subject: request.subject,
          idempotencyKey: request.idempotencyKey,
          requestFingerprint: fingerprint,
          operationKind: request.operation,
          inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
          outputSchemaVersion: request.schema.schemaVersion,
        });
      } else {
        claim = await dependencies.store.claim({
          projectId: request.projectId,
          projectStateVersion: request.projectStateVersion,
          idempotencyKey: request.idempotencyKey,
          requestFingerprint: fingerprint,
          operationKind: request.operation,
          inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
          outputSchemaVersion: request.schema.schemaVersion,
          allowHistoricalReplay: request.logicalIdempotencyFingerprint !== undefined,
        });
      }
    } catch (error: unknown) {
      throw safeError(error, correlationId, "persistence_failed");
    }

    const historicalReplayAllowed =
      !isTypedRequest(request) &&
      claim.status === "replayed" &&
      request.logicalIdempotencyFingerprint !== undefined;
    if (isTypedRequest(request)) {
      const typedClaim = claim as GenerationRunClaimV3;
      if (
        !isUuid(typedClaim.runId) ||
        !isUuid(typedClaim.correlationId) ||
        !isValidSubject(typedClaim.subject) ||
        typedClaim.subject.kind !== request.subject.kind ||
        typedClaim.subject.id !== request.subject.id ||
        typedClaim.subject.version !== request.subject.version ||
        typedClaim.operationKind !== request.operation ||
        typedClaim.inputSchemaVersion !== GENERATION_RUN_INPUT_SCHEMA_VERSION_V3 ||
        typedClaim.outputSchemaVersion !== request.schema.schemaVersion
      ) {
        throw createModelGatewayError("persistence_failed", correlationId);
      }
    } else {
      const legacyClaim = claim as GenerationRunClaim;
      if (
        !isUuid(claim.runId) ||
        !isUuid(claim.correlationId) ||
        !isSafeNonNegativeInteger(legacyClaim.projectStateVersion) ||
        legacyClaim.projectStateVersion <= 0 ||
        (legacyClaim.projectStateVersion !== request.projectStateVersion &&
          !historicalReplayAllowed) ||
        legacyClaim.operationKind !== request.operation ||
        legacyClaim.inputSchemaVersion !== GENERATION_RUN_INPUT_SCHEMA_VERSION ||
        legacyClaim.outputSchemaVersion !== request.schema.schemaVersion
      ) {
        // A real store owns correlation identity. The locally-generated value is used only for
        // pre-claim errors; once claimed, metadata follows the durable correlation UUID.
        throw createModelGatewayError("persistence_failed", correlationId);
      }
    }

    if (claim.status === "replayed" && isTypedRequest(request)) {
      const typedClaim = claim as Extract<GenerationRunClaimV3, { status: "replayed" }>;
      if (
        !isReplayableTypedOperation(request.operation) ||
        typedClaim.operationKind !== request.operation ||
        typedClaim.outputSchemaVersion !== request.schema.schemaVersion ||
        !PROVIDER_IDS.has(typedClaim.provider) ||
        typeof typedClaim.model !== "string" ||
        typedClaim.model.trim() !== typedClaim.model ||
        typedClaim.model.length === 0 ||
        byteLength(typedClaim.model) > MAX_METADATA_TEXT_BYTES ||
        !isSafeNonNegativeInteger(typedClaim.latencyMs) ||
        (typedClaim.inputTokens !== null && !isSafeNonNegativeInteger(typedClaim.inputTokens)) ||
        (typedClaim.outputTokens !== null && !isSafeNonNegativeInteger(typedClaim.outputTokens)) ||
        !isSafeNonNegativeInteger(typedClaim.retryCount) ||
        (typedClaim.estimatedCostMicros !== null &&
          !isSafeNonNegativeInteger(typedClaim.estimatedCostMicros)) ||
        !["passed", "repaired", "reviewed"].includes(typedClaim.validationResult) ||
        typedClaim.errorCode !== null ||
        typeof typedClaim.validatedOutputText !== "string" ||
        byteLength(typedClaim.validatedOutputText) > MAX_VALIDATED_OUTPUT_BYTES ||
        typeof typedClaim.validatedOutputHash !== "string" ||
        !SHA256_PATTERN.test(typedClaim.validatedOutputHash)
      ) {
        throw createModelGatewayError("persistence_failed", correlationId);
      }

      let storedHash: string;
      try {
        storedHash = await digestUtf8(typedClaim.validatedOutputText, dependencies.digest);
      } catch {
        throw createModelGatewayError("persistence_failed", correlationId);
      }
      if (storedHash !== typedClaim.validatedOutputHash) {
        throw createModelGatewayError("persistence_failed", correlationId);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(typedClaim.validatedOutputText) as unknown;
      } catch {
        throw createModelGatewayError("persistence_failed", correlationId);
      }
      const validated = request.schema.schema.safeParse(parsed);
      if (!validated.success) {
        throw createModelGatewayError("persistence_failed", correlationId);
      }
      try {
        if (serializeCanonicalJsonV1(validated.data) !== typedClaim.validatedOutputText) {
          throw new Error("noncanonical_validated_output");
        }
      } catch {
        throw createModelGatewayError("persistence_failed", correlationId);
      }

      const inputTokens = typedClaim.inputTokens;
      const outputTokens = typedClaim.outputTokens;
      const totalTokens =
        inputTokens !== null &&
        outputTokens !== null &&
        Number.isSafeInteger(inputTokens + outputTokens)
          ? inputTokens + outputTokens
          : null;
      const usage = Object.freeze({ inputTokens, outputTokens, totalTokens });
      const calls = Object.freeze([]) as readonly [];
      const metadata = Object.freeze({
        generationRunId: typedClaim.runId,
        // ModelExecutionMetadata intentionally remains the Phase 5 shape. For a typed subject the
        // subject version is the only compatible version field available to callers.
        projectStateVersion: typedClaim.subject.version,
        correlationId: typedClaim.correlationId,
        provider: typedClaim.provider,
        model: typedClaim.model,
        resolvedModel: null,
        latencyMs: typedClaim.latencyMs,
        usage,
        estimatedCostMicros: typedClaim.estimatedCostMicros,
        retryCount: typedClaim.retryCount,
        validationResult: typedClaim.validationResult,
        calls,
        errorCode: null,
        replayed: true,
      });
      return { data: validated.data as T, metadata };
    }

    if (claim.status === "replayed" && !isTypedRequest(request)) {
      const legacyReplayClaim = claim as Extract<GenerationRunClaim, { status: "replayed" }>;
      if (
        request.operation !== "project_delta" ||
        legacyReplayClaim.outputSchemaVersion !== "unseenprompt.model-output.project_delta.v1" ||
        !PROVIDER_IDS.has(legacyReplayClaim.provider) ||
        typeof legacyReplayClaim.model !== "string" ||
        legacyReplayClaim.model.trim() !== legacyReplayClaim.model ||
        legacyReplayClaim.model.length === 0 ||
        byteLength(legacyReplayClaim.model) > MAX_METADATA_TEXT_BYTES ||
        !isSafeNonNegativeInteger(legacyReplayClaim.latencyMs) ||
        (legacyReplayClaim.inputTokens !== null &&
          !isSafeNonNegativeInteger(legacyReplayClaim.inputTokens)) ||
        (legacyReplayClaim.outputTokens !== null &&
          !isSafeNonNegativeInteger(legacyReplayClaim.outputTokens)) ||
        !isSafeNonNegativeInteger(legacyReplayClaim.retryCount) ||
        (legacyReplayClaim.estimatedCostMicros !== null &&
          !isSafeNonNegativeInteger(legacyReplayClaim.estimatedCostMicros)) ||
        !["passed", "repaired", "reviewed"].includes(legacyReplayClaim.validationResult) ||
        legacyReplayClaim.errorCode !== null ||
        typeof legacyReplayClaim.validatedProjectDeltaText !== "string" ||
        byteLength(legacyReplayClaim.validatedProjectDeltaText) >
          MAX_VALIDATED_PROJECT_DELTA_BYTES ||
        typeof legacyReplayClaim.validatedProjectDeltaHash !== "string" ||
        !SHA256_PATTERN.test(legacyReplayClaim.validatedProjectDeltaHash)
      ) {
        throw createModelGatewayError("persistence_failed", correlationId);
      }

      let storedHash: string;
      try {
        // Hash the exact UTF-8 bytes before attempting JSON.parse. This is the replay trust
        // boundary: a tampered body never reaches the schema parser or a provider.
        storedHash = await digestUtf8(
          legacyReplayClaim.validatedProjectDeltaText,
          dependencies.digest,
        );
      } catch {
        throw createModelGatewayError("persistence_failed", correlationId);
      }
      if (storedHash !== legacyReplayClaim.validatedProjectDeltaHash) {
        throw createModelGatewayError("persistence_failed", correlationId);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(legacyReplayClaim.validatedProjectDeltaText) as unknown;
      } catch {
        throw createModelGatewayError("persistence_failed", correlationId);
      }
      const validated = MODEL_OUTPUT_SCHEMA_REGISTRY.project_delta.schema.safeParse(parsed);
      if (!validated.success) {
        throw createModelGatewayError("persistence_failed", correlationId);
      }
      try {
        // Completion stores canonical text. Requiring the same bytes rejects a forged but
        // re-hashed alternate representation before any caller receives model-shaped data.
        if (
          serializeCanonicalJsonV1(validated.data) !== legacyReplayClaim.validatedProjectDeltaText
        ) {
          throw new Error("noncanonical_project_delta");
        }
      } catch {
        throw createModelGatewayError("persistence_failed", correlationId);
      }

      const inputTokens = legacyReplayClaim.inputTokens;
      const outputTokens = legacyReplayClaim.outputTokens;
      const totalTokens =
        inputTokens !== null &&
        outputTokens !== null &&
        Number.isSafeInteger(inputTokens + outputTokens)
          ? inputTokens + outputTokens
          : null;
      const usage = Object.freeze({ inputTokens, outputTokens, totalTokens });
      const calls = Object.freeze([]) as readonly [];
      const metadata = Object.freeze({
        generationRunId: legacyReplayClaim.runId,
        projectStateVersion: legacyReplayClaim.projectStateVersion,
        correlationId: legacyReplayClaim.correlationId,
        provider: legacyReplayClaim.provider,
        model: legacyReplayClaim.model,
        resolvedModel: null,
        latencyMs: legacyReplayClaim.latencyMs,
        usage,
        estimatedCostMicros: legacyReplayClaim.estimatedCostMicros,
        retryCount: legacyReplayClaim.retryCount,
        validationResult: legacyReplayClaim.validationResult,
        calls,
        errorCode: null,
        replayed: true,
      });
      return { data: validated.data as T, metadata };
    }

    if (claim.status !== "running") {
      throw createModelGatewayError("persistence_failed", correlationId);
    }

    const runningClaim = claim as
      | Extract<GenerationRunClaim, { status: "running" }>
      | Extract<GenerationRunClaimV3, { status: "running" }>;
    const runtime: GatewayRuntime<T> = {
      request,
      generationRunId: runningClaim.runId,
      projectStateVersion: isTypedRequest(request)
        ? request.subject.version
        : (runningClaim as Extract<GenerationRunClaim, { status: "running" }>).projectStateVersion,
      correlationId: runningClaim.correlationId,
      startedAtMs,
      deadlineAtMs,
      calls: [],
      productionCallCount: 0,
      transportRetryCount: 0,
      repairCount: 0,
      fallbackCount: 0,
      absoluteCallCount: 0,
    };

    const failAfterClaim = async (
      error: ModelGatewayError,
      validationResult: RecordedModelValidationResult = "not_attempted",
      route: ModelRoute | null = null,
    ): Promise<never> => {
      const completion = completionMetadata(runtime, error.code, validationResult, route);
      try {
        if (isTypedRequest(request)) {
          await completeWithRetry(
            {
              ...completion,
              runId: claim.runId,
              subject: request.subject,
              validatedOutputText: null,
            },
            runtime.correlationId,
            {
              correlationId: runtime.correlationId,
              subject: request.subject,
              operationKind: request.operation,
              inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
              outputSchemaVersion: request.schema.schemaVersion,
            },
          );
        } else {
          await completeWithRetry({ ...completion, runId: claim.runId }, runtime.correlationId, {
            correlationId: runtime.correlationId,
            projectStateVersion: runtime.projectStateVersion,
            operationKind: request.operation,
            inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
            outputSchemaVersion: request.schema.schemaVersion,
          });
        }
      } catch {
        // The original provider/gateway failure is safe to return after best-effort terminal
        // persistence. Successful output paths remain fail-closed on persistence errors.
      }
      throw createModelGatewayError(error.code, runtime.correlationId, {
        ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
      });
    };

    const remaining = (): number => remainingDeadlineMs(runtime.deadlineAtMs, safeNow(now));

    const ensureActiveAfterClaim = (): ModelGatewayError | null => {
      if (request.signal?.aborted) return createModelGatewayError("aborted", runtime.correlationId);
      if (remaining() <= 0)
        return createModelGatewayError("deadline_exceeded", runtime.correlationId);
      return null;
    };

    if (request.signal?.aborted)
      return failAfterClaim(createModelGatewayError("aborted", runtime.correlationId));
    if (remaining() <= 0)
      return failAfterClaim(createModelGatewayError("deadline_exceeded", runtime.correlationId));

    const invoke = async (
      route: ModelRoute,
      kind: ModelCallKind,
      systemInstruction: string,
      input: string,
      allowTransportRetry: boolean,
    ): Promise<AttemptSuccess | AttemptFailure> => {
      const perform = async (callKind: ModelCallKind): Promise<AttemptSuccess | AttemptFailure> => {
        if (runtime.absoluteCallCount >= MODEL_EXECUTION_BUDGETS.absoluteCalls) {
          return {
            error: createModelGatewayError("provider_error", runtime.correlationId),
            route,
            calls: runtime.calls,
          };
        }
        runtime.absoluteCallCount += 1;
        runtime.productionCallCount += callKind === "reviewer" ? 0 : 1;
        const callStart = safeNow(now);
        const combined = makeAttemptSignal(
          request.signal,
          remaining(),
          dependencies.environment.attemptTimeoutMs,
          timer,
        );
        let result: ProviderAdapterResult | null = null;
        let error: ModelGatewayError | null = null;
        try {
          const initialReason = combined.reason();
          if (initialReason === "caller") {
            error = createModelGatewayError("aborted", runtime.correlationId);
          } else if (initialReason === "deadline") {
            error = createModelGatewayError("deadline_exceeded", runtime.correlationId);
          } else if (initialReason === "attempt_timeout") {
            error = createModelGatewayError("attempt_timeout", runtime.correlationId);
          } else {
            const adapter = dependencies.adapters[route.provider];
            if (adapter === undefined) {
              error = createModelGatewayError("configuration_error", runtime.correlationId);
            } else {
              const candidateResult: unknown = await adapter.generate({
                model: route.model,
                systemInstruction,
                input,
                outputSchema: request.schema.jsonSchema,
                outputSchemaName: providerOutputSchemaName(request),
                maxOutputTokens: dependencies.environment.maxOutputTokens,
                correlationId: runtime.correlationId,
                signal: combined.signal,
              });
              if (!isAdapterResult(candidateResult)) {
                error = createModelGatewayError("provider_error", runtime.correlationId);
              } else {
                result = candidateResult;
              }
            }
          }
        } catch (caught: unknown) {
          const reason = combined.reason();
          if (reason === "caller")
            error = createModelGatewayError("aborted", runtime.correlationId);
          else if (reason === "deadline")
            error = createModelGatewayError("deadline_exceeded", runtime.correlationId);
          else if (reason === "attempt_timeout")
            error = createModelGatewayError("attempt_timeout", runtime.correlationId);
          else error = safeError(caught, runtime.correlationId, "provider_error");
        } finally {
          combined.cleanup();
        }

        if (error === null) {
          const reason = combined.reason();
          if (reason === "caller")
            error = createModelGatewayError("aborted", runtime.correlationId);
          else if (reason === "deadline")
            error = createModelGatewayError("deadline_exceeded", runtime.correlationId);
          else if (reason === "attempt_timeout")
            error = createModelGatewayError("attempt_timeout", runtime.correlationId);
        }

        const latencyMs = Math.max(0, Math.floor(safeNow(now) - callStart));
        const usage = safeUsage(result?.usage);
        const call: CallRecord = {
          provider: route.provider,
          model: route.model,
          resolvedModel: safeMetadataString(
            result?.resolvedModel,
            error === null ? route.model : null,
          ),
          kind: callKind,
          latencyMs,
          usage,
          estimatedCostMicros: estimateCostMicros(usage, route),
          outcome: error?.code ?? "success",
          validationResult: "not_attempted",
          requestId: safeMetadataString(result?.requestId),
          route,
          callIndex: runtime.calls.length,
        };
        runtime.calls.push(call);
        try {
          emitDiagnostic(dependencies.logger, {
            event: "model.gateway.call",
            correlationId: runtime.correlationId,
            provider: route.provider,
            model: route.model,
            kind: callKind,
            attempt: runtime.calls.length,
            durationMs: latencyMs,
            status: error?.httpStatus ?? null,
            code: error?.code ?? "success",
            retryCount: runtime.transportRetryCount,
            validationResult: "not_attempted",
            usedFallback: runtime.fallbackCount > 0,
            usedRepair: runtime.repairCount > 0,
            usedReviewer: callKind === "reviewer",
          });
        } catch {
          // Diagnostics are advisory and must never alter gateway control flow.
        }

        if (error !== null) return { error, route, calls: runtime.calls };
        return { result: result as ProviderAdapterResult, route, call };
      };

      const first = await perform(kind);
      if (
        !isAttemptFailure(first) ||
        !allowTransportRetry ||
        !isRetryAfterCode(first.error) ||
        runtime.transportRetryCount >= MODEL_EXECUTION_BUDGETS.transportRetries ||
        runtime.productionCallCount >= MODEL_EXECUTION_BUDGETS.productionCalls
      ) {
        return first;
      }

      const delay = Math.min(first.error.retryAfterMs ?? 250, 2_000);
      const delaySignal = makeAttemptSignal(request.signal, remaining(), remaining(), timer);
      try {
        await sleep(delay, delaySignal.signal);
      } catch {
        const reason = delaySignal.reason();
        const error =
          reason === "caller"
            ? createModelGatewayError("aborted", runtime.correlationId)
            : reason === "deadline"
              ? createModelGatewayError("deadline_exceeded", runtime.correlationId)
              : createModelGatewayError("provider_error", runtime.correlationId);
        delaySignal.cleanup();
        return { error, route, calls: runtime.calls };
      }
      delaySignal.cleanup();
      if (remaining() <= 0) {
        return {
          error: createModelGatewayError("deadline_exceeded", runtime.correlationId),
          route,
          calls: runtime.calls,
        };
      }
      runtime.transportRetryCount += 1;
      return perform("transport_retry");
    };

    const repairCandidate = async (
      route: ModelRoute,
      rejectedValue: unknown,
      issuePaths: readonly string[],
    ): Promise<ValidCandidate<T> | AttemptFailure> => {
      if (
        runtime.repairCount >= MODEL_EXECUTION_BUDGETS.repairs ||
        runtime.productionCallCount >= MODEL_EXECUTION_BUDGETS.productionCalls
      ) {
        return {
          error: createModelGatewayError("invalid_output", runtime.correlationId),
          route,
          calls: runtime.calls,
        };
      }
      runtime.repairCount += 1;
      const rejected =
        typeof rejectedValue === "string"
          ? boundedText(rejectedValue, MAX_REPAIR_CANDIDATE_BYTES)
          : "";
      const paths = issuePaths
        .slice(0, MAX_REPAIR_ISSUES)
        .map((path) => boundedText(path, MAX_REPAIR_ISSUE_BYTES));
      const pathText = paths.map((path) => `- ${path}`).join("\n");
      const repairInstruction =
        "\nReturn only a corrected JSON object matching the supplied schema. Do not include commentary.";
      const repairSystem = `${boundedText(
        request.systemInstruction,
        Math.max(0, 64 * 1024 - byteLength(repairInstruction)),
      )}${repairInstruction}`;
      const fixed = `\n\nRejected candidate:\n${rejected}\nValidation paths:\n${pathText}`;
      const inputBudget = Math.max(
        0,
        MAX_GATEWAY_INPUT_BYTES - byteLength(repairSystem) - byteLength(fixed),
      );
      const repairInput = `${boundedText(request.input, inputBudget)}${fixed}`;
      const attempt = await invoke(route, "repair", repairSystem, repairInput, false);
      if (isAttemptFailure(attempt)) return attempt;
      const parsed = parseCandidate(attempt.result.value, request.schema);
      if (parsed.data === null) {
        runtime.calls[attempt.call.callIndex] = updateCallValidation(attempt.call, "failed");
        return {
          error: createModelGatewayError("invalid_output", runtime.correlationId),
          route,
          calls: runtime.calls,
        };
      }
      runtime.calls[attempt.call.callIndex] = updateCallValidation(attempt.call, "repaired");
      return {
        data: parsed.data,
        route,
        resolvedModel: attempt.call.resolvedModel,
        validationResult: "repaired",
      };
    };

    const runRoute = async (
      route: ModelRoute,
      kind: "primary" | "fallback",
      systemInstruction: string,
      input: string,
    ): Promise<ValidCandidate<T> | AttemptFailure> => {
      const attempt = await invoke(
        route,
        kind,
        systemInstruction,
        input,
        kind !== "fallback" || runtime.transportRetryCount < 1,
      );
      if (isAttemptFailure(attempt)) return attempt;
      const parsed = parseCandidate(attempt.result.value, request.schema);
      if (parsed.data !== null) {
        runtime.calls[attempt.call.callIndex] = updateCallValidation(attempt.call, "passed");
        return {
          data: parsed.data,
          route,
          resolvedModel: attempt.call.resolvedModel,
          validationResult: "passed",
        };
      }

      runtime.calls[attempt.call.callIndex] = updateCallValidation(attempt.call, "failed");
      const repaired = await repairCandidate(route, attempt.result.value, parsed.issuePaths);
      if ("data" in repaired) return repaired;
      return repaired;
    };

    const primary = await runRoute(
      dependencies.environment.primary,
      "primary",
      request.systemInstruction,
      request.input,
    );
    let candidate: ValidCandidate<T> | null = null;
    let failure: AttemptFailure | null = null;
    if ("data" in primary) candidate = primary;
    else failure = primary;

    if (
      candidate === null &&
      failure !== null &&
      canFallback(failure.error) &&
      runtime.fallbackCount < MODEL_EXECUTION_BUDGETS.fallbackEntries &&
      runtime.productionCallCount < MODEL_EXECUTION_BUDGETS.productionCalls
    ) {
      runtime.fallbackCount += 1;
      const fallback = await runRoute(
        dependencies.environment.fallback,
        "fallback",
        request.systemInstruction,
        request.input,
      );
      if ("data" in fallback) candidate = fallback;
      else failure = fallback;
    }

    if (candidate === null) {
      const finalFailure =
        failure?.error ?? createModelGatewayError("provider_error", runtime.correlationId);
      const validationResult: RecordedModelValidationResult = runtime.calls.some(
        (call) => call.validationResult === "failed",
      )
        ? "failed"
        : "not_attempted";
      return failAfterClaim(finalFailure, validationResult, failure?.route ?? null);
    }

    const postProductionError = ensureActiveAfterClaim();
    if (postProductionError !== null) {
      return failAfterClaim(postProductionError, "failed", candidate.route);
    }

    if (request.reviewPolicy !== "none") {
      const reviewerRoute = dependencies.environment.reviewer;
      if (reviewerRoute === null)
        return failAfterClaim(
          createModelGatewayError("configuration_error", runtime.correlationId),
          "failed",
          candidate.route,
        );
      const candidateText = boundedText(JSON.stringify(candidate.data), MAX_REPAIR_CANDIDATE_BYTES);
      const reviewerSystem = boundedText(request.systemInstruction, 64 * 1024);
      const reviewerFixed = `\n\nCandidate to review:\n${candidateText}`;
      const reviewerInputBudget = Math.max(
        0,
        MAX_GATEWAY_INPUT_BYTES - byteLength(reviewerSystem) - byteLength(reviewerFixed),
      );
      const reviewerInput = `${boundedText(request.input, reviewerInputBudget)}${reviewerFixed}`;
      const reviewed = await invoke(
        reviewerRoute,
        "reviewer",
        reviewerSystem,
        reviewerInput,
        false,
      );
      if (reviewed.error === undefined) {
        const parsed = parseCandidate(reviewed.result.value, request.schema);
        if (parsed.data !== null) {
          runtime.calls[reviewed.call.callIndex] = updateCallValidation(reviewed.call, "reviewed");
          candidate = {
            ...candidate,
            data: parsed.data,
            route: reviewerRoute,
            resolvedModel: reviewed.call.resolvedModel,
            validationResult: "reviewed",
          };
        } else {
          runtime.calls[reviewed.call.callIndex] = updateCallValidation(reviewed.call, "failed");
          if (request.reviewPolicy === "required") {
            return failAfterClaim(
              createModelGatewayError("invalid_output", runtime.correlationId),
              "failed",
              candidate.route,
            );
          }
        }
      } else {
        if (request.reviewPolicy === "required") {
          return failAfterClaim(reviewed.error, "failed", candidate.route);
        }
      }
    }

    const postReviewError = ensureActiveAfterClaim();
    if (postReviewError !== null) {
      return failAfterClaim(postReviewError, "failed", candidate.route);
    }

    let validatedProjectDeltaText: string | null = null;
    let validatedOutputText: string | null = null;
    if (!isTypedRequest(request) && request.operation === "project_delta") {
      try {
        validatedProjectDeltaText = canonicalProjectDeltaText(candidate.data);
      } catch {
        // A valid provider candidate that cannot fit the bounded durable proposal contract is not
        // returned to the caller and is recorded only as a safe terminal persistence failure.
        return failAfterClaim(
          createModelGatewayError("persistence_failed", runtime.correlationId),
          "failed",
          candidate.route,
        );
      }
    }
    if (isTypedRequest(request)) {
      try {
        validatedOutputText = canonicalValidatedOutputText(request, candidate.data);
      } catch {
        return failAfterClaim(
          createModelGatewayError("persistence_failed", runtime.correlationId),
          "failed",
          candidate.route,
        );
      }
    }

    const metadata = aggregateExecutionMetadata(runtime, candidate, null);
    if (isTypedRequest(request)) {
      const completionInput: GenerationRunCompletionInputV3 = {
        runId: claim.runId,
        status: "succeeded",
        subject: request.subject,
        provider: candidate.route.provider,
        model: candidate.route.model,
        latencyMs: metadata.latencyMs,
        inputTokens: metadata.usage.inputTokens,
        outputTokens: metadata.usage.outputTokens,
        retryCount: metadata.retryCount,
        estimatedCostMicros: metadata.estimatedCostMicros,
        validationResult: candidate.validationResult,
        errorCode: null,
        validatedOutputText,
      };
      await completeWithRetry(completionInput, runtime.correlationId, {
        correlationId: runtime.correlationId,
        subject: request.subject,
        operationKind: request.operation,
        inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
        outputSchemaVersion: request.schema.schemaVersion,
      });
    } else {
      const completionInput: GenerationRunCompletionInput = {
        runId: claim.runId,
        status: "succeeded",
        provider: candidate.route.provider,
        model: candidate.route.model,
        latencyMs: metadata.latencyMs,
        inputTokens: metadata.usage.inputTokens,
        outputTokens: metadata.usage.outputTokens,
        retryCount: metadata.retryCount,
        estimatedCostMicros: metadata.estimatedCostMicros,
        validationResult: candidate.validationResult,
        errorCode: null,
        validatedProjectDeltaText,
      };
      await completeWithRetry(completionInput, runtime.correlationId, {
        correlationId: runtime.correlationId,
        projectStateVersion: runtime.projectStateVersion,
        operationKind: request.operation,
        inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
        outputSchemaVersion: request.schema.schemaVersion,
      });
    }
    return { data: candidate.data, metadata };
  };

  return {
    execute,
  };
}
