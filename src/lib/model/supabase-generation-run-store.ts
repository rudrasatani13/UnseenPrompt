import "server-only";

import { z } from "zod";

import type {
  ModelErrorCode,
  ModelOperation,
  RecordedModelValidationResult,
} from "@/domain/model/contracts";
import { createModelGatewayError, type ModelGatewayError } from "@/lib/model/errors";
import {
  GENERATION_RUN_INPUT_SCHEMA_VERSION,
  type GenerationRunClaim,
  type GenerationRunClaimInput,
  type GenerationRunCompletion,
  type GenerationRunCompletionInput,
  type GenerationRunStore,
} from "@/lib/model/generation-run-store";
import type { ProviderId } from "@/lib/model/provider";

/**
 * The checked-in generated Supabase Database type predates the Phase 5 RPC migration. This local
 * port is deliberately exact so a regenerated authenticated Supabase client can satisfy it once
 * CI runs database type generation; it is not widened to arbitrary RPC names or JSON arguments.
 */
export interface GenerationRunRpcClient {
  rpc(
    functionName: "claim_generation_run",
    args: ClaimGenerationRunRpcArgs,
  ): PromiseLike<GenerationRunRpcResult>;
  rpc(
    functionName: "complete_generation_run",
    args: CompleteGenerationRunRpcArgs,
  ): PromiseLike<GenerationRunRpcResult>;
}

export interface ClaimGenerationRunRpcArgs {
  readonly p_project_id: string;
  readonly p_project_state_version: number;
  readonly p_idempotency_key: string;
  readonly p_request_fingerprint: string;
  readonly p_operation_kind: ModelOperation;
  readonly p_input_schema_version: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION;
  readonly p_output_schema_version: string;
}

export type TerminalGenerationErrorCode = Exclude<
  ModelErrorCode,
  "idempotency_conflict" | "idempotency_in_progress" | "idempotency_replay_unavailable"
>;

export interface CompleteGenerationRunRpcArgs {
  readonly p_run_id: string;
  readonly p_status: Exclude<GenerationRunCompletionInput["status"], "running">;
  readonly p_provider: ProviderId | null;
  readonly p_model: string | null;
  readonly p_latency_ms: number | null;
  readonly p_input_tokens: number | null;
  readonly p_output_tokens: number | null;
  readonly p_retry_count: number;
  readonly p_estimated_cost_micros: number | null;
  readonly p_validation_result: RecordedModelValidationResult;
  readonly p_error_code: TerminalGenerationErrorCode | null;
}

export interface GenerationRunRpcResult {
  readonly data: unknown;
  readonly error: unknown;
}

const DEFAULT_CORRELATION_ID = "00000000-0000-4000-8000-000000000000";
const MAX_METADATA_BYTES = 255;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const MODEL_OPERATIONS = [
  "intent_detection",
  "discovery_sufficiency",
  "clarification_question",
  "project_delta",
  "stack_recommendation",
  "action_specification",
  "evidence_analysis",
  "completion_suggestion",
  "risk_flags",
] as const satisfies readonly ModelOperation[];

const PROVIDERS = ["anthropic", "openai", "gemini"] as const;
const VALIDATION_RESULTS = ["not_attempted", "passed", "repaired", "reviewed", "failed"] as const;
const TERMINAL_STATUSES = ["succeeded", "failed", "canceled"] as const;
const TERMINAL_ERROR_CODES = [
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
  "persistence_failed",
  "provider_error",
] as const satisfies readonly TerminalGenerationErrorCode[];

const CLAIM_REPLAY_ERROR_CODES = [
  ...TERMINAL_ERROR_CODES,
  "idempotency_conflict",
  "idempotency_in_progress",
  "idempotency_replay_unavailable",
] as const satisfies readonly ModelErrorCode[];

