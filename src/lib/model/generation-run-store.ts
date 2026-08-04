import "server-only";

import type {
  ModelExecutionSubject,
  ModelErrorCode,
  ModelOperation,
  RecordedModelValidationResult,
  TypedModelOperation,
} from "@/domain/model/contracts";
import type { ProviderId } from "@/lib/model/provider";

export type GenerationRunStatus = "running" | "succeeded" | "failed" | "canceled";

/** The Phase 6 database bound for a replayable, validated project delta. */
export const MAX_VALIDATED_PROJECT_DELTA_BYTES = 64 * 1024;

/** All Phase 7 validated outputs use the same bounded persistence ceiling. */
export const MAX_VALIDATED_OUTPUT_BYTES = MAX_VALIDATED_PROJECT_DELTA_BYTES;

/** Stable input contract version persisted on every claimed generation run. */
export const GENERATION_RUN_INPUT_SCHEMA_VERSION = "unseenprompt.model-gateway-request.v1";

/** Input contract used by the subject-aware v3 generation-run RPCs. */
export const GENERATION_RUN_INPUT_SCHEMA_VERSION_V3 = "unseenprompt.model-gateway-request.v3";

/** Version marker included in the subject-aware request fingerprint basis. */
export const MODEL_REQUEST_FINGERPRINT_VERSION = "unseenprompt.model-request-fingerprint.v2";

/** Bounded metadata sent to the persistence boundary before any provider call. */
export interface GenerationRunClaimInput {
  readonly projectId: string;
  readonly projectStateVersion: number;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly operationKind: ModelOperation;
  readonly inputSchemaVersion: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION;
  readonly outputSchemaVersion: string;
  /** Internal gateway hint; never persisted or forwarded as an RPC parameter. */
  readonly allowHistoricalReplay?: boolean;
}

/** Subject-aware claim input. This is intentionally a separate port from the Phase 5 v2 RPC. */
export interface GenerationRunClaimInputV3 {
  readonly subject: ModelExecutionSubject;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly operationKind: TypedModelOperation;
  readonly inputSchemaVersion: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION_V3;
  readonly outputSchemaVersion: string;
}

/** A newly claimed run. No provider or model output fields are exposed before execution. */
export interface RunningGenerationRunClaim {
  readonly runId: string;
  readonly correlationId: string;
  readonly status: "running";
  readonly projectStateVersion: number;
  readonly operationKind: ModelOperation;
  readonly inputSchemaVersion: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION;
  readonly outputSchemaVersion: string;
}

/**
 * A durable successful project-delta result. The exact text/hash pair is intentionally returned
 * instead of an arbitrary JSON payload; the gateway verifies both before parsing the proposal.
 */
export interface ReplayedProjectDeltaGenerationRunClaim {
  readonly runId: string;
  readonly correlationId: string;
  readonly status: "replayed";
  readonly projectStateVersion: number;
  readonly operationKind: "project_delta";
  readonly inputSchemaVersion: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION;
  readonly outputSchemaVersion: "unseenprompt.model-output.project_delta.v1";
  readonly provider: ProviderId;
  readonly model: string;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly retryCount: number;
  readonly estimatedCostMicros: number | null;
  readonly validationResult: Exclude<RecordedModelValidationResult, "not_attempted" | "failed">;
  readonly errorCode: null;
  readonly validatedProjectDeltaText: string;
  readonly validatedProjectDeltaHash: string;
}

/** Strict discriminated union returned by the v2 claim RPC. */
export type GenerationRunClaim = RunningGenerationRunClaim | ReplayedProjectDeltaGenerationRunClaim;

/** A newly claimed subject-aware run. */
export interface RunningGenerationRunClaimV3 {
  readonly runId: string;
  readonly correlationId: string;
  readonly status: "running";
  readonly subject: ModelExecutionSubject;
  readonly operationKind: TypedModelOperation;
  readonly inputSchemaVersion: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION_V3;
  readonly outputSchemaVersion: string;
}

