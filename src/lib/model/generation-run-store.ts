import "server-only";

import type {
  ModelErrorCode,
  ModelOperation,
  RecordedModelValidationResult,
} from "@/domain/model/contracts";
import type { ProviderId } from "@/lib/model/provider";

export type GenerationRunStatus = "running" | "succeeded" | "failed" | "canceled";

/** The Phase 6 database bound for a replayable, validated project delta. */
export const MAX_VALIDATED_PROJECT_DELTA_BYTES = 64 * 1024;

/** Stable input contract version persisted on every claimed generation run. */
export const GENERATION_RUN_INPUT_SCHEMA_VERSION = "unseenprompt.model-gateway-request.v1";

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

/** Technology-neutral persistence port consumed by the gateway. */
export interface GenerationRunStore {
  claim(input: GenerationRunClaimInput): Promise<GenerationRunClaim>;
  complete(input: GenerationRunCompletionInput): Promise<GenerationRunCompletion>;
}