const operationSchema = z.enum(MODEL_OPERATIONS);
const providerSchema = z.enum(PROVIDERS);
const validationResultSchema = z.enum(VALIDATION_RESULTS);
const terminalStatusSchema = z.enum(TERMINAL_STATUSES);
const uuidSchema = z.string().uuid();
const safeNonNegativeIntegerSchema = z.number().int().safe().nonnegative();
const positiveSafeIntegerSchema = safeNonNegativeIntegerSchema.positive();
const boundedMetadataStringSchema = z
  .string()
  .min(1)
  .max(MAX_METADATA_BYTES)
  .refine((value) => value.trim() === value)
  .refine((value) => new TextEncoder().encode(value).byteLength <= MAX_METADATA_BYTES);
const nullableBoundedMetadataStringSchema = boundedMetadataStringSchema.nullable();

const claimRowSchema = z
  .strictObject({
    run_id: uuidSchema,
    correlation_id: uuidSchema,
    status: z.literal("running"),
    project_state_version: positiveSafeIntegerSchema,
    operation_kind: operationSchema,
    input_schema_version: z.literal(GENERATION_RUN_INPUT_SCHEMA_VERSION),
    output_schema_version: boundedMetadataStringSchema,
  })
  .superRefine((value, context) => {
    const expected = `unseenprompt.model-output.${value.operation_kind}.v1`;
    if (value.output_schema_version !== expected) {
      context.addIssue({
        code: "custom",
        path: ["output_schema_version"],
        message: "schema mismatch",
      });
    }
  });

const completionRowSchema = z
  .strictObject({
    run_id: uuidSchema,
    correlation_id: uuidSchema,
    status: terminalStatusSchema,
    project_state_version: positiveSafeIntegerSchema,
    operation_kind: operationSchema,
    input_schema_version: z.literal(GENERATION_RUN_INPUT_SCHEMA_VERSION),
    output_schema_version: boundedMetadataStringSchema,
    provider: providerSchema.nullable(),
    model: nullableBoundedMetadataStringSchema,
    latency_ms: safeNonNegativeIntegerSchema.nullable(),
    input_tokens: safeNonNegativeIntegerSchema.nullable(),
    output_tokens: safeNonNegativeIntegerSchema.nullable(),
    retry_count: safeNonNegativeIntegerSchema,
    estimated_cost_micros: safeNonNegativeIntegerSchema.nullable(),
    validation_result: validationResultSchema,
    error_code: z.enum(TERMINAL_ERROR_CODES).nullable(),
  })
  .superRefine((value, context) => {
    const expected = `unseenprompt.model-output.${value.operation_kind}.v1`;
    if (value.output_schema_version !== expected) {
      context.addIssue({
        code: "custom",
        path: ["output_schema_version"],
        message: "schema mismatch",
      });
    }
  });

const claimInputSchema = z
  .strictObject({
    projectId: uuidSchema,
    projectStateVersion: positiveSafeIntegerSchema,
    idempotencyKey: z
      .string()
      .min(1)
      .max(MAX_METADATA_BYTES)
      .refine((value) => value.trim() === value)
      .refine((value) => new TextEncoder().encode(value).byteLength <= MAX_METADATA_BYTES),
    requestFingerprint: z.string().regex(SHA256_PATTERN),
    operationKind: operationSchema,
    inputSchemaVersion: z.literal(GENERATION_RUN_INPUT_SCHEMA_VERSION),
    outputSchemaVersion: boundedMetadataStringSchema,
  })
  .superRefine((value, context) => {
    const expected = `unseenprompt.model-output.${value.operationKind}.v1`;
    if (value.outputSchemaVersion !== expected) {
      context.addIssue({
        code: "custom",
        path: ["outputSchemaVersion"],
        message: "schema mismatch",
      });
    }
  });

