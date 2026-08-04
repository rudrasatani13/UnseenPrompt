import {
  ProjectDomainError,
  type NormalProjectStage,
  type ProjectCommandEnvelopeV1,
  type ProjectCommandV1,
  type ProjectEntityStatus,
  type ProjectMilestoneV1,
  type ProjectProjectionV1,
  type ProjectStage,
  type ProjectStateV1,
  type MilestoneStatus,
} from "./contracts";
import { normalizeDecisionKeyV1 } from "./commands";
import type { ProjectContradictionV1 } from "./contracts";

export const NORMAL_STAGE_TRANSITIONS: Readonly<
  Record<NormalProjectStage, readonly ProjectStage[]>
> = Object.freeze({
  discovery: ["brief_confirmation"],
  brief_confirmation: ["discovery", "ready_for_prompt"],
  ready_for_prompt: ["brief_confirmation", "prompt_active"],
  prompt_active: ["awaiting_return"],
  awaiting_return: ["result_review"],
  result_review: ["iteration", "completed"],
  iteration: ["ready_for_prompt", "completed"],
  completed: ["iteration"],
});

const NORMAL_STAGES = new Set<NormalProjectStage>([
  "discovery",
  "brief_confirmation",
  "ready_for_prompt",
  "prompt_active",
  "awaiting_return",
  "result_review",
  "iteration",
  "completed",
]);

export interface LifecycleFactsV1 {
  readonly state: ProjectStateV1;
  readonly deterministicConflicts?: readonly ProjectContradictionV1[];
}

export interface LifecycleSuccessV1 {
  readonly ok: true;
  readonly fromStage: ProjectStage;
  readonly toStage: ProjectStage;
}

export interface LifecycleFailureV1 {
  readonly ok: false;
  readonly code:
    | "invalid_transition"
    | "transition_precondition_failed"
    | "completion_precondition_failed"
    | "resume_target_unavailable"
    | "entity_not_found"
    | "entity_state_conflict"
    | "supersession_conflict"
    | "decision_key_conflict"
    | "validation_failed";
}

export type LifecycleResultV1 = LifecycleSuccessV1 | LifecycleFailureV1;
export type EntityValidationResultV1 =
  { readonly ok: true } | { readonly ok: false; readonly code: LifecycleFailureV1["code"] };

export function isNormalProjectStage(stage: ProjectStage | string): stage is NormalProjectStage {
  return NORMAL_STAGES.has(stage as NormalProjectStage);
}

export function isInterruptProjectStage(
  stage: ProjectStage | string,
): stage is "blocked" | "archived" {
  return stage === "blocked" || stage === "archived";
}

export function isAllowedStageTransition(from: ProjectStage, to: ProjectStage): boolean {
  return isNormalProjectStage(from) && NORMAL_STAGE_TRANSITIONS[from].includes(to);
}

function factsOf(input: ProjectStateV1 | LifecycleFactsV1): LifecycleFactsV1 {
  return "state" in input ? input : { state: input };
}

function hasBlocker(projection: ProjectProjectionV1): boolean {
  return projection.blockerSummary !== null && projection.blockerSummary.trim().length > 0;
}

function activeMilestone(state: ProjectStateV1): ProjectMilestoneV1 | null {
  const id = state.projection.activeMilestoneId;
  return id === null ? null : (state.milestones.find((milestone) => milestone.id === id) ?? null);
}

function preconditionForNormalTransition(
  facts: LifecycleFactsV1,
  from: NormalProjectStage,
  to: ProjectStage,
): LifecycleFailureV1["code"] | null {
  const { state } = facts;
  const projection = state.projection;
  if (hasBlocker(projection)) return "transition_precondition_failed";

  if (from === "brief_confirmation" && to === "ready_for_prompt") {
    if (state.requirements.filter((row) => row.status === "confirmed").length === 0) {
      return "transition_precondition_failed";
    }
    if ((facts.deterministicConflicts ?? []).length > 0) {
      return "transition_precondition_failed";
    }
  }

  if (from === "ready_for_prompt" && to === "prompt_active") {
    if (projection.selectedTool === null || activeMilestone(state) === null) {
      return "transition_precondition_failed";
    }
  }

  if ((from === "result_review" || from === "iteration") && to === "completed") {
    if (state.milestones.length === 0) return "completion_precondition_failed";
    if (state.milestones.some((milestone) => milestone.confirmedStatus !== "completed")) {
      return "completion_precondition_failed";
    }
  }

  if (from === "iteration" && to === "ready_for_prompt") {
    const milestone = activeMilestone(state);
    if (milestone === null || milestone.confirmedStatus === "completed") {
      return "transition_precondition_failed";
    }
  }

  return null;
}

