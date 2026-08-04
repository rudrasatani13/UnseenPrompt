import { z } from "zod";

import type { EffectivePreferences } from "@/domain/account/effective-preferences";

/** The namespace and version are deliberately stable RPC/domain contracts. */
export const PROJECT_COMMAND_SCHEMA = "unseenprompt.project-command" as const;
export const PROJECT_CONTEXT_SCHEMA = "unseenprompt.project-context" as const;
export const PROJECT_SCHEMA_VERSION = 1 as const;

export const PROJECT_MODES = [
  "new_build",
  "feature",
  "bug",
  "review",
  "test",
  "deploy",
  "improve",
] as const;
export type ProjectMode = (typeof PROJECT_MODES)[number];
export const projectModeSchema = z.enum(PROJECT_MODES);

export const PROJECT_STAGES = [
  "discovery",
  "brief_confirmation",
  "ready_for_prompt",
  "prompt_active",
  "awaiting_return",
  "result_review",
  "blocked",
  "iteration",
  "completed",
  "archived",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];
export const projectStageSchema = z.enum(PROJECT_STAGES);

export const NORMAL_PROJECT_STAGES = [
  "discovery",
  "brief_confirmation",
  "ready_for_prompt",
  "prompt_active",
  "awaiting_return",
  "result_review",
  "iteration",
  "completed",
] as const;
export type NormalProjectStage = (typeof NORMAL_PROJECT_STAGES)[number];
export const normalProjectStageSchema = z.enum(NORMAL_PROJECT_STAGES);
export type InterruptProjectStage = "blocked" | "archived";
export const INTERRUPT_PROJECT_STAGES = ["blocked", "archived"] as const;

export const PROJECT_TOOLS = ["claude_code", "codex", "cursor"] as const;
export type ProjectTool = (typeof PROJECT_TOOLS)[number];
export const projectToolSchema = z.enum(PROJECT_TOOLS);

export const ENTITY_STATUSES = ["proposed", "confirmed", "rejected", "superseded"] as const;
export type ProjectEntityStatus = (typeof ENTITY_STATUSES)[number];
export const projectEntityStatusSchema = z.enum(ENTITY_STATUSES);

export const MILESTONE_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "needs_verification",
  "blocked",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export const milestoneStatusSchema = z.enum(MILESTONE_STATUSES);

export const SUMMARY_STATUSES = ["current", "superseded"] as const;
export type ProjectSummaryStatus = (typeof SUMMARY_STATUSES)[number];
export const projectSummaryStatusSchema = z.enum(SUMMARY_STATUSES);

export const ACTOR_TYPES = ["user", "system", "model", "workflow", "billing"] as const;
export type ProjectActorType = (typeof ACTOR_TYPES)[number];
export const projectActorTypeSchema = z.enum(ACTOR_TYPES);

/** Events accepted by the Phase 6 state boundary. Historical event types remain readable. */
export const PROJECT_EVENT_TYPES = [
  "project.mode_changed",
  "project.stage_transitioned",
  "project.blocked",
  "project.unblocked",
  "project.completed",
  "project.archived",
  "project.restored",
  "project.delta_proposed",
  "requirement.confirmed",
  "requirement.rejected",
  "requirement.superseded",
  "decision.confirmed",
  "decision.rejected",
  "decision.superseded",
  "milestone.activated",
  "milestone.deactivated",
  "milestone.status_confirmed",
  "project.summary_replaced",
] as const;
export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];
export const projectEventTypeSchema = z.enum(PROJECT_EVENT_TYPES);

/** Stable application error codes. Messages are intentionally not content-bearing. */
export const PROJECT_ERROR_CODES = [
  "auth_required",
  "validation_failed",
  "project_not_found",
  "stale_state_version",
  "idempotency_conflict",
  "idempotency_in_progress",
  "invalid_transition",
  "transition_precondition_failed",
  "completion_precondition_failed",
  "confirmation_required",
  "entity_not_found",
  "entity_state_conflict",
  "supersession_conflict",
  "decision_key_conflict",
  "proposal_not_replayable",
  "proposal_schema_mismatch",
  "proposal_conflict",
  "proposal_already_applied",
  "resume_target_unavailable",
  "confirmed_invariants_exceed_budget",
  "context_budget_invalid",
  "persistence_failed",
] as const;
export type ProjectErrorCode = (typeof PROJECT_ERROR_CODES)[number];