const completionInputSchema = z
  .strictObject({
    runId: uuidSchema,
    status: terminalStatusSchema,
    provider: providerSchema.nullable(),
    model: nullableBoundedMetadataStringSchema,
    latencyMs: safeNonNegativeIntegerSchema.nullable(),
    inputTokens: safeNonNegativeIntegerSchema.nullable(),
    outputTokens: safeNonNegativeIntegerSchema.nullable(),
    retryCount: safeNonNegativeIntegerSchema,
    estimatedCostMicros: safeNonNegativeIntegerSchema.nullable(),
    validationResult: validationResultSchema,
    errorCode: z.enum(TERMINAL_ERROR_CODES).nullable(),
  })
  .superRefine((value, context) => {
    if (value.status === "succeeded") {
      if (
        value.provider === null ||
        value.model === null ||
        value.latencyMs === null ||
        !["passed", "repaired", "reviewed"].includes(value.validationResult) ||
        value.errorCode !== null
      ) {
        context.addIssue({ code: "custom", message: "invalid succeeded completion" });
      }
    } else if (
      value.errorCode === null ||
      !["not_attempted", "failed"].includes(value.validationResult)
    ) {
      context.addIssue({ code: "custom", message: "invalid terminal completion" });
    }
  });

type ClaimRow = z.infer<typeof claimRowSchema>;
type CompletionRow = z.infer<typeof completionRowSchema>;
// Supabase's Postgrest response includes data/error plus transport metadata such as count,
// status, and statusText. Strip all envelope fields other than the two consumed by this adapter;
// returned rows remain strict below.
const rpcResultSchema = z.object({ data: z.unknown(), error: z.unknown() }).strip();

const CLAIM_ERROR_MAP = new Map<string, ModelErrorCode>([
  ["authentication_required", "authentication_failed"],
  ["project_not_found_or_not_owned", "permission_denied"],
  ["idempotency_conflict", "idempotency_conflict"],
  ["idempotency_in_progress", "idempotency_in_progress"],
  ["idempotency_replay_unavailable", "idempotency_replay_unavailable"],
  ...CLAIM_REPLAY_ERROR_CODES.map((code) => [code, code] as const),
]);

function persistenceFailure(): ModelGatewayError {
  return createModelGatewayError("persistence_failed", DEFAULT_CORRELATION_ID);
}

function modelErrorFromClaimFailure(value: unknown): ModelGatewayError {
  const message = exactErrorField(value, "message");
  const code = exactErrorField(value, "code");
  const mapped =
    (message === null ? undefined : CLAIM_ERROR_MAP.get(message)) ??
    (code === null ? undefined : CLAIM_ERROR_MAP.get(code));
  return createModelGatewayError(mapped ?? "persistence_failed", DEFAULT_CORRELATION_ID);
}

function exactErrorField(value: unknown, field: "code" | "message"): string | null {
  if (typeof value === "string") return field === "message" ? value : null;
  if (typeof value !== "object" || value === null) return null;
  if (value instanceof Error) return null;
  const candidate = value as { readonly code?: unknown; readonly message?: unknown };
  const fieldValue = candidate[field];
  return typeof fieldValue === "string" ? fieldValue : null;
}

function parseRpcResult(value: unknown): GenerationRunRpcResult {
  const parsed = rpcResultSchema.safeParse(value);
  if (!parsed.success) throw persistenceFailure();
  return parsed.data;
}

function parseSingleRow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = z.array(schema).length(1).safeParse(value);
  if (!result.success) throw persistenceFailure();
  return result.data[0] as z.infer<T>;
}

function mapClaimRow(row: ClaimRow, input: GenerationRunClaimInput): GenerationRunClaim {
  if (
    row.project_state_version !== input.projectStateVersion ||
    row.operation_kind !== input.operationKind ||
    row.input_schema_version !== GENERATION_RUN_INPUT_SCHEMA_VERSION ||
    row.output_schema_version !== input.outputSchemaVersion ||
    row.output_schema_version !== `unseenprompt.model-output.${row.operation_kind}.v1`
  ) {
    throw persistenceFailure();
  }
  return {
    runId: row.run_id,
    correlationId: row.correlation_id,
    status: "running",
    projectStateVersion: row.project_state_version,
    operationKind: row.operation_kind,
    inputSchemaVersion: row.input_schema_version,
    outputSchemaVersion: row.output_schema_version,
  };
}