export function validateStageTransitionV1(
  input: ProjectStateV1 | LifecycleFactsV1,
  to: ProjectStage,
): LifecycleResultV1 {
  const facts = factsOf(input);
  const { projection } = facts.state;
  const from = projection.stage;
  if (from === to || !isNormalProjectStage(from) || !isNormalProjectStage(to)) {
    return { ok: false, code: "invalid_transition" };
  }
  if (!isAllowedStageTransition(from, to)) return { ok: false, code: "invalid_transition" };
  const preconditionFailure = preconditionForNormalTransition(facts, from, to);
  return preconditionFailure === null
    ? { ok: true, fromStage: from, toStage: to }
    : { ok: false, code: preconditionFailure };
}

export function validateLifecycleCommandV1(
  input: ProjectStateV1 | LifecycleFactsV1,
  command: ProjectCommandV1 | ProjectCommandEnvelopeV1,
): LifecycleResultV1 {
  const facts = factsOf(input);
  const value = "command" in command ? command.command : command;
  const projection = facts.state.projection;

  if (projection.stage === "archived" && value.type !== "restore_project") {
    return { ok: false, code: "invalid_transition" };
  }

  switch (value.type) {
    case "transition_stage":
      return validateStageTransitionV1(facts, value.to);
    case "block_project":
      if (!isNormalProjectStage(projection.stage) || projection.stage === "completed") {
        return { ok: false, code: "invalid_transition" };
      }
      return value.blockerSummary.trim().length > 0
        ? { ok: true, fromStage: projection.stage, toStage: "blocked" }
        : { ok: false, code: "transition_precondition_failed" };
    case "unblock_project":
      if (projection.stage !== "blocked") return { ok: false, code: "invalid_transition" };
      if (
        projection.blockedFromStage === null ||
        !isNormalProjectStage(projection.blockedFromStage)
      ) {
        return { ok: false, code: "resume_target_unavailable" };
      }
      return { ok: true, fromStage: "blocked", toStage: projection.blockedFromStage };
    case "archive_project":
      return projection.stage === "archived"
        ? { ok: false, code: "invalid_transition" }
        : { ok: true, fromStage: projection.stage, toStage: "archived" };
    case "restore_project":
      if (projection.stage !== "archived") return { ok: false, code: "invalid_transition" };
      if (projection.archivedFromStage === null) {
        return { ok: false, code: "resume_target_unavailable" };
      }
      if (projection.archivedFromStage === "blocked" && projection.blockedFromStage === null) {
        return { ok: false, code: "resume_target_unavailable" };
      }
      return { ok: true, fromStage: "archived", toStage: projection.archivedFromStage };
    case "change_mode":
      return projection.stage === "archived" || projection.mode === value.mode
        ? { ok: false, code: "invalid_transition" }
        : { ok: true, fromStage: projection.stage, toStage: projection.stage };
    default:
      return { ok: true, fromStage: projection.stage, toStage: projection.stage };
  }
}

function rowFor<T extends { readonly id: string; readonly projectId: string }>(
  rows: readonly T[],
  state: ProjectStateV1,
  id: string,
): T | null {
  return rows.find((row) => row.id === id && row.projectId === state.projection.id) ?? null;
}

function hasSuccessor<
  T extends {
    readonly id: string;
    readonly supersedesRequirementId?: string | null;
    readonly supersedesDecisionId?: string | null;
  },
>(
  rows: readonly T[],
  predecessorId: string,
  key: "supersedesRequirementId" | "supersedesDecisionId",
  excludeId?: string,
): boolean {
  return rows.some((row) => row.id !== excludeId && row[key] === predecessorId);
}

function requirementPredecessorIsActive(
  state: ProjectStateV1,
  row: { readonly projectId: string; readonly supersedesRequirementId: string | null },
  rowId: string,
): boolean {
  if (row.supersedesRequirementId === null) return true;
  const predecessor = rowFor(state.requirements, state, row.supersedesRequirementId);
  return (
    predecessor !== null &&
    predecessor.status === "confirmed" &&
    !hasSuccessor(state.requirements, predecessor.id, "supersedesRequirementId", rowId)
  );
}

function decisionPredecessorIsActive(
  state: ProjectStateV1,
  row: { readonly supersedesDecisionId: string | null },
  rowId: string,
): boolean {
  if (row.supersedesDecisionId === null) return true;
  const predecessor = rowFor(state.decisions, state, row.supersedesDecisionId);
  return (
    predecessor !== null &&
    predecessor.status === "confirmed" &&
    !hasSuccessor(state.decisions, predecessor.id, "supersedesDecisionId", rowId)
  );
}

