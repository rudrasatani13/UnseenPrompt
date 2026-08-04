import "server-only";

import type {
  ComposerDraftCommandEnvelopeV1,
  ComposerDraftCreateInputV1,
  ComposerDraftV1,
  DiscoveryCommandEnvelopeV1,
  DiscoverySnapshotV1,
} from "@/domain/discovery/contracts";
import type { DiscoveryDomainError } from "@/domain/discovery/contracts";
import type { ProjectMode } from "@/domain/project/contracts";

/**
 * Input for the internal intent-application boundary. `apply_intent` is intentionally absent from
 * the browser command union; only the server-side generation service can use this port.
 */
export interface ApplyComposerIntentInputV1 {
  readonly draftId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly generationRunId: string;
}

export interface ApplyDiscoveryAssessmentInputV1 {
  readonly projectId: string;
  readonly generationRunId: string;
  readonly expectedStateVersion: number;
  readonly idempotencyKey: string;
}

export interface ApplyDiscoveryQuestionInputV1 {
  readonly projectId: string;
  readonly generationRunId: string;
  readonly targetFactKey: string;
  readonly expectedStateVersion: number;
  readonly idempotencyKey: string;
}

export interface CompleteDiscoveryInputV1 {
  readonly projectId: string;
  readonly generationRunId: string;
  readonly expectedStateVersion: number;
  readonly idempotencyKey: string;
}

export interface ComposerDraftRoutingReceiptV1 {
  readonly draftId: string;
  readonly version: number;
  readonly status: "routing";
  readonly replayed: boolean;
}

export interface ComposerDraftRetryReceiptV1 {
  readonly draftId: string;
  readonly version: number;
  readonly status: "retry_required";
  /** Internal-only source text needed to start a new intent attempt. */
  readonly initialRequestText: string;
  readonly lastErrorCode: string;
  readonly replayed: boolean;
}

export interface ComposerDraftAwaitingConfirmationReceiptV1 {
  readonly draftId: string;
  readonly version: number;
  readonly status: "awaiting_confirmation";
  readonly intent: {
    readonly mode: ProjectMode;
    readonly confidence: number;
    readonly rationale: string;
    readonly detectedLanguage: string;
  };
  readonly replayed: boolean;
}

export type ComposerDraftCreateReceiptV1 =
  | ComposerDraftRoutingReceiptV1
  | ComposerDraftRetryReceiptV1
  | ComposerDraftAwaitingConfirmationReceiptV1;

export interface ComposerDraftCommandReceiptV1 {
  readonly draftId: string;
  readonly version: number;
  readonly status: ComposerDraftV1["status"];
  readonly projectId: string | null;
  readonly replayed: boolean;
  readonly sessionId?: string;
  readonly stateVersion?: number;
  readonly eventId?: string;
  /** Present only on retry_intent receipts so the server can rerun intent detection. */
  readonly initialRequestText?: string | undefined;
}

export interface DiscoveryAssessmentReceiptV1 {
  readonly assessmentId: string;
  readonly status: "active" | "sufficient" | "blocked";
  readonly stateVersion: number;
  readonly replayed: boolean;
  readonly policyPassed?: boolean;
  readonly eventId?: string;
}

export interface DiscoveryQuestionReceiptV1 {
  readonly questionId: string;
  readonly stateVersion: number;
  readonly replayed: boolean;
  readonly eventId?: string;
}

export interface DiscoveryCommandReceiptV1 {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly eventId: string | null;
  readonly replayed: boolean;
  readonly answerId?: string | undefined;
}

export interface DiscoveryCompletionReceiptV1 {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly eventId: string;
  readonly replayed: boolean;
}

/**
 * Owner-scoped discovery persistence. Implementations derive owner and actor identity from the
 * authenticated Supabase client; callers never pass either identity or a provider result.
 */
export interface DiscoveryRepository {
  createComposerDraft(input: ComposerDraftCreateInputV1): Promise<ComposerDraftCreateReceiptV1>;
  executeComposerDraftCommand(
    envelope: ComposerDraftCommandEnvelopeV1,
  ): Promise<ComposerDraftCommandReceiptV1>;
  applyIntent(input: ApplyComposerIntentInputV1): Promise<ComposerDraftCommandReceiptV1>;
  getSnapshot(projectId: string): Promise<DiscoverySnapshotV1>;
  applyAssessment(input: ApplyDiscoveryAssessmentInputV1): Promise<DiscoveryAssessmentReceiptV1>;
  applyQuestion(input: ApplyDiscoveryQuestionInputV1): Promise<DiscoveryQuestionReceiptV1>;
  executeDiscoveryCommand(envelope: DiscoveryCommandEnvelopeV1): Promise<DiscoveryCommandReceiptV1>;
  completeDiscovery(input: CompleteDiscoveryInputV1): Promise<DiscoveryCompletionReceiptV1>;
}

export type DiscoveryRepositoryError = DiscoveryDomainError;
