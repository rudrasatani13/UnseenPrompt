import type { ProjectMode } from "@/domain/project/contracts";

/** Stable namespaces used by the Phase 7 domain contracts. */
export const DISCOVERY_SCHEMA = "unseenprompt.discovery" as const;
export const DISCOVERY_COMMAND_SCHEMA = "unseenprompt.discovery-command" as const;
export const COMPOSER_DRAFT_COMMAND_SCHEMA = "unseenprompt.composer-draft-command" as const;
export const COMPOSER_DRAFT_INPUT_SCHEMA = "unseenprompt.composer-draft-input" as const;
export const DISCOVERY_CONTEXT_SCHEMA = "unseenprompt.discovery-context" as const;
export const DISCOVERY_SCHEMA_VERSION = 1 as const;
export const DISCOVERY_POLICY_VERSION = 1 as const;

/** Project modes are re-exported here so discovery adapters do not need a second mode enum. */
export { PROJECT_MODES, projectModeSchema } from "@/domain/project/contracts";
export type { ProjectMode } from "@/domain/project/contracts";

export const COMPOSER_DRAFT_STATUSES = [
  "routing",
  "awaiting_confirmation",
  "retry_required",
  "promoted",
  "abandoned",
] as const;
export type ComposerDraftStatus = (typeof COMPOSER_DRAFT_STATUSES)[number];

export const DISCOVERY_SESSION_STATUSES = [
  "active",
  "sufficient",
  "completed",
  "abandoned",
  "blocked",
] as const;
export type DiscoverySessionStatus = (typeof DISCOVERY_SESSION_STATUSES)[number];

export const DISCOVERY_QUESTION_STATUSES = ["active", "answered", "superseded"] as const;
export type DiscoveryQuestionStatus = (typeof DISCOVERY_QUESTION_STATUSES)[number];

export const DISCOVERY_ANSWER_STATUSES = ["confirmed", "superseded"] as const;
export type DiscoveryAnswerStatus = (typeof DISCOVERY_ANSWER_STATUSES)[number];

export const DISCOVERY_ANSWER_SOURCES = ["suggested", "free_text"] as const;
export type DiscoveryAnswerSource = (typeof DISCOVERY_ANSWER_SOURCES)[number];

export const DISCOVERY_ERROR_CODES = [
  "auth_required",
  "validation_failed",
  "draft_not_found",
  "project_not_found",
  "discovery_not_found",
  "stale_draft_version",
  "stale_state_version",
  "idempotency_conflict",
  "idempotency_in_progress",
  "invalid_draft_state",
  "invalid_discovery_state",
  "active_question_exists",
  "question_not_found",
  "question_not_active",
  "answer_not_allowed",
  "duplicate_question",
  "invalid_missing_fact",
  "sufficiency_policy_failed",
  "discovery_turn_limit_reached",
  "proposal_incomplete",
  "provider_unavailable",
  "persistence_failed",
  "confirmed_discovery_context_exceeds_budget",
  "context_budget_invalid",
] as const;
export type DiscoveryErrorCode = (typeof DISCOVERY_ERROR_CODES)[number];

/** Safe domain errors contain only a stable code; they never echo user or provider content. */
export class DiscoveryDomainError extends Error {
  readonly code: DiscoveryErrorCode;

  constructor(code: DiscoveryErrorCode) {
    super(code);
    this.name = "DiscoveryDomainError";
    this.code = code;
  }
}

export interface ComposerDraftV1 {
  readonly id: string;
  readonly ownerId: string;
  readonly version: number;
  readonly initialRequestText: string;
  readonly status: ComposerDraftStatus;
  readonly detectedMode: ProjectMode | null;
  readonly confidence: number | null;
  readonly rationale: string | null;
  readonly detectedLanguage: string | null;
  readonly intentGenerationRunId: string | null;
  readonly confirmedMode: ProjectMode | null;
  readonly confirmedTitle: string | null;
  readonly projectId: string | null;
  readonly lastErrorCode: DiscoveryErrorCode | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly promotedAt: string | null;
  readonly abandonedAt: string | null;
}

export interface DiscoverySessionV1 {
  readonly id: string;
  readonly projectId: string;
  readonly sourceDraftId: string;
  readonly status: DiscoverySessionStatus;
  readonly policyVersion: number;
  readonly activeQuestionId: string | null;
  readonly latestAssessmentId: string | null;
  /** The promoted initial request counts as the first confirmed input. */
  readonly confirmedTurnCount: number;
  readonly blockCode: "discovery_turn_limit_reached" | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly abandonedAt: string | null;
}

export interface DiscoveryAssessmentV1 {
  readonly id: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly generationRunId: string;
  readonly basisStateVersion: number;
  readonly isSufficient: boolean;
  readonly confidence: number;
  readonly missingFactKeys: readonly string[];
  readonly rationale: string;
  readonly policyPassed: boolean;
  readonly policyFailureCode: DiscoveryErrorCode | null;
  readonly createdAt: string;
}