function mapCompletionRow(
  row: CompletionRow,
  input: GenerationRunCompletionInput,
): GenerationRunCompletion {
  if (
    row.run_id !== input.runId ||
    row.status !== input.status ||
    row.provider !== input.provider ||
    row.model !== input.model ||
    row.latency_ms !== input.latencyMs ||
    row.input_tokens !== input.inputTokens ||
    row.output_tokens !== input.outputTokens ||
    row.retry_count !== input.retryCount ||
    row.estimated_cost_micros !== input.estimatedCostMicros ||
    row.validation_result !== input.validationResult ||
    row.error_code !== input.errorCode
  ) {
    throw persistenceFailure();
  }
  return {
    runId: row.run_id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    retryCount: row.retry_count,
    estimatedCostMicros: row.estimated_cost_micros,
    validationResult: row.validation_result,
    errorCode: row.error_code,
    correlationId: row.correlation_id,
    projectStateVersion: row.project_state_version,
    operationKind: row.operation_kind,
    inputSchemaVersion: row.input_schema_version,
    outputSchemaVersion: row.output_schema_version,
  };
}

function claimRpcArgs(input: GenerationRunClaimInput): ClaimGenerationRunRpcArgs {
  return {
    p_project_id: input.projectId,
    p_project_state_version: input.projectStateVersion,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: input.requestFingerprint,
    p_operation_kind: input.operationKind,
    p_input_schema_version: GENERATION_RUN_INPUT_SCHEMA_VERSION,
    p_output_schema_version: input.outputSchemaVersion,
  };
}

function completionRpcArgs(
  input: z.infer<typeof completionInputSchema>,
): CompleteGenerationRunRpcArgs {
  return {
    p_run_id: input.runId,
    p_status: input.status,
    p_provider: input.provider,
    p_model: input.model,
    p_latency_ms: input.latencyMs,
    p_input_tokens: input.inputTokens,
    p_output_tokens: input.outputTokens,
    p_retry_count: input.retryCount,
    p_estimated_cost_micros: input.estimatedCostMicros,
    p_validation_result: input.validationResult,
    p_error_code: input.errorCode,
  };
}

/** Create the owner-scoped Phase 5 generation persistence adapter. */
export function createSupabaseGenerationRunStore(
  client: GenerationRunRpcClient,
): GenerationRunStore {
  return {
    async claim(input): Promise<GenerationRunClaim> {
      const parsedInput = claimInputSchema.safeParse(input);
      if (!parsedInput.success) throw persistenceFailure();

      let response: unknown;
      try {
        response = await client.rpc("claim_generation_run", claimRpcArgs(parsedInput.data));
      } catch {
        throw persistenceFailure();
      }

      let result: GenerationRunRpcResult;
      try {
        result = parseRpcResult(response);
      } catch {
        throw persistenceFailure();
      }
      if (result.error !== null) throw modelErrorFromClaimFailure(result.error);
      const row = parseSingleRow(claimRowSchema, result.data);
      return mapClaimRow(row, parsedInput.data);
    },

    async complete(input): Promise<GenerationRunCompletion> {
      const parsedInput = completionInputSchema.safeParse(input);
      if (!parsedInput.success) throw persistenceFailure();

      let response: unknown;
      try {
        response = await client.rpc("complete_generation_run", completionRpcArgs(parsedInput.data));
      } catch {
        throw persistenceFailure();
      }

      let result: GenerationRunRpcResult;
      try {
        result = parseRpcResult(response);
      } catch {
        throw persistenceFailure();
      }
      if (result.error !== null) throw persistenceFailure();
      const row = parseSingleRow(completionRowSchema, result.data);
      return mapCompletionRow(row, parsedInput.data);
    },
  };
}