/**
 * A durable successful typed output. The gateway treats the exact subject/text/hash triple as an
 * untrusted replay boundary and validates all three before returning model-shaped data.
 */
export interface ReplayedValidatedModelOutputGenerationRunClaim<
  O extends TypedModelOperation = TypedModelOperation,
> {
  readonly runId: string;
  readonly correlationId: string;
  readonly status: "replayed";
  readonly subject: ModelExecutionSubject;
  readonly operationKind: O;
  readonly inputSchemaVersion: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION_V3;
  readonly outputSchemaVersion: `unseenprompt.model-output.${O}.v1`;
  readonly provider: ProviderId;
  readonly model: string;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly retryCount: number;
  readonly estimatedCostMicros: number | null;
  readonly validationResult: Exclude<RecordedModelValidationResult, "not_attempted" | "failed">;
  readonly errorCode: null;
  readonly validatedOutputText: string;
  readonly validatedOutputHash: string;
}

export type GenerationRunClaimV3 =
  RunningGenerationRunClaimV3 | ReplayedValidatedModelOutputGenerationRunClaim;

/** Bounded aggregate metadata sent on terminal completion. */
export interface GenerationRunCompletionInput {
  readonly runId: string;
  readonly status: Exclude<GenerationRunStatus, "running">;
  readonly provider: ProviderId | null;
  readonly model: string | null;
  readonly latencyMs: number | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly retryCount: number;
  readonly estimatedCostMicros: number | null;
  readonly validationResult: RecordedModelValidationResult;
  readonly errorCode: ModelErrorCode | null;
  /** Canonical validated project_delta.v1 text, or null for every other terminal path. */
  readonly validatedProjectDeltaText?: string | null;
}

/** Subject-aware terminal completion input for the v3 store port. */
export interface GenerationRunCompletionInputV3 {
  readonly runId: string;
  readonly status: Exclude<GenerationRunStatus, "running">;
  readonly subject: ModelExecutionSubject;
  readonly provider: ProviderId | null;
  readonly model: string | null;
  readonly latencyMs: number | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly retryCount: number;
  readonly estimatedCostMicros: number | null;
  readonly validationResult: RecordedModelValidationResult;
  readonly errorCode: ModelErrorCode | null;
  /** Canonical validated output for the replayable Phase 7 operations, or null otherwise. */
  readonly validatedOutputText?: string | null;
}

/** Echoed terminal metadata. Implementations must not add prompt/output/provider-body fields. */
export interface GenerationRunCompletion extends GenerationRunCompletionInput {
  readonly correlationId: string;
  readonly projectStateVersion: number;
  readonly operationKind: ModelOperation;
  readonly inputSchemaVersion: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION;
  readonly outputSchemaVersion: string;
  readonly validatedProjectDeltaText: string | null;
  readonly validatedProjectDeltaHash: string | null;
}

/** Echoed subject-aware terminal metadata returned by the v3 store port. */
export interface GenerationRunCompletionV3 extends GenerationRunCompletionInputV3 {
  readonly correlationId: string;
  readonly subject: ModelExecutionSubject;
  readonly operationKind: TypedModelOperation;
  readonly inputSchemaVersion: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION_V3;
  readonly outputSchemaVersion: string;
  readonly validatedOutputText: string | null;
  readonly validatedOutputHash: string | null;
}

/** Technology-neutral persistence port consumed by the gateway. */
export interface GenerationRunStore {
  claim(input: GenerationRunClaimInput): Promise<GenerationRunClaim>;
  complete(input: GenerationRunCompletionInput): Promise<GenerationRunCompletion>;

  /** Optional until the Phase 7 Supabase adapter/RPC worker lands. */
  readonly claimV3?: (input: GenerationRunClaimInputV3) => Promise<GenerationRunClaimV3>;
  /** Optional until the Phase 7 Supabase adapter/RPC worker lands. */
  readonly completeV3?: (
    input: GenerationRunCompletionInputV3,
  ) => Promise<GenerationRunCompletionV3>;
}
