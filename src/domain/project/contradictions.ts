import {
  type ProjectCommandV1,
  type ProjectContradictionInputV1,
  type ProjectContradictionV1,
  type ProjectDeltaProposalV1,
  type ProjectStateV1,
} from "./contracts";
import {
  validateDecisionCommandV1,
  validateLifecycleCommandV1,
  validateMilestoneCommandV1,
  validateRequirementCommandV1,
} from "./lifecycle";

function staleConflict(): ProjectContradictionV1 {
  return { kind: "stale_state", code: "stale_state_version" };
}

function proposalReferenceConflicts(
  state: ProjectStateV1,
  proposal: ProjectDeltaProposalV1,
): ProjectContradictionV1[] {
  const conflicts: ProjectContradictionV1[] = [];
  if (proposal.unresolvedConflicts.length > 0) {
    conflicts.push({ kind: "incompatible_transition", code: "proposal_conflict" });
  }
  for (const item of proposal.requirementProposals) {
    if (item.action === "add") continue;
    if (item.action === "remove") {
      conflicts.push({ kind: "requirement_reference_conflict", code: "proposal_conflict" });
      continue;
    }
    const target = state.requirements.find(
      (row) => row.id === item.reference && row.projectId === state.projection.id,
    );
    if (!isUuid(item.reference) || target === undefined || target.status !== "confirmed") {
      conflicts.push({
        kind: "requirement_reference_conflict",
        code: "proposal_conflict",
        entityId: item.reference,
      });
    }
  }
  for (const item of proposal.decisionProposals) {
    if (item.action === "add") continue;
    if (item.action === "remove") {
      conflicts.push({ kind: "supersession_conflict", code: "proposal_conflict" });
      continue;
    }
    const target = state.decisions.find(
      (row) => row.id === item.reference && row.projectId === state.projection.id,
    );
    if (!isUuid(item.reference) || target === undefined || target.status !== "confirmed") {
      conflicts.push({
        kind: "supersession_conflict",
        code: "proposal_conflict",
        entityId: item.reference,
      });
    }
  }
  for (const item of proposal.milestoneProposals) {
    if (item.action === "add") continue;
    if (item.action === "remove") {
      conflicts.push({ kind: "milestone_reference_conflict", code: "proposal_conflict" });
      continue;
    }
    const target = state.milestones.find(
      (row) => row.id === item.reference && row.projectId === state.projection.id,
    );
    if (!isUuid(item.reference) || target === undefined) {
      conflicts.push({
        kind: "milestone_reference_conflict",
        code: "proposal_conflict",
        entityId: item.reference,
      });
    }
  }

  return conflicts;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function commandConflicts(
  state: ProjectStateV1,
  command: ProjectCommandV1,
): ProjectContradictionV1[] {
  if (
    command.type === "transition_stage" ||
    command.type === "block_project" ||
    command.type === "unblock_project" ||
    command.type === "archive_project" ||
    command.type === "restore_project" ||
    command.type === "change_mode"
  ) {
    const result = validateLifecycleCommandV1(state, command);
    return result.ok ? [] : [{ kind: "incompatible_transition", code: result.code }];
  }

  if (
    command.type === "confirm_requirement" ||
    command.type === "reject_requirement" ||
    command.type === "supersede_requirement"
  ) {
    const result = validateRequirementCommandV1(state, command);
    if (result.ok) return [];
    return [
      {
        kind:
          result.code === "supersession_conflict"
            ? "supersession_conflict"
            : "requirement_reference_conflict",
        code: result.code,
        entityId:
          command.type === "supersede_requirement" ? command.predecessorId : command.requirementId,
      },
    ];
  }

  if (
    command.type === "confirm_decision" ||
    command.type === "reject_decision" ||
    command.type === "supersede_decision"
  ) {
    const result = validateDecisionCommandV1(state, command);
    if (result.ok) return [];
    return [
      {
        kind:
          result.code === "decision_key_conflict"
            ? "decision_key_conflict"
            : result.code === "supersession_conflict"
              ? "supersession_conflict"
              : "incompatible_transition",
        code: result.code,
        entityId:
          command.type === "supersede_decision" ? command.predecessorId : command.decisionId,
      },
    ];
  }

  if (command.type === "set_active_milestone" || command.type === "confirm_milestone_status") {
    const result = validateMilestoneCommandV1(state, command);
    return result.ok
      ? []
      : [
          {
            kind: "milestone_reference_conflict",
            code: result.code,
            ...(command.milestoneId === null ? {} : { entityId: command.milestoneId }),
          },
        ];
  }

  return [];
}

/** Deterministic conflicts only; model prose is not semantically interpreted, but non-empty
 * unresolved-conflict metadata blocks proposal application. */
export function detectProjectContradictions(
  input: ProjectContradictionInputV1,
): readonly ProjectContradictionV1[] {
  if (input.expectedStateVersion !== input.state.projection.stateVersion) return [staleConflict()];

  const conflicts: ProjectContradictionV1[] = [];
  if (input.command !== undefined) conflicts.push(...commandConflicts(input.state, input.command));
  if (input.proposal !== undefined)
    conflicts.push(...proposalReferenceConflicts(input.state, input.proposal));

  return conflicts;
}

export const classifyProjectContradictions = detectProjectContradictions;
export const findProjectConflicts = detectProjectContradictions;
