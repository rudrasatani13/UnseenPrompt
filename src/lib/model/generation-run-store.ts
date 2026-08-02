import "server-only";

import type {
  ModelErrorCode,
  ModelOperation,
  RecordedModelValidationResult,
} from "@/domain/model/contracts";
import type { ProviderId } from "@/lib/model/provider";

export type GenerationRunStatus = "running" | "succeeded" | "failed" | "canceled";

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
}

/** The only data a claim may return to orchestration. */
export interface GenerationRunClaim {
  readonly runId: string;
  readonly correlationId: string;
  readonly status: "running";
  readonly projectStateVersion: number;
  readonly operationKind: ModelOperation;
  readonly inputSchemaVersion: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION;
  readonly outputSchemaVersion: string;
}

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
}

/** Echoed terminal metadata. Implementations must not add prompt/output/provider-body fields. */
export interface GenerationRunCompletion extends GenerationRunCompletionInput {
  readonly correlationId: string;
  readonly projectStateVersion: number;
  readonly operationKind: ModelOperation;
  readonly inputSchemaVersion: typeof GENERATION_RUN_INPUT_SCHEMA_VERSION;
  readonly outputSchemaVersion: string;
}

/** Technology-neutral persistence port consumed by the gateway. */
export interface GenerationRunStore {
  claim(input: GenerationRunClaimInput): Promise<GenerationRunClaim>;
  complete(input: GenerationRunCompletionInput): Promise<GenerationRunCompletion>;
}