/** A safe domain error. The message is always the stable code, never a database/provider message. */
export class ProjectDomainError extends Error {
  readonly code: ProjectErrorCode;

  constructor(code: ProjectErrorCode) {
    super(code);
    this.name = "ProjectDomainError";
    this.code = code;
  }
}

export interface ProjectProjectionV1 {
  readonly id: string;
  readonly mode: ProjectMode;
  readonly stage: ProjectStage;
  readonly stateVersion: number;
  readonly selectedTool: ProjectTool | null;
  readonly activeMilestoneId: string | null;
  readonly blockerSummary: string | null;
  /** The normal stage from which a blocked project can resume. */
  readonly blockedFromStage: NormalProjectStage | null;
  /** A normal stage or `blocked`; archived projects resume at this stage. */
  readonly archivedFromStage: Exclude<ProjectStage, "archived"> | null;
  readonly archivedAt: string | null;
}

export interface ProjectRequirementV1 {
  readonly id: string;
  readonly projectId: string;
  readonly category: string;
  readonly statement: string;
  readonly rationale: string | null;
  readonly status: ProjectEntityStatus;
  readonly sourceEventId: string | null;
  readonly supersedesRequirementId: string | null;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectDecisionV1 {
  readonly id: string;
  readonly projectId: string;
  readonly decisionKey: string;
  readonly decision: string;
  readonly rationale: string | null;
  readonly status: ProjectEntityStatus;
  readonly sourceEventId: string | null;
  readonly supersedesDecisionId: string | null;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectMilestoneV1 {
  readonly id: string;
  readonly projectId: string;
  readonly position: number;
  readonly title: string;
  readonly description: string | null;
  readonly suggestedStatus: MilestoneStatus;
  readonly confirmedStatus: MilestoneStatus | null;
  readonly confirmationEventId: string | null;
  readonly blockedReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ProjectJsonPrimitive = string | number | boolean | null;
export type ProjectJsonValue =
  ProjectJsonPrimitive | readonly ProjectJsonValue[] | { readonly [key: string]: ProjectJsonValue };

export interface ProjectSummaryV1 {
  readonly id: string;
  readonly projectId: string;
  readonly summaryKind: string;
  readonly version: number;
  readonly basedOnEventSequence: number;
  readonly summaryText: string;
  readonly structuredFacts: ProjectJsonValue;
  readonly status: ProjectSummaryStatus;
  readonly createdAt: string;
}

export interface RecentEvidenceDescriptorV1 {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  readonly occurredAt: string;
  readonly evidenceLabel: string | null;
}

/** Canonical state assembled by a repository before domain evaluation/compilation. */
export interface ProjectStateV1 {
  readonly projection: ProjectProjectionV1;
  readonly requirements: readonly ProjectRequirementV1[];
  readonly decisions: readonly ProjectDecisionV1[];
  readonly milestones: readonly ProjectMilestoneV1[];
  readonly summaries: readonly ProjectSummaryV1[];
  readonly effectivePreferences?: EffectivePreferences;
  readonly recentEvidence?: readonly RecentEvidenceDescriptorV1[];
}

export type ProjectStateSnapshotV1 = ProjectStateV1;

export interface ProjectCommitResultV1 {
  readonly projectId: string;
  readonly eventId: string;
  readonly stateVersion: number;
  readonly replayed: boolean;
}

export interface ProjectUserActorV1 {
  readonly actorType: "user";
  readonly actorId: string;
}

export interface ProjectCommandEnvelopeV1<C = ProjectCommandV1> {
  readonly schema: typeof PROJECT_COMMAND_SCHEMA;
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  readonly projectId: string;
  readonly expectedStateVersion: number;
  readonly idempotencyKey: string;
  readonly command: C;
}

export type ProjectCommandV1 =
  | TransitionStageCommandV1
  | BlockProjectCommandV1
  | UnblockProjectCommandV1
  | ArchiveProjectCommandV1
  | RestoreProjectCommandV1
  | ChangeModeCommandV1
  | SetActiveMilestoneCommandV1
  | ConfirmRequirementCommandV1
  | RejectRequirementCommandV1
  | SupersedeRequirementCommandV1
  | ConfirmDecisionCommandV1
  | RejectDecisionCommandV1
  | SupersedeDecisionCommandV1
  | ConfirmMilestoneStatusCommandV1
  | ReplaceSummaryCommandV1;

export interface TransitionStageCommandV1 {
  readonly type: "transition_stage";
  readonly to: ProjectStage;
}

export interface BlockProjectCommandV1 {
  readonly type: "block_project";
  readonly blockerSummary: string;
}

export interface UnblockProjectCommandV1 {
  readonly type: "unblock_project";
}

export interface ArchiveProjectCommandV1 {
  readonly type: "archive_project";
}

export interface RestoreProjectCommandV1 {
  readonly type: "restore_project";
}

export interface ChangeModeCommandV1 {
  readonly type: "change_mode";
  readonly mode: ProjectMode;
}

export interface SetActiveMilestoneCommandV1 {
  readonly type: "set_active_milestone";
  readonly milestoneId: string | null;
}

export interface ConfirmRequirementCommandV1 {
  readonly type: "confirm_requirement";
  readonly requirementId: string;
  readonly category: string;
}

export interface RejectRequirementCommandV1 {
  readonly type: "reject_requirement";
  readonly requirementId: string;
}

export interface SupersedeRequirementCommandV1 {
  readonly type: "supersede_requirement";
  readonly predecessorId: string;
  readonly category: string;
  readonly statement: string;
  readonly rationale?: string | null | undefined;
}

export interface ConfirmDecisionCommandV1 {
  readonly type: "confirm_decision";
  readonly decisionId: string;
  readonly decisionKey: string;
}

export interface RejectDecisionCommandV1 {
  readonly type: "reject_decision";
  readonly decisionId: string;
}

export interface SupersedeDecisionCommandV1 {
  readonly type: "supersede_decision";
  readonly predecessorId: string;
  readonly decisionKey?: string | undefined;
  readonly decision: string;
  readonly rationale?: string | null | undefined;
}

export interface ConfirmMilestoneStatusCommandV1 {
  readonly type: "confirm_milestone_status";
  readonly milestoneId: string;
  readonly status: MilestoneStatus;
  readonly blockedReason?: string | null | undefined;
}

export interface ReplaceSummaryCommandV1 {
  readonly type: "replace_summary";
  readonly summaryKind: string;
  readonly summaryText: string;
  readonly structuredFacts?: ProjectJsonValue | undefined;
}

/** The model proposal shape is intentionally a type-only alias to the Phase 5 contract. */
export interface ProjectRequirementProposalV1 {
  readonly action: "add" | "revise" | "remove";
  readonly reference: string;
  readonly statement: string;
  readonly rationale: string;
}
export interface ProjectDecisionProposalV1 {
  readonly action: "add" | "revise" | "remove";
  readonly reference: string;
  readonly statement: string;
  readonly rationale: string;
}
export interface ProjectMilestoneProposalV1 {
  readonly action: "add" | "revise" | "remove";
  readonly reference: string;
  readonly title: string;
  readonly rationale: string;
}
export interface ProjectDeltaProposalV1 {
  readonly summary: string;
  readonly requirementProposals: readonly ProjectRequirementProposalV1[];
  readonly decisionProposals: readonly ProjectDecisionProposalV1[];
  readonly milestoneProposals: readonly ProjectMilestoneProposalV1[];
  readonly unresolvedConflicts: readonly string[];
}

export interface ProjectContradictionV1 {
  readonly kind:
    | "stale_state"
    | "decision_key_conflict"
    | "supersession_conflict"
    | "incompatible_transition"
    | "requirement_reference_conflict"
    | "milestone_reference_conflict";
  readonly code: ProjectErrorCode;
  readonly entityId?: string;
  readonly predecessorId?: string;
  readonly decisionKey?: string;
}

export interface ProjectContradictionInputV1 {
  readonly state: ProjectStateV1;
  readonly expectedStateVersion: number;
  readonly command?: ProjectCommandV1;
  readonly proposal?: ProjectDeltaProposalV1;
}
