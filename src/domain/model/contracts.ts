import type { ZodType } from "zod";

import type { ProviderJsonSchema } from "@/domain/model/json-schema";

/** The operation names are the stable keys for the versioned model-output registry. */
export type ModelOperation =
  | "intent_detection"
  | "discovery_sufficiency"
  | "clarification_question"
  | "project_delta"
  | "stack_recommendation"
  | "action_specification"
  | "evidence_analysis"
  | "completion_suggestion"
  | "risk_flags";

export type ReviewPolicy = "none" | "best_effort" | "required";

/** A runtime-validated, provider-neutral model output schema. */
export interface ModelOutputSchema<T, O extends ModelOperation = ModelOperation> {
  /** Unversioned namespace, for example `unseenprompt.model-output.intent_detection`. */
  readonly id: string;
  readonly operation: O;
  readonly version: number;
  /** Stable persistence form: `${id}.v${version}`. */
  readonly versionedId: string;
  /** Alias used when a schema version is persisted as a single value. */
  readonly schemaVersion: string;
  readonly schema: ZodType<T>;
  readonly jsonSchema: ProviderJsonSchema;
}

export interface ModelGatewayRequest<T, O extends ModelOperation = ModelOperation> {
  readonly projectId: string;
  readonly projectStateVersion: number;
  readonly idempotencyKey: string;
  readonly operation: O;
  readonly schema: ModelOutputSchema<T, O>;
  readonly systemInstruction: string;
  readonly input: string;
  readonly reviewPolicy: ReviewPolicy;
  readonly signal?: AbortSignal;
  readonly deadlineMs?: number;
}

export interface ValidatedModelResponse<T> {
  readonly data: T;
  readonly metadata: ModelExecutionMetadata;
}

export interface ModelUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}

/** Validation states available once a model candidate has been evaluated. */
export type ModelValidationResult = "passed" | "repaired" | "reviewed" | "failed";

/** The durable row also has a pre-call state. It is not a successful response state. */
export type RecordedModelValidationResult = "not_attempted" | ModelValidationResult;

export type ModelCallKind = "primary" | "transport_retry" | "repair" | "fallback" | "reviewer";

export type ModelErrorCode =
  | "aborted"
  | "deadline_exceeded"
  | "attempt_timeout"
  | "authentication_failed"
  | "permission_denied"
  | "billing_or_quota_exhausted"
  | "rate_limited"
  | "provider_unavailable"
  | "invalid_provider_request"
  | "model_not_found"
  | "content_refused"
  | "output_truncated"
  | "invalid_output"
  | "configuration_error"
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "idempotency_replay_unavailable"
  | "persistence_failed"
  | "provider_error";

/** Safe details carried by a gateway error. Provider bodies and model content are excluded. */
export interface ModelGatewayErrorDetails {
  readonly code: ModelErrorCode;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly httpStatus?: number;
}

/** Structural error contract consumed by infrastructure without exposing provider payloads. */
export type ModelGatewayError = ModelGatewayErrorDetails;
export type ModelGatewayErrorCode = ModelErrorCode;

