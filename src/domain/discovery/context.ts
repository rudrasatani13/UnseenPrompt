import type { ProjectMode } from "./contracts";
import {
  DISCOVERY_CONTEXT_SCHEMA,
  DISCOVERY_SCHEMA_VERSION,
  DiscoveryDomainError,
} from "./contracts";

export { DISCOVERY_CONTEXT_SCHEMA, DISCOVERY_SCHEMA_VERSION } from "./contracts";

export const DEFAULT_DISCOVERY_CONTEXT_MAX_UTF8_BYTES = 65_536 as const;
export const DEFAULT_DISCOVERY_CONTEXT_MAX_ESTIMATED_TOKENS = 16_384 as const;
export const DISCOVERY_CONTEXT_TOKEN_ESTIMATOR = "utf8_bytes_divided_by_4_ceiling_v1" as const;
export const DISCOVERY_CONTEXT_MAX_CONFIRMED_TURNS = 12 as const;

export const DISCOVERY_UNTRUSTED_USER_DATA_LABEL = "untrusted_user_data" as const;
export const DISCOVERY_VALIDATED_MODEL_DATA_LABEL = "validated_model_output" as const;
export const DISCOVERY_SYSTEM_DATA_LABEL = "code_owned_policy" as const;

export type DiscoveryPreferenceField = "language" | "skillLevel" | "explanationDepth";
export type DiscoveryPreferenceSource = "global" | "project" | "system";

export interface DiscoveryPreferenceRecordV1 {
  readonly field: DiscoveryPreferenceField;
  readonly value: string;
  readonly source: DiscoveryPreferenceSource;
}

export interface DiscoveryConfirmedTurnV1 {
  readonly questionId: string;
  readonly position: number;
  readonly targetFactKey: string;
  readonly questionText: string;
  readonly rationale: string;
  readonly questionFingerprint: string;
  readonly answerId: string;
  readonly answerText: string;
  readonly answerSource: "suggested" | "free_text";
  readonly answeredAt: string;
}

export interface DiscoveryActiveQuestionContextV1 {
  readonly questionId: string;
  readonly position: number;
  readonly targetFactKey: string;
  readonly questionText: string;
  readonly rationale: string;
  readonly questionFingerprint: string;
  readonly suggestedAnswers: readonly { readonly label: string; readonly value: string }[];
  readonly allowsFreeText: boolean;
}

export interface DiscoveryAssessmentSelectorV1 {
  readonly assessmentId: string;
  readonly basisStateVersion: number;
  readonly isSufficient: boolean;
  readonly confidence: number;
  readonly missingFactKeys: readonly string[];
  readonly rationale: string;
  readonly createdAt: string;
}

/** Canonical input assembled by an owner-scoped discovery repository. */
export interface DiscoveryContextInputV1 {
  readonly projectId: string;
  readonly mode: ProjectMode;
  readonly stage: "discovery";
  readonly stateVersion: number;
  readonly policyVersion: number;
  readonly initialRequestText: string;
  readonly confirmedTurns: readonly DiscoveryConfirmedTurnV1[];
  readonly activeQuestion: DiscoveryActiveQuestionContextV1 | null;
  readonly requiredFactKeys: readonly string[];
  readonly confirmedQuestionFingerprints: readonly string[];
  readonly preferences?: readonly DiscoveryPreferenceRecordV1[] | null | undefined;
  readonly priorAssessments?: readonly DiscoveryAssessmentSelectorV1[] | undefined;
}

export interface DiscoveryContextBudgetV1 {
  readonly maxUtf8Bytes: number;
  readonly maxEstimatedTokens: number;
}

export interface DiscoveryContextBudgetInputV1 {
  readonly maxUtf8Bytes?: number | undefined;
  readonly maxEstimatedTokens?: number | undefined;
}

export type DiscoveryContextOmissionReason =
  "budget_exceeded" | "duplicate" | "not_current" | "future_state_version";

export interface DiscoveryContextOmissionV1 {
  readonly section: "preference" | "assessment" | "rationale" | "active_question";
  readonly selector: string;
  readonly reason: DiscoveryContextOmissionReason;
  readonly id?: string;
  readonly field?: DiscoveryPreferenceField;
}

