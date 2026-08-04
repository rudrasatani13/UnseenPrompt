import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getServerSupabaseGenerationEnvironment } from "@/config/supabase/server";
import type {
  ModelExecutionSubject,
  ModelErrorCode,
  ModelOperation,
  RecordedModelValidationResult,
  TypedModelOperation,
} from "@/domain/model/contracts";
import { serializeCanonicalJsonV1 } from "@/domain/project/commands";
import { createModelGatewayError, type ModelGatewayError } from "@/lib/model/errors";
import {
  GENERATION_RUN_INPUT_SCHEMA_VERSION,
  GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
  MAX_VALIDATED_PROJECT_DELTA_BYTES,
  MAX_VALIDATED_OUTPUT_BYTES,
  type GenerationRunClaim,
  type GenerationRunClaimInput,
  type GenerationRunClaimInputV3,
  type GenerationRunClaimV3,
  type GenerationRunCompletion,
  type GenerationRunCompletionInput,
  type GenerationRunCompletionInputV3,
  type GenerationRunCompletionV3,
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
    functionName: "claim_generation_run_v2_server",
    args: ClaimGenerationRunRpcArgs,
  ): PromiseLike<GenerationRunRpcResult>;
  rpc(
    functionName: "complete_generation_run_v2_server",
    args: CompleteGenerationRunRpcArgs,
  ): PromiseLike<GenerationRunRpcResult>;
  rpc(
    functionName: "claim_generation_run_v3_server",
    args: ClaimGenerationRunRpcArgsV3,
  ): PromiseLike<GenerationRunRpcResult>;
  rpc(
    functionName: "complete_generation_run_v3_server",
    args: CompleteGenerationRunRpcArgsV3,
  ): PromiseLike<GenerationRunRpcResult>;
}

export interface ClaimGenerationRunRpcArgs {
  readonly p_owner_id: string;
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
  readonly p_owner_id: string;
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
  readonly p_validated_project_delta_text: string | null;
}

/** Exact Phase 7 subject-aware claim RPC arguments. */
export interface ClaimGenerationRunRpcArgsV3 {
  readonly p_owner_id: string;
  readonly p_subject_kind: ModelExecutionSubject["kind"];
  readonly p_subject_id: string;
  readonly p_subject_state_version: number;
  readonly p_idempotency_key: string;
  readonly p_request_fingerprint: string;
  readonly p_operation_kind: TypedModelOperation;
  readonly p_input_schema_version: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION_V3;
  readonly p_output_schema_version: string;
}

/** Exact Phase 7 subject-aware completion RPC arguments. */
export interface CompleteGenerationRunRpcArgsV3 {
  readonly p_owner_id: string;
  readonly p_run_id: string;
  readonly p_status: Exclude<GenerationRunCompletionInputV3["status"], "running">;
  readonly p_provider: ProviderId | null;
  readonly p_model: string | null;
  readonly p_latency_ms: number | null;
  readonly p_input_tokens: number | null;
  readonly p_output_tokens: number | null;
  readonly p_retry_count: number;
  readonly p_estimated_cost_micros: number | null;
  readonly p_validation_result: RecordedModelValidationResult;
  readonly p_error_code: TerminalGenerationErrorCode | null;
  readonly p_validated_project_delta_text: null;
  readonly p_validated_output_text: string | null;
}

export interface GenerationRunRpcResult {
  readonly data: unknown;
  readonly error: unknown;
}

export interface SupabaseGenerationRunStoreOptions {
  /** A service-role client used only for the server-only V2/V3 RPCs. */
  readonly serverClient?: GenerationRunRpcClient;
  /** Lazy service-role client factory so read-only page requests do not require the secret key. */
  readonly serverClientFactory?: () => GenerationRunRpcClient;
  /** Identity is revalidated from the request-bound authenticated Supabase client. */
  readonly ownerIdProvider?: () => Promise<string>;
}