/** A bounded, allowlisted record for one provider call. */
export interface ModelCallMetadata {
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

/** Aggregate metadata returned only with a validated and durably completed response. */
export interface ModelExecutionMetadata {
  readonly correlationId: string;
  readonly provider: string;
  readonly model: string;
  readonly resolvedModel: string | null;
  readonly latencyMs: number;
  readonly usage: ModelUsage;
  readonly estimatedCostMicros: number | null;
  readonly retryCount: number;
  readonly validationResult: ModelValidationResult;
  readonly calls: readonly ModelCallMetadata[];
  readonly errorCode: ModelErrorCode | null;
}

/** A request-to-schema map used to keep registry lookups type-safe. */
export interface ModelOutputByOperation {
  readonly intent_detection: IntentDetectionV1;
  readonly discovery_sufficiency: DiscoverySufficiencyV1;
  readonly clarification_question: ClarificationQuestionV1;
  readonly project_delta: ProjectDeltaV1;
  readonly stack_recommendation: StackRecommendationV1;
  readonly action_specification: ActionSpecificationV1;
  readonly evidence_analysis: EvidenceAnalysisV1;
  readonly completion_suggestion: CompletionSuggestionV1;
  readonly risk_flags: RiskFlagsV1;
}

/** Intent classification returned by `intent_detection.v1`. */
export interface IntentDetectionV1 {
  readonly mode: "new_build" | "feature" | "bug" | "review" | "test" | "deploy" | "improve";
  readonly confidence: number;
  readonly rationale: string;
  readonly detectedLanguage: string;
}

export interface DiscoverySufficiencyV1 {
  readonly isSufficient: boolean;
  readonly confidence: number;
  readonly missingFacts: readonly string[];
  readonly rationale: string;
}

export interface ClarificationAnswerV1 {
  readonly label: string;
  readonly value: string;
}

export interface ClarificationQuestionV1 {
  readonly question: string;
  readonly rationale: string;
  readonly suggestedAnswers: readonly ClarificationAnswerV1[];
  readonly allowsFreeText: boolean;
}

export type ProposalAction = "add" | "revise" | "remove";

export interface RequirementProposalV1 {
  readonly action: ProposalAction;
  readonly reference: string;
  readonly statement: string;
  readonly rationale: string;
}

export interface DecisionProposalV1 {
  readonly action: ProposalAction;
  readonly reference: string;
  readonly statement: string;
  readonly rationale: string;
}

export interface MilestoneProposalV1 {
  readonly action: ProposalAction;
  readonly reference: string;
  readonly title: string;
  readonly rationale: string;
}

export interface ProjectDeltaV1 {
  readonly summary: string;
  readonly requirementProposals: readonly RequirementProposalV1[];
  readonly decisionProposals: readonly DecisionProposalV1[];
  readonly milestoneProposals: readonly MilestoneProposalV1[];
  readonly unresolvedConflicts: readonly string[];
}

export interface StackRecommendationV1Details {
  readonly frontend: string;
  readonly backend: string;
  readonly database: string;
  readonly hosting: string;
}

export interface StackAlternativeV1 {
  readonly name: string;
  readonly whenToChoose: string;
  readonly tradeoffs: string;
}

export interface StackRecommendationV1 {
  readonly recommendation: StackRecommendationV1Details;
  readonly rationale: readonly string[];
  readonly alternatives: readonly StackAlternativeV1[];
  readonly risks: readonly string[];
}

export interface ActionSpecificationV1 {
  readonly purpose: string;
  readonly context: string;
  readonly task: string;
  readonly expectedResult: string;
  readonly boundaries: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly verification: readonly string[];
  readonly riskFlags: readonly string[];
}

export type EvidenceTestStatus = "passed" | "failed" | "not_run" | "unclear";

export interface EvidenceTestResultV1 {
  readonly name: string;
  readonly status: EvidenceTestStatus;
  readonly evidence: string;
}

export interface EvidenceAnalysisV1 {
  readonly claimedChanges: readonly string[];
  readonly evidenceSupplied: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly errors: readonly string[];
  readonly blockers: readonly string[];
  readonly testResults: readonly EvidenceTestResultV1[];
  readonly summary: string;
}

export interface CompletionSuggestionV1 {
  readonly suggestedStatus: "completed" | "needs_verification" | "blocked" | "in_progress";
  readonly confidence: number;
  readonly rationale: string;
  readonly requiredVerification: readonly string[];
}

export type RiskCategoryV1 =
  | "security"
  | "privacy"
  | "data_integrity"
  | "destructive_action"
  | "cost"
  | "reliability"
  | "scope";
export type RiskSeverityV1 = "low" | "medium" | "high" | "critical";

export interface RiskFlagV1 {
  readonly id: string;
  readonly category: RiskCategoryV1;
  readonly severity: RiskSeverityV1;
  readonly description: string;
  readonly mitigation: string;
}

export interface RiskFlagsV1 {
  readonly risks: readonly RiskFlagV1[];
}
