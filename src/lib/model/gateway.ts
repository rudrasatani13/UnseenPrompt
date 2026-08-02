import "server-only";

import type {
  ModelCallKind,
  ModelErrorCode,
  ModelExecutionMetadata,
  ModelGatewayRequest,
  ModelOutputSchema,
  ModelUsage,
  RecordedModelValidationResult,
  ValidatedModelResponse,
} from "@/domain/model/contracts";
import { MODEL_OUTPUT_SCHEMA_REGISTRY } from "@/domain/model/schemas";
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
  type GenerationRunCompletion,
  type GenerationRunCompletionInput,
  type GenerationRunStore,
  GENERATION_RUN_INPUT_SCHEMA_VERSION,
} from "@/lib/model/generation-run-store";

export const MAX_GATEWAY_INPUT_BYTES = 256 * 1024;
export const MAX_GATEWAY_CANDIDATE_BYTES = 1 * 1024 * 1024;
export const MAX_REPAIR_CANDIDATE_BYTES = 180 * 1024;
export const MAX_REPAIR_ISSUES = 32;
export const MAX_REPAIR_ISSUE_BYTES = 200;
export const MAX_METADATA_TEXT_BYTES = 160;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
const PROVIDER_IDS = new Set<ProviderId>(["anthropic", "openai", "gemini"]);

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

interface GatewayRuntime<T> {
  readonly request: ModelGatewayRequest<T>;
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

function operationSchemaIsTrusted<T>(request: ModelGatewayRequest<T>): boolean {
  const registered = MODEL_OUTPUT_SCHEMA_REGISTRY[request.operation];
  return (
    registered === request.schema &&
    registered.operation === request.operation &&
    registered.version === 1 &&
    registered.versionedId === request.schema.versionedId &&
    registered.schemaVersion === request.schema.schemaVersion
  );
}

function providerOutputSchemaName<T>(request: ModelGatewayRequest<T>): string {
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

async function requestFingerprint<T>(
  request: ModelGatewayRequest<T>,
  digest: Digest | undefined,
): Promise<string> {
  const hash = await (digest ?? defaultDigest)(
    canonicalLengthDelimited([
      request.operation,
      request.schema.id,
      request.schema.versionedId,
      request.projectId,
      String(request.projectStateVersion),
      request.reviewPolicy,
      request.systemInstruction,
      request.input,
    ]),
  );
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

function validateRequest<T>(
  request: ModelGatewayRequest<T>,
  environment: ModelEnvironment,
): boolean {
  if (!isUuid(request.projectId)) return false;
  if (!Number.isSafeInteger(request.projectStateVersion) || request.projectStateVersion <= 0)
    return false;
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
  execute<T>(request: ModelGatewayRequest<T>): Promise<ValidatedModelResponse<T>>;
}

export function createModelGateway(dependencies: ModelGatewayDependencies): ModelGateway {
  const now = dependencies.now ?? (() => Date.now());
  const timer = dependencies.timer ?? DEFAULT_DEADLINE_TIMER;
  const sleep = dependencies.sleep ?? ((delayMs, signal) => abortableDelay(delayMs, signal, timer));

  const completeWithRetry = async (
    input: GenerationRunCompletionInput,
    correlationId: string,
    identity: {
      readonly correlationId: string;
      readonly projectStateVersion: number;
      readonly operationKind: string;
      readonly inputSchemaVersion: string;
      readonly outputSchemaVersion: string;
    },
  ): Promise<GenerationRunCompletion> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
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
          completed.outputSchemaVersion !== identity.outputSchemaVersion
        ) {
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

  const execute = async <T>(
    request: ModelGatewayRequest<T>,
  ): Promise<ValidatedModelResponse<T>> => {
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

    let claim: GenerationRunClaim;
    try {
      claim = await dependencies.store.claim({
        projectId: request.projectId,
        projectStateVersion: request.projectStateVersion,
        idempotencyKey: request.idempotencyKey,
        requestFingerprint: fingerprint,
        operationKind: request.operation,
        inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
        outputSchemaVersion: request.schema.schemaVersion,
      });
    } catch (error: unknown) {
      throw safeError(error, correlationId, "persistence_failed");
    }

    if (
      claim.status !== "running" ||
      !isUuid(claim.runId) ||
      !isUuid(claim.correlationId) ||
      claim.projectStateVersion !== request.projectStateVersion ||
      claim.operationKind !== request.operation ||
      claim.inputSchemaVersion !== GENERATION_RUN_INPUT_SCHEMA_VERSION ||
      claim.outputSchemaVersion !== request.schema.schemaVersion
    ) {
      // A real store owns correlation identity. The locally-generated value is used only for
      // pre-claim errors; once claimed, metadata follows the durable correlation UUID.
      throw createModelGatewayError("persistence_failed", correlationId);
    }

    const runtime: GatewayRuntime<T> = {
      request,
      correlationId: claim.correlationId,
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
        await completeWithRetry({ ...completion, runId: claim.runId }, runtime.correlationId, {
          correlationId: runtime.correlationId,
          projectStateVersion: request.projectStateVersion,
          operationKind: request.operation,
          inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
          outputSchemaVersion: request.schema.schemaVersion,
        });
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

    const metadata = aggregateExecutionMetadata(runtime, candidate, null);
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
    };
    await completeWithRetry(completionInput, runtime.correlationId, {
      correlationId: runtime.correlationId,
      projectStateVersion: request.projectStateVersion,
      operationKind: request.operation,
      inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: request.schema.schemaVersion,
    });
    return { data: candidate.data, metadata };
  };

  return {
    execute,
  };
}