/** Construct the server-only service-role RPC client lazily at the model boundary. */
export function createSupabaseServerGenerationRunRpcClient(): GenerationRunRpcClient {
  const environment = getServerSupabaseGenerationEnvironment();
  return createClient(environment.supabaseUrl, environment.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
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

const PROVIDERS = ["anthropic", "openai", "gemini", "opencode"] as const;
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
const claimStatusSchema = z.enum(["running", "replayed"] as const);
const claimRowStatusSchema = z.enum(["running", ...TERMINAL_STATUSES] as const);
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
const nullableSha256Schema = z.string().regex(SHA256_PATTERN).nullable();
const validatedProjectDeltaTextSchema = z
  .string()
  .min(1)
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= MAX_VALIDATED_PROJECT_DELTA_BYTES,
  );
const nullableValidatedProjectDeltaTextSchema = validatedProjectDeltaTextSchema.nullable();

const claimRowSchema = z
  .strictObject({
    run_id: uuidSchema,
    correlation_id: uuidSchema,
    claim_status: claimStatusSchema,
    status: claimRowStatusSchema,
    project_state_version: positiveSafeIntegerSchema,
    operation_kind: operationSchema,
    input_schema_version: z.literal(GENERATION_RUN_INPUT_SCHEMA_VERSION),
    output_schema_version: boundedMetadataStringSchema,
    provider: providerSchema.nullable(),
    model: nullableBoundedMetadataStringSchema,
    latency_ms: safeNonNegativeIntegerSchema.nullable(),
    input_tokens: safeNonNegativeIntegerSchema.nullable(),
    output_tokens: safeNonNegativeIntegerSchema.nullable(),
    retry_count: safeNonNegativeIntegerSchema.nullable(),
    estimated_cost_micros: safeNonNegativeIntegerSchema.nullable(),
    validation_result: validationResultSchema,
    error_code: z.enum(TERMINAL_ERROR_CODES).nullable(),
    validated_project_delta_text: nullableValidatedProjectDeltaTextSchema,
    validated_project_delta_hash: nullableSha256Schema,
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
    if (value.claim_status === "running") {
      if (
        value.status !== "running" ||
        value.provider !== null ||
        value.model !== null ||
        value.latency_ms !== null ||
        value.input_tokens !== null ||
        value.output_tokens !== null ||
        value.retry_count !== null ||
        value.estimated_cost_micros !== null ||
        value.validation_result !== "not_attempted" ||
        value.error_code !== null ||
        value.validated_project_delta_text !== null ||
        value.validated_project_delta_hash !== null
      ) {
        context.addIssue({ code: "custom", message: "invalid running claim" });
      }
    } else if (
      value.status !== "succeeded" ||
      value.operation_kind !== "project_delta" ||
      value.output_schema_version !== "unseenprompt.model-output.project_delta.v1" ||
      value.provider === null ||
      value.model === null ||
      value.latency_ms === null ||
      value.retry_count === null ||
      !["passed", "repaired", "reviewed"].includes(value.validation_result) ||
      value.error_code !== null ||
      value.validated_project_delta_text === null ||
      value.validated_project_delta_hash === null
    ) {
      context.addIssue({ code: "custom", message: "invalid replayed claim" });
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
    validated_project_delta_text: nullableValidatedProjectDeltaTextSchema,
    validated_project_delta_hash: nullableSha256Schema,
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
    const hasText = value.validated_project_delta_text !== null;
    const hasHash = value.validated_project_delta_hash !== null;
    if (hasText !== hasHash) {
      context.addIssue({ code: "custom", message: "validated delta pair mismatch" });
    }
    if (hasText) {
      if (
        value.operation_kind !== "project_delta" ||
        value.status !== "succeeded" ||
        !["passed", "repaired", "reviewed"].includes(value.validation_result)
      ) {
        context.addIssue({ code: "custom", message: "validated delta not allowed" });
      }
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
    allowHistoricalReplay: z.boolean().default(false),
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
    validatedProjectDeltaText: nullableValidatedProjectDeltaTextSchema.optional(),
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

const TYPED_MODEL_OPERATIONS = [
  "intent_detection",
  "discovery_sufficiency",
  "clarification_question",
] as const satisfies readonly TypedModelOperation[];

const typedOperationSchema = z.enum(TYPED_MODEL_OPERATIONS);
const subjectKindSchema = z.enum(["project", "composer_draft"] as const);
const subjectSchema = z.strictObject({
  kind: subjectKindSchema,
  id: uuidSchema,
  version: positiveSafeIntegerSchema,
});
const validatedOutputTextSchema = z
  .string()
  .min(1)
  .refine((value) => new TextEncoder().encode(value).byteLength <= MAX_VALIDATED_OUTPUT_BYTES);
const nullableValidatedOutputTextSchema = validatedOutputTextSchema.nullable();

function isCanonicalJsonText(value: string): boolean {
  try {
    return serializeCanonicalJsonV1(JSON.parse(value) as unknown) === value;
  } catch {
    return false;
  }
}

function addTypedSubjectOperationIssue(
  value: {
    readonly subject: { readonly kind: ModelExecutionSubject["kind"] };
    readonly operationKind: TypedModelOperation;
  },
  context: z.RefinementCtx,
): void {
  const expectedSubjectKind =
    value.operationKind === "intent_detection" ? "composer_draft" : "project";
  if (value.subject.kind !== expectedSubjectKind) {
    context.addIssue({ code: "custom", path: ["subject", "kind"], message: "subject mismatch" });
  }
}

function addTypedOutputSchemaIssue(
  value: { readonly operationKind: TypedModelOperation; readonly outputSchemaVersion: string },
  context: z.RefinementCtx,
): void {
  const expected = `unseenprompt.model-output.${value.operationKind}.v1`;
  if (value.outputSchemaVersion !== expected) {
    context.addIssue({
      code: "custom",
      path: ["outputSchemaVersion"],
      message: "schema mismatch",
    });
  }
}

const claimInputV3Schema = z
  .strictObject({
    subject: subjectSchema,
    idempotencyKey: boundedMetadataStringSchema,
    requestFingerprint: z.string().regex(SHA256_PATTERN),
    operationKind: typedOperationSchema,
    inputSchemaVersion: z.literal(GENERATION_RUN_INPUT_SCHEMA_VERSION_V3),
    outputSchemaVersion: boundedMetadataStringSchema,
  })
  .superRefine((value, context) => {
    addTypedSubjectOperationIssue(value, context);
    addTypedOutputSchemaIssue(value, context);
  });

const completionInputV3Schema = z
  .strictObject({
    runId: uuidSchema,
    status: terminalStatusSchema,
    subject: subjectSchema,
    provider: providerSchema.nullable(),
    model: nullableBoundedMetadataStringSchema,
    latencyMs: safeNonNegativeIntegerSchema.nullable(),
    inputTokens: safeNonNegativeIntegerSchema.nullable(),
    outputTokens: safeNonNegativeIntegerSchema.nullable(),
    retryCount: safeNonNegativeIntegerSchema,
    estimatedCostMicros: safeNonNegativeIntegerSchema.nullable(),
    validationResult: validationResultSchema,
    errorCode: z.enum(TERMINAL_ERROR_CODES).nullable(),
    validatedOutputText: nullableValidatedOutputTextSchema.optional(),
  })
  .superRefine((value, context) => {
    const validatedOutputText = value.validatedOutputText ?? null;
    if (value.status === "succeeded") {
      if (
        value.provider === null ||
        value.model === null ||
        value.latencyMs === null ||
        !["passed", "repaired", "reviewed"].includes(value.validationResult) ||
        value.errorCode !== null ||
        validatedOutputText === null ||
        !isCanonicalJsonText(validatedOutputText)
      ) {
        context.addIssue({ code: "custom", message: "invalid succeeded completion" });
      }
    } else if (
      value.errorCode === null ||
      !["not_attempted", "failed"].includes(value.validationResult) ||
      validatedOutputText !== null
    ) {
      context.addIssue({ code: "custom", message: "invalid terminal completion" });
    }
  });

const claimRowV3Schema = z
  .strictObject({
    run_id: uuidSchema,
    correlation_id: uuidSchema,
    claim_status: z.enum(["running", "replayed"] as const),
    status: z.enum(["running", ...TERMINAL_STATUSES] as const),
    subject_kind: subjectKindSchema,
    subject_id: uuidSchema,
    subject_version: positiveSafeIntegerSchema,
    project_state_version: positiveSafeIntegerSchema,
    operation_kind: typedOperationSchema,
    input_schema_version: z.literal(GENERATION_RUN_INPUT_SCHEMA_VERSION_V3),
    output_schema_version: boundedMetadataStringSchema,
    provider: providerSchema.nullable(),
    model: nullableBoundedMetadataStringSchema,
    latency_ms: safeNonNegativeIntegerSchema.nullable(),
    input_tokens: safeNonNegativeIntegerSchema.nullable(),
    output_tokens: safeNonNegativeIntegerSchema.nullable(),
    retry_count: safeNonNegativeIntegerSchema.nullable(),
    estimated_cost_micros: safeNonNegativeIntegerSchema.nullable(),
    validation_result: validationResultSchema,
    error_code: z.enum(TERMINAL_ERROR_CODES).nullable(),
    validated_project_delta_text: nullableValidatedProjectDeltaTextSchema,
    validated_project_delta_hash: nullableSha256Schema,
    validated_output_text: nullableValidatedOutputTextSchema,
    validated_output_hash: nullableSha256Schema,
  })
  .superRefine((value, context) => {
    addTypedOutputSchemaIssue(
      { operationKind: value.operation_kind, outputSchemaVersion: value.output_schema_version },
      context,
    );
    const expectedSubjectKind =
      value.operation_kind === "intent_detection" ? "composer_draft" : "project";
    if (value.subject_kind !== expectedSubjectKind) {
      context.addIssue({ code: "custom", path: ["subject_kind"], message: "subject mismatch" });
    }
    if (value.subject_version !== value.project_state_version) {
      context.addIssue({ code: "custom", message: "subject version mismatch" });
    }
    const hasProjectDeltaText = value.validated_project_delta_text !== null;
    const hasProjectDeltaHash = value.validated_project_delta_hash !== null;
    if (hasProjectDeltaText || hasProjectDeltaHash) {
      context.addIssue({ code: "custom", message: "project delta not allowed" });
    }
    const hasOutputText = value.validated_output_text !== null;
    const hasOutputHash = value.validated_output_hash !== null;
    if (hasOutputText !== hasOutputHash) {
      context.addIssue({ code: "custom", message: "validated output pair mismatch" });
    }
    if (value.claim_status === "running") {
      if (
        value.status !== "running" ||
        value.provider !== null ||
        value.model !== null ||
        value.latency_ms !== null ||
        value.input_tokens !== null ||
        value.output_tokens !== null ||
        value.retry_count !== null ||
        value.estimated_cost_micros !== null ||
        value.validation_result !== "not_attempted" ||
        value.error_code !== null ||
        hasOutputText ||
        hasOutputHash
      ) {
        context.addIssue({ code: "custom", message: "invalid running claim" });
      }
    } else if (
      value.status !== "succeeded" ||
      value.provider === null ||
      value.model === null ||
      value.latency_ms === null ||
      value.retry_count === null ||
      !["passed", "repaired", "reviewed"].includes(value.validation_result) ||
      value.error_code !== null ||
      !hasOutputText ||
      !hasOutputHash
    ) {
      context.addIssue({ code: "custom", message: "invalid replayed claim" });
    }
  });

const completionRowV3Schema = z
  .strictObject({
    run_id: uuidSchema,
    correlation_id: uuidSchema,
    status: terminalStatusSchema,
    subject_kind: subjectKindSchema,
    subject_id: uuidSchema,
    subject_version: positiveSafeIntegerSchema,
    project_state_version: positiveSafeIntegerSchema,
    operation_kind: typedOperationSchema,
    input_schema_version: z.literal(GENERATION_RUN_INPUT_SCHEMA_VERSION_V3),
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
    validated_project_delta_text: nullableValidatedProjectDeltaTextSchema,
    validated_project_delta_hash: nullableSha256Schema,
    validated_output_text: nullableValidatedOutputTextSchema,
    validated_output_hash: nullableSha256Schema,
  })
  .superRefine((value, context) => {
    addTypedOutputSchemaIssue(
      { operationKind: value.operation_kind, outputSchemaVersion: value.output_schema_version },
      context,
    );
    const expectedSubjectKind =
      value.operation_kind === "intent_detection" ? "composer_draft" : "project";
    if (value.subject_kind !== expectedSubjectKind) {
      context.addIssue({ code: "custom", path: ["subject_kind"], message: "subject mismatch" });
    }
    if (value.subject_version !== value.project_state_version) {
      context.addIssue({ code: "custom", message: "subject version mismatch" });
    }
    const hasProjectDeltaText = value.validated_project_delta_text !== null;
    const hasProjectDeltaHash = value.validated_project_delta_hash !== null;
    if (hasProjectDeltaText || hasProjectDeltaHash) {
      context.addIssue({ code: "custom", message: "project delta not allowed" });
    }
    const hasOutputText = value.validated_output_text !== null;
    const hasOutputHash = value.validated_output_hash !== null;
    if (hasOutputText !== hasOutputHash) {
      context.addIssue({ code: "custom", message: "validated output pair mismatch" });
    }
    if (value.status === "succeeded") {
      if (
        value.provider === null ||
        value.model === null ||
        value.latency_ms === null ||
        !["passed", "repaired", "reviewed"].includes(value.validation_result) ||
        value.error_code !== null ||
        !hasOutputText ||
        !hasOutputHash
      ) {
        context.addIssue({ code: "custom", message: "invalid succeeded completion" });
      }
    } else if (
      value.error_code === null ||
      !["not_attempted", "failed"].includes(value.validation_result) ||
      hasOutputText ||
      hasOutputHash
    ) {
      context.addIssue({ code: "custom", message: "invalid terminal completion" });
    }
  });

type ClaimRowV3 = z.infer<typeof claimRowV3Schema>;
type CompletionRowV3 = z.infer<typeof completionRowV3Schema>;

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

const CLAIM_ERROR_MAP_V3 = new Map<string, ModelErrorCode>([
  ...CLAIM_ERROR_MAP.entries(),
  ["draft_not_found", "permission_denied"],
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

function modelErrorFromClaimFailureV3(value: unknown): ModelGatewayError {
  const message = exactErrorField(value, "message");
  const code = exactErrorField(value, "code");
  const mapped =
    (message === null ? undefined : CLAIM_ERROR_MAP_V3.get(message)) ??
    (code === null ? undefined : CLAIM_ERROR_MAP_V3.get(code));
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
  const versionMatches = row.project_state_version === input.projectStateVersion;
  const historicalReplayAllowed =
    input.allowHistoricalReplay === true && row.claim_status === "replayed";
  if (
    (!versionMatches && !historicalReplayAllowed) ||
    row.operation_kind !== input.operationKind ||
    row.input_schema_version !== GENERATION_RUN_INPUT_SCHEMA_VERSION ||
    row.output_schema_version !== input.outputSchemaVersion ||
    row.output_schema_version !== `unseenprompt.model-output.${row.operation_kind}.v1`
  ) {
    throw persistenceFailure();
  }
  if (row.claim_status === "running") {
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
  if (
    row.operation_kind !== "project_delta" ||
    row.output_schema_version !== "unseenprompt.model-output.project_delta.v1" ||
    row.provider === null ||
    row.model === null ||
    row.latency_ms === null ||
    row.retry_count === null ||
    row.validated_project_delta_text === null ||
    row.validated_project_delta_hash === null ||
    row.error_code !== null ||
    !["passed", "repaired", "reviewed"].includes(row.validation_result)
  ) {
    throw persistenceFailure();
  }
  const validationResult = row.validation_result as Exclude<
    RecordedModelValidationResult,
    "not_attempted" | "failed"
  >;
  return {
    runId: row.run_id,
    correlationId: row.correlation_id,
    status: "replayed",
    projectStateVersion: row.project_state_version,
    operationKind: "project_delta",
    inputSchemaVersion: row.input_schema_version,
    outputSchemaVersion: "unseenprompt.model-output.project_delta.v1",
    provider: row.provider,
    model: row.model,
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    retryCount: row.retry_count,
    estimatedCostMicros: row.estimated_cost_micros,
    validationResult,
    errorCode: null,
    validatedProjectDeltaText: row.validated_project_delta_text,
    validatedProjectDeltaHash: row.validated_project_delta_hash,
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
    row.error_code !== input.errorCode ||
    row.validated_project_delta_text !== (input.validatedProjectDeltaText ?? null)
  ) {
    throw persistenceFailure();
  }
  if ((row.validated_project_delta_text === null) !== (row.validated_project_delta_hash === null)) {
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
    validatedProjectDeltaText: row.validated_project_delta_text,
    validatedProjectDeltaHash: row.validated_project_delta_hash,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyCanonicalOutputPair(text: string, hash: string): Promise<boolean> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
    if (serializeCanonicalJsonV1(parsed) !== text) return false;
    return (await sha256Hex(text)) === hash;
  } catch {
    return false;
  }
}

function subjectMatches(
  row: {
    readonly subject_kind: ModelExecutionSubject["kind"];
    readonly subject_id: string;
    readonly subject_version: number;
  },
  subject: ModelExecutionSubject,
): boolean {
  return (
    row.subject_kind === subject.kind &&
    row.subject_id === subject.id &&
    row.subject_version === subject.version
  );
}

function typedOutputSchemaVersion(
  operationKind: TypedModelOperation,
): `unseenprompt.model-output.${TypedModelOperation}.v1` {
  return `unseenprompt.model-output.${operationKind}.v1`;
}

async function mapClaimRowV3(
  row: ClaimRowV3,
  input: GenerationRunClaimInputV3,
): Promise<GenerationRunClaimV3> {
  if (
    !subjectMatches(row, input.subject) ||
    row.project_state_version !== input.subject.version ||
    row.operation_kind !== input.operationKind ||
    row.input_schema_version !== GENERATION_RUN_INPUT_SCHEMA_VERSION_V3 ||
    row.output_schema_version !== input.outputSchemaVersion
  ) {
    throw persistenceFailure();
  }

  if (row.claim_status === "running") {
    return {
      runId: row.run_id,
      correlationId: row.correlation_id,
      status: "running",
      subject: input.subject,
      operationKind: row.operation_kind,
      inputSchemaVersion: row.input_schema_version,
      outputSchemaVersion: row.output_schema_version,
    };
  }

  if (
    row.status !== "succeeded" ||
    row.provider === null ||
    row.model === null ||
    row.latency_ms === null ||
    row.retry_count === null ||
    row.error_code !== null ||
    !["passed", "repaired", "reviewed"].includes(row.validation_result) ||
    row.validated_output_text === null ||
    row.validated_output_hash === null
  ) {
    throw persistenceFailure();
  }

  if (!(await verifyCanonicalOutputPair(row.validated_output_text, row.validated_output_hash))) {
    throw persistenceFailure();
  }

  const validationResult = row.validation_result as Exclude<
    RecordedModelValidationResult,
    "not_attempted" | "failed"
  >;
  return {
    runId: row.run_id,
    correlationId: row.correlation_id,
    status: "replayed",
    subject: input.subject,
    operationKind: row.operation_kind,
    inputSchemaVersion: row.input_schema_version,
    outputSchemaVersion: typedOutputSchemaVersion(row.operation_kind),
    provider: row.provider,
    model: row.model,
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    retryCount: row.retry_count,
    estimatedCostMicros: row.estimated_cost_micros,
    validationResult,
    errorCode: null,
    validatedOutputText: row.validated_output_text,
    validatedOutputHash: row.validated_output_hash,
  };
}

async function mapCompletionRowV3(
  row: CompletionRowV3,
  input: GenerationRunCompletionInputV3,
): Promise<GenerationRunCompletionV3> {
  const validatedOutputText = input.validatedOutputText ?? null;
  if (
    row.run_id !== input.runId ||
    !subjectMatches(row, input.subject) ||
    row.project_state_version !== input.subject.version ||
    row.status !== input.status ||
    row.provider !== input.provider ||
    row.model !== input.model ||
    row.latency_ms !== input.latencyMs ||
    row.input_tokens !== input.inputTokens ||
    row.output_tokens !== input.outputTokens ||
    row.retry_count !== input.retryCount ||
    row.estimated_cost_micros !== input.estimatedCostMicros ||
    row.validation_result !== input.validationResult ||
    row.error_code !== input.errorCode ||
    row.validated_output_text !== validatedOutputText ||
    row.validated_project_delta_text !== null ||
    row.validated_project_delta_hash !== null
  ) {
    throw persistenceFailure();
  }

  if (validatedOutputText !== null) {
    if (row.validated_output_hash === null) throw persistenceFailure();
    if (!(await verifyCanonicalOutputPair(validatedOutputText, row.validated_output_hash))) {
      throw persistenceFailure();
    }
  } else if (row.validated_output_hash !== null) {
    throw persistenceFailure();
  }

  return {
    ...input,
    correlationId: row.correlation_id,
    subject: input.subject,
    operationKind: row.operation_kind,
    inputSchemaVersion: row.input_schema_version,
    outputSchemaVersion: row.output_schema_version,
    validatedOutputText: row.validated_output_text,
    validatedOutputHash: row.validated_output_hash,
  };
}

function claimRpcArgs(input: GenerationRunClaimInput, ownerId: string): ClaimGenerationRunRpcArgs {
  return {
    p_owner_id: ownerId,
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
  ownerId: string,
): CompleteGenerationRunRpcArgs {
  return {
    p_owner_id: ownerId,
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
    p_validated_project_delta_text: input.validatedProjectDeltaText ?? null,
  };
}

function claimRpcArgsV3(
  input: z.infer<typeof claimInputV3Schema>,
  ownerId: string,
): ClaimGenerationRunRpcArgsV3 {
  return {
    p_owner_id: ownerId,
    p_subject_kind: input.subject.kind,
    p_subject_id: input.subject.id,
    p_subject_state_version: input.subject.version,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: input.requestFingerprint,
    p_operation_kind: input.operationKind,
    p_input_schema_version: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
    p_output_schema_version: input.outputSchemaVersion,
  };
}

function completionRpcArgsV3(
  input: z.infer<typeof completionInputV3Schema>,
  ownerId: string,
): CompleteGenerationRunRpcArgsV3 {
  return {
    p_owner_id: ownerId,
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
    p_validated_project_delta_text: null,
    p_validated_output_text: input.validatedOutputText ?? null,
  };
}

/** Create the owner-scoped Phase 5 generation persistence adapter. */
export function createSupabaseGenerationRunStore(
  client: GenerationRunRpcClient,
  options: SupabaseGenerationRunStoreOptions = {},
): GenerationRunStore {
  let lazyServerClient: GenerationRunRpcClient | undefined;
  const serverClient = (): GenerationRunRpcClient => {
    if (options.serverClient !== undefined) return options.serverClient;
    if (lazyServerClient === undefined && options.serverClientFactory !== undefined) {
      lazyServerClient = options.serverClientFactory();
    }
    if (lazyServerClient === undefined) throw persistenceFailure();
    return lazyServerClient;
  };
  const ownerId = async (): Promise<string> => {
    if (options.ownerIdProvider === undefined) throw persistenceFailure();
    const value = await options.ownerIdProvider();
    if (!uuidSchema.safeParse(value).success) throw persistenceFailure();
    return value;
  };

  return {
    async claim(input): Promise<GenerationRunClaim> {
      const parsedInput = claimInputSchema.safeParse(input);
      if (!parsedInput.success) throw persistenceFailure();

      let response: unknown;
      try {
        response = await serverClient().rpc(
          "claim_generation_run_v2_server",
          claimRpcArgs(parsedInput.data, await ownerId()),
        );
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
        response = await serverClient().rpc(
          "complete_generation_run_v2_server",
          completionRpcArgs(parsedInput.data, await ownerId()),
        );
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
      return mapCompletionRow(row, {
        ...parsedInput.data,
        validatedProjectDeltaText: parsedInput.data.validatedProjectDeltaText ?? null,
      });
    },

    async claimV3(input): Promise<GenerationRunClaimV3> {
      const parsedInput = claimInputV3Schema.safeParse(input);
      if (!parsedInput.success) throw persistenceFailure();

      let response: unknown;
      try {
        response = await serverClient().rpc(
          "claim_generation_run_v3_server",
          claimRpcArgsV3(parsedInput.data, await ownerId()),
        );
      } catch {
        throw persistenceFailure();
      }

      let result: GenerationRunRpcResult;
      try {
        result = parseRpcResult(response);
      } catch {
        throw persistenceFailure();
      }
      if (result.error !== null) throw modelErrorFromClaimFailureV3(result.error);
      const row = parseSingleRow(claimRowV3Schema, result.data);
      try {
        return await mapClaimRowV3(row, parsedInput.data);
      } catch {
        throw persistenceFailure();
      }
    },

    async completeV3(input): Promise<GenerationRunCompletionV3> {
      const parsedInput = completionInputV3Schema.safeParse(input);
      if (!parsedInput.success) throw persistenceFailure();

      let response: unknown;
      try {
        response = await serverClient().rpc(
          "complete_generation_run_v3_server",
          completionRpcArgsV3(parsedInput.data, await ownerId()),
        );
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
      const row = parseSingleRow(completionRowV3Schema, result.data);
      try {
        return await mapCompletionRowV3(row, {
          ...parsedInput.data,
          validatedOutputText: parsedInput.data.validatedOutputText ?? null,
        });
      } catch {
        throw persistenceFailure();
      }
    },
  };
}