export interface DiscoveryContextDocumentV1 {
  readonly schema: typeof DISCOVERY_CONTEXT_SCHEMA;
  readonly schemaVersion: typeof DISCOVERY_SCHEMA_VERSION;
  readonly trustBoundary: typeof DISCOVERY_UNTRUSTED_USER_DATA_LABEL;
  readonly dataHandling: string;
  readonly project: {
    readonly mode: ProjectMode;
    readonly stage: "discovery";
    readonly stateVersion: number;
    readonly policyVersion: number;
  };
  readonly preferences: readonly {
    readonly trust: typeof DISCOVERY_UNTRUSTED_USER_DATA_LABEL | typeof DISCOVERY_SYSTEM_DATA_LABEL;
    readonly field: DiscoveryPreferenceField;
    readonly source: DiscoveryPreferenceSource;
    readonly value: string;
  }[];
  readonly initialRequest: {
    readonly trust: typeof DISCOVERY_UNTRUSTED_USER_DATA_LABEL;
    readonly utf8Bytes: number;
    readonly text: string;
  };
  readonly confirmedTurns: readonly {
    readonly questionId: string;
    readonly position: number;
    readonly targetFactKey: string;
    readonly question: {
      readonly trust: typeof DISCOVERY_VALIDATED_MODEL_DATA_LABEL;
      readonly utf8Bytes: number;
      readonly text: string;
    };
    readonly answer: {
      readonly trust: typeof DISCOVERY_UNTRUSTED_USER_DATA_LABEL;
      readonly utf8Bytes: number;
      readonly source: "suggested" | "free_text";
      readonly text: string;
    };
    readonly answerId: string;
    readonly questionFingerprint: string;
    readonly answeredAt: string;
  }[];
  readonly answeredFactKeys: readonly string[];
  readonly activeTargetFactKey: string | null;
  readonly requiredFactKeys: readonly string[];
  readonly excludedQuestionFingerprints: readonly string[];
  readonly questionRationales: readonly {
    readonly questionId: string;
    readonly trust: typeof DISCOVERY_VALIDATED_MODEL_DATA_LABEL;
    readonly utf8Bytes: number;
    readonly text: string;
  }[];
  readonly activeQuestion: DiscoveryActiveQuestionContextV1 | null;
  readonly priorAssessments: readonly {
    readonly assessmentId: string;
    readonly basisStateVersion: number;
    readonly isSufficient: boolean;
    readonly confidence: number;
    readonly missingFactKeys: readonly string[];
    readonly createdAt: string;
  }[];
}

export interface DiscoveryCompiledContextV1 {
  readonly schema: typeof DISCOVERY_CONTEXT_SCHEMA;
  readonly schemaVersion: typeof DISCOVERY_SCHEMA_VERSION;
  readonly context: string;
  readonly utf8Bytes: number;
  readonly estimatedTokens: number;
  readonly estimator: typeof DISCOVERY_CONTEXT_TOKEN_ESTIMATOR;
  readonly projectStateVersion: number;
  readonly included: {
    readonly confirmedTurnIds: readonly string[];
    readonly preferenceFields: readonly DiscoveryPreferenceField[];
    readonly assessmentIds: readonly string[];
    readonly activeQuestion: boolean;
  };
  readonly omittedOptional: readonly DiscoveryContextOmissionV1[];
  readonly limits: DiscoveryContextBudgetV1;
}

export interface DiscoveryContextBudgetFailureDetailsV1 extends DiscoveryContextBudgetV1 {
  readonly requiredUtf8Bytes: number;
  readonly requiredEstimatedTokens: number;
}

/** Numeric-only budget details prevent content leakage through errors and diagnostics. */
export class DiscoveryContextCompilationError extends DiscoveryDomainError {
  readonly details: DiscoveryContextBudgetFailureDetailsV1 | null;

  constructor(
    code: "context_budget_invalid" | "confirmed_discovery_context_exceeds_budget",
    details: DiscoveryContextBudgetFailureDetailsV1 | null = null,
  ) {
    super(code);
    this.name = "DiscoveryContextCompilationError";
    this.details = details;
  }
}

export function discoveryContextUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function discoveryContextEstimatedTokens(value: string): number {
  return Math.ceil(discoveryContextUtf8ByteLength(value) / 4);
}

export function normalizeDiscoveryTextV1(value: string): string {
  return value.replace(/\r\n?/g, "\n").normalize("NFC");
}

export function canonicalDiscoverySortKeyV1(value: string): string {
  return normalizeDiscoveryTextV1(value).toLowerCase();
}

export function canonicalDiscoveryUuidKeyV1(value: string): string {
  return value.toLowerCase();
}

export function canonicalDiscoveryFingerprintKeyV1(value: string): string {
  return value.toLowerCase();
}