export interface DiscoverySuggestedAnswerV1 {
  readonly label: string;
  readonly value: string;
}

export interface DiscoveryQuestionV1 {
  readonly id: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly generationRunId: string;
  readonly position: number;
  readonly targetFactKey: string;
  readonly basisStateVersion: number;
  readonly questionText: string;
  readonly rationale: string;
  readonly suggestedAnswers: readonly DiscoverySuggestedAnswerV1[];
  readonly allowsFreeText: boolean;
  /** SHA-256 over the normalized question text. */
  readonly questionFingerprint: string;
  readonly status: DiscoveryQuestionStatus;
  readonly createdAt: string;
  readonly answeredAt: string | null;
  readonly supersededAt: string | null;
}

export interface DiscoveryAnswerV1 {
  readonly id: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly questionId: string;
  readonly source: DiscoveryAnswerSource;
  readonly answerText: string;
  readonly status: DiscoveryAnswerStatus;
  readonly supersedesAnswerId: string | null;
  readonly confirmationEventId: string;
  readonly createdAt: string;
  readonly supersededAt: string | null;
}

export interface DiscoverySnapshotV1 {
  readonly projectId: string;
  readonly mode: ProjectMode;
  readonly stage: "discovery";
  readonly stateVersion: number;
  readonly session: DiscoverySessionV1;
  readonly initialRequestText: string;
  readonly confirmedQuestions: readonly DiscoveryQuestionV1[];
  readonly confirmedAnswers: readonly DiscoveryAnswerV1[];
  readonly assessments: readonly DiscoveryAssessmentV1[];
  readonly activeQuestion: DiscoveryQuestionV1 | null;
}

export interface ComposerDraftCreateInputV1 {
  readonly schema: typeof COMPOSER_DRAFT_INPUT_SCHEMA;
  readonly schemaVersion: typeof DISCOVERY_SCHEMA_VERSION;
  readonly initialRequestText: string;
  readonly idempotencyKey: string;
}

export interface RetryIntentCommandV1 {
  readonly type: "retry_intent";
}

export interface ConfirmAndPromoteCommandV1 {
  readonly type: "confirm_and_promote";
  readonly confirmedMode: ProjectMode;
  readonly confirmedTitle: string;
}

export interface AbandonDraftCommandV1 {
  readonly type: "abandon_draft";
}

export type ComposerDraftCommandV1 =
  RetryIntentCommandV1 | ConfirmAndPromoteCommandV1 | AbandonDraftCommandV1;

export interface ComposerDraftCommandEnvelopeV1 {
  readonly schema: typeof COMPOSER_DRAFT_COMMAND_SCHEMA;
  readonly schemaVersion: typeof DISCOVERY_SCHEMA_VERSION;
  readonly draftId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly command: ComposerDraftCommandV1;
}

export interface AdvanceDiscoveryCommandV1 {
  readonly type: "advance_discovery";
}

export interface ConfirmAnswerCommandV1 {
  readonly type: "confirm_answer";
  readonly questionId: string;
  readonly source: DiscoveryAnswerSource;
  readonly answerText: string;
}

export interface ReviseAnswerCommandV1 {
  readonly type: "revise_answer";
  readonly questionId: string;
  readonly predecessorAnswerId: string;
  readonly source: DiscoveryAnswerSource;
  readonly answerText: string;
}

export interface AbandonDiscoveryCommandV1 {
  readonly type: "abandon_discovery";
}

export interface ResumeDiscoveryCommandV1 {
  readonly type: "resume_discovery";
}

export type DiscoveryCommandV1 =
  | AdvanceDiscoveryCommandV1
  | ConfirmAnswerCommandV1
  | ReviseAnswerCommandV1
  | AbandonDiscoveryCommandV1
  | ResumeDiscoveryCommandV1;

export interface DiscoveryCommandEnvelopeV1 {
  readonly schema: typeof DISCOVERY_COMMAND_SCHEMA;
  readonly schemaVersion: typeof DISCOVERY_SCHEMA_VERSION;
  readonly projectId: string;
  readonly expectedStateVersion: number;
  readonly idempotencyKey: string;
  readonly command: DiscoveryCommandV1;
}

export interface DiscoveryAnswerLineageV1 {
  readonly predecessor: DiscoveryAnswerV1;
  readonly successor: DiscoveryAnswerV1;
}

export interface DiscoveryTransitionResultV1<T extends string = string> {
  readonly ok: true;
  readonly from: T;
  readonly to: T;
}

export interface DiscoveryTransitionFailureV1 {
  readonly ok: false;
  readonly code: "invalid_draft_state" | "invalid_discovery_state";
}