export function validateRequirementCommandV1(
  state: ProjectStateV1,
  command: Extract<
    ProjectCommandV1,
    { readonly type: "confirm_requirement" | "reject_requirement" | "supersede_requirement" }
  >,
): EntityValidationResultV1 {
  if (command.type === "supersede_requirement") {
    const predecessor = rowFor(state.requirements, state, command.predecessorId);
    if (predecessor === null) return { ok: false, code: "entity_not_found" };
    if (
      predecessor.status !== "confirmed" ||
      hasSuccessor(state.requirements, predecessor.id, "supersedesRequirementId")
    ) {
      return { ok: false, code: "supersession_conflict" };
    }
    return { ok: true };
  }
  const row = rowFor(state.requirements, state, command.requirementId);
  if (row === null) return { ok: false, code: "entity_not_found" };
  if (
    command.type === "confirm_requirement" &&
    !requirementPredecessorIsActive(state, row, row.id)
  ) {
    return { ok: false, code: "supersession_conflict" };
  }
  return row.status === "proposed" ? { ok: true } : { ok: false, code: "entity_state_conflict" };
}

export function validateDecisionCommandV1(
  state: ProjectStateV1,
  command: Extract<
    ProjectCommandV1,
    { readonly type: "confirm_decision" | "reject_decision" | "supersede_decision" }
  >,
): EntityValidationResultV1 {
  const predecessorId =
    command.type === "supersede_decision" ? command.predecessorId : command.decisionId;
  const row = rowFor(state.decisions, state, predecessorId);
  if (row === null) return { ok: false, code: "entity_not_found" };
  if (command.type !== "supersede_decision" && row.status !== "proposed") {
    return { ok: false, code: "entity_state_conflict" };
  }
  if (command.type === "reject_decision") return { ok: true };
  if (
    command.type === "supersede_decision" &&
    (row.status !== "confirmed" || hasSuccessor(state.decisions, row.id, "supersedesDecisionId"))
  ) {
    return { ok: false, code: "supersession_conflict" };
  }
  if (command.type === "confirm_decision" && !decisionPredecessorIsActive(state, row, row.id)) {
    return { ok: false, code: "supersession_conflict" };
  }
  const key =
    command.type === "confirm_decision"
      ? command.decisionKey
      : command.type === "supersede_decision"
        ? (command.decisionKey ?? row.decisionKey)
        : row.decisionKey;
  let normalized: string;
  try {
    normalized = normalizeDecisionKeyV1(key);
  } catch {
    return { ok: false, code: "validation_failed" };
  }
  if (
    state.decisions.some(
      (decision) =>
        decision.status === "confirmed" &&
        decision.id !== row.id &&
        decision.id !== row.supersedesDecisionId &&
        normalizeDecisionKeySafe(decision.decisionKey) === normalized,
    )
  ) {
    return { ok: false, code: "decision_key_conflict" };
  }
  return { ok: true };
}

function normalizeDecisionKeySafe(value: string): string | null {
  try {
    return normalizeDecisionKeyV1(value);
  } catch {
    return null;
  }
}

export function validateMilestoneCommandV1(
  state: ProjectStateV1,
  command: Extract<
    ProjectCommandV1,
    { readonly type: "set_active_milestone" | "confirm_milestone_status" }
  >,
): EntityValidationResultV1 {
  if (command.type === "set_active_milestone" && command.milestoneId === null) return { ok: true };
  const id = command.milestoneId;
  if (id === null) return { ok: true };
  return rowFor(state.milestones, state, id) === null
    ? { ok: false, code: "entity_not_found" }
    : { ok: true };
}

export function isEntityStatus(value: unknown): value is ProjectEntityStatus {
  return (
    value === "proposed" || value === "confirmed" || value === "rejected" || value === "superseded"
  );
}

export function isMilestoneStatus(value: unknown): value is MilestoneStatus {
  return (
    value === "pending" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "needs_verification" ||
    value === "blocked"
  );
}

/** Throws only a stable code, useful at application boundaries that prefer exceptions. */
export function assertLifecycleCommandV1(
  input: ProjectStateV1 | LifecycleFactsV1,
  command: ProjectCommandV1,
): void {
  const result = validateLifecycleCommandV1(input, command);
  if (!result.ok) throw new ProjectDomainError(result.code);
}
