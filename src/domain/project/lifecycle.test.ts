import { describe, expect, it } from "vitest";

import type {
  ProjectDecisionV1,
  ProjectMilestoneV1,
  ProjectRequirementV1,
  ProjectStateV1,
} from "./contracts";
import {
  isAllowedStageTransition,
  validateDecisionCommandV1,
  validateLifecycleCommandV1,
  validateMilestoneCommandV1,
  validateRequirementCommandV1,
  validateStageTransitionV1,
  NORMAL_STAGE_TRANSITIONS,
} from "./lifecycle";
import { PROJECT_STAGES } from "./contracts";

const projectId = "11111111-1111-4111-8111-111111111111";
const requirementId = "22222222-2222-4222-8222-222222222222";
const decisionId = "33333333-3333-4333-8333-333333333333";
const milestoneId = "44444444-4444-4444-8444-444444444444";

const requirement = (
  status: ProjectRequirementV1["status"] = "confirmed",
): ProjectRequirementV1 => ({
  id: requirementId,
  projectId,
  category: "scope",
  statement: "The feature is bounded.",
  rationale: null,
  status,
  sourceEventId: null,
  supersedesRequirementId: null,
  confirmedAt: status === "confirmed" ? "2026-01-01T00:00:00.000Z" : null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const decision = (status: ProjectDecisionV1["status"] = "confirmed"): ProjectDecisionV1 => ({
  id: decisionId,
  projectId,
  decisionKey: "stack",
  decision: "Use the saved stack.",
  rationale: null,
  status,
  sourceEventId: null,
  supersedesDecisionId: null,
  confirmedAt: status === "confirmed" ? "2026-01-01T00:00:00.000Z" : null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const milestone = (
  confirmedStatus: ProjectMilestoneV1["confirmedStatus"] = "in_progress",
): ProjectMilestoneV1 => ({
  id: milestoneId,
  projectId,
  position: 1,
  title: "Implement",
  description: null,
  suggestedStatus: "pending",
  confirmedStatus,
  confirmationEventId: null,
  blockedReason: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

function state(
  stage: ProjectStateV1["projection"]["stage"] = "brief_confirmation",
): ProjectStateV1 {
  return {
    projection: {
      id: projectId,
      mode: "new_build",
      stage,
      stateVersion: 1,
      selectedTool: "codex",
      activeMilestoneId: milestoneId,
      blockerSummary: null,
      blockedFromStage: null,
      archivedFromStage: null,
      archivedAt: null,
    },
    requirements: [requirement()],
    decisions: [decision()],
    milestones: [milestone()],
    summaries: [],
  };
}

describe("project lifecycle graph", () => {
  it("accepts only the exact normal edges", () => {
    expect(isAllowedStageTransition("discovery", "brief_confirmation")).toBe(true);
    expect(isAllowedStageTransition("brief_confirmation", "discovery")).toBe(true);
    expect(isAllowedStageTransition("brief_confirmation", "ready_for_prompt")).toBe(true);
    expect(isAllowedStageTransition("ready_for_prompt", "prompt_active")).toBe(true);
    expect(isAllowedStageTransition("prompt_active", "awaiting_return")).toBe(true);
    expect(isAllowedStageTransition("awaiting_return", "result_review")).toBe(true);
    expect(isAllowedStageTransition("result_review", "iteration")).toBe(true);
    expect(isAllowedStageTransition("result_review", "completed")).toBe(true);
    expect(isAllowedStageTransition("iteration", "ready_for_prompt")).toBe(true);
    expect(isAllowedStageTransition("iteration", "completed")).toBe(true);
    expect(isAllowedStageTransition("completed", "iteration")).toBe(true);
    expect(isAllowedStageTransition("discovery", "prompt_active")).toBe(false);
    expect(isAllowedStageTransition("completed", "ready_for_prompt")).toBe(false);
    expect(isAllowedStageTransition("blocked", "discovery")).toBe(false);
  });

  it("rejects every non-edge pair across all ten stages", () => {
    const expected = new Set(
      Object.entries(NORMAL_STAGE_TRANSITIONS).flatMap(([from, targets]) =>
        targets.map((target) => `${from}:${target}`),
      ),
    );
    for (const from of PROJECT_STAGES) {
      for (const to of PROJECT_STAGES) {
        expect(isAllowedStageTransition(from, to)).toBe(expected.has(`${from}:${to}`));
      }
    }
  });

  it("enforces transition preconditions and completion gates", () => {
    expect(validateStageTransitionV1(state(), "ready_for_prompt")).toMatchObject({ ok: true });
    expect(
      validateStageTransitionV1({ ...state(), requirements: [] }, "ready_for_prompt"),
    ).toMatchObject({
      ok: false,
      code: "transition_precondition_failed",
    });
    expect(validateStageTransitionV1(state("ready_for_prompt"), "prompt_active")).toMatchObject({
      ok: true,
    });
    expect(
      validateStageTransitionV1(
        {
          ...state("ready_for_prompt"),
          projection: { ...state("ready_for_prompt").projection, activeMilestoneId: null },
        },
        "prompt_active",
      ),
    ).toMatchObject({ ok: false, code: "transition_precondition_failed" });
    expect(
      validateStageTransitionV1(
        {
          state: state(),
          deterministicConflicts: [{ kind: "stale_state", code: "stale_state_version" }],
        },
        "ready_for_prompt",
      ),
    ).toMatchObject({
      ok: false,
      code: "transition_precondition_failed",
    });
    expect(
      validateStageTransitionV1(
        {
          ...state("ready_for_prompt"),
          projection: { ...state("ready_for_prompt").projection, selectedTool: null },
        },
        "prompt_active",
      ),
    ).toMatchObject({ ok: false, code: "transition_precondition_failed" });
    expect(validateStageTransitionV1(state("result_review"), "completed")).toMatchObject({
      ok: false,
      code: "completion_precondition_failed",
    });
    expect(
      validateStageTransitionV1(
        {
          ...state("result_review"),
          milestones: [
            milestone("in_progress"),
            {
              ...milestone(),
              id: "55555555-5555-4555-8555-555555555555",
              confirmedStatus: "completed",
            },
          ],
        },
        "completed",
      ),
    ).toMatchObject({ ok: false, code: "completion_precondition_failed" });
    expect(
      validateStageTransitionV1(
        { ...state("result_review"), milestones: [milestone("completed")] },
        "completed",
      ),
    ).toMatchObject({ ok: true });
    expect(
      validateStageTransitionV1(
        { ...state("iteration"), milestones: [milestone("completed")] },
        "ready_for_prompt",
      ),
    ).toMatchObject({ ok: false, code: "transition_precondition_failed" });
    expect(
      validateStageTransitionV1(
        {
          ...state("ready_for_prompt"),
          projection: { ...state("ready_for_prompt").projection, blockerSummary: "blocked" },
        },
        "prompt_active",
      ),
    ).toMatchObject({ ok: false, code: "transition_precondition_failed" });
  });

  it("models block/unblock/archive/restore as explicit interrupt commands", () => {
    expect(
      validateLifecycleCommandV1(state("iteration"), {
        type: "block_project",
        blockerSummary: "Waiting",
      }),
    ).toMatchObject({
      ok: true,
      toStage: "blocked",
    });
    expect(
      validateLifecycleCommandV1(state("completed"), {
        type: "block_project",
        blockerSummary: "Waiting",
      }),
    ).toMatchObject({
      ok: false,
      code: "invalid_transition",
    });
    const blocked = {
      ...state("blocked"),
      projection: {
        ...state("blocked").projection,
        blockedFromStage: "iteration" as const,
        blockerSummary: "Waiting",
      },
    };
    expect(validateLifecycleCommandV1(blocked, { type: "unblock_project" })).toMatchObject({
      ok: true,
      toStage: "iteration",
    });
    const archived = {
      ...state("archived"),
      projection: { ...state("archived").projection, archivedFromStage: "iteration" as const },
    };
    expect(validateLifecycleCommandV1(archived, { type: "restore_project" })).toMatchObject({
      ok: true,
      toStage: "iteration",
    });
    expect(
      validateLifecycleCommandV1(archived, { type: "change_mode", mode: "bug" }),
    ).toMatchObject({
      ok: false,
      code: "invalid_transition",
    });
    expect(
      validateLifecycleCommandV1(
        { ...blocked, projection: { ...blocked.projection, blockedFromStage: null } },
        { type: "unblock_project" },
      ),
    ).toMatchObject({ ok: false, code: "resume_target_unavailable" });
    const archivedBlocked = {
      ...blocked,
      projection: {
        ...blocked.projection,
        stage: "archived" as const,
        archivedFromStage: "blocked" as const,
      },
    };
    expect(validateLifecycleCommandV1(archivedBlocked, { type: "restore_project" })).toMatchObject({
      ok: true,
      toStage: "blocked",
    });
    expect(
      validateLifecycleCommandV1(
        {
          ...archivedBlocked,
          projection: { ...archivedBlocked.projection, blockedFromStage: null },
        },
        { type: "restore_project" },
      ),
    ).toMatchObject({ ok: false, code: "resume_target_unavailable" });
    expect(
      validateLifecycleCommandV1(state("iteration"), { type: "change_mode", mode: "new_build" }),
    ).toMatchObject({ ok: false, code: "invalid_transition" });
    expect(
      validateLifecycleCommandV1(state("iteration"), { type: "change_mode", mode: "bug" }),
    ).toMatchObject({ ok: true });
  });
});

describe("project entity lifecycle", () => {
  it("only confirms or rejects proposals and supersedes confirmed predecessors", () => {
    const proposed = { ...state(), requirements: [requirement("proposed")] };
    expect(
      validateRequirementCommandV1(proposed, {
        type: "confirm_requirement",
        requirementId,
        category: "scope",
      }),
    ).toEqual({ ok: true });
    expect(
      validateRequirementCommandV1(proposed, { type: "reject_requirement", requirementId }),
    ).toEqual({ ok: true });
    expect(
      validateRequirementCommandV1(state(), { type: "reject_requirement", requirementId }),
    ).toMatchObject({ ok: false, code: "entity_state_conflict" });
    expect(
      validateRequirementCommandV1(state(), {
        type: "supersede_requirement",
        predecessorId: requirementId,
        category: "scope",
        statement: "New",
      }),
    ).toEqual({ ok: true });

    const revision = {
      ...requirement("proposed"),
      id: "55555555-5555-4555-8555-555555555555",
      supersedesRequirementId: requirementId,
    };
    expect(
      validateRequirementCommandV1(
        { ...state(), requirements: [requirement(), revision] },
        {
          type: "confirm_requirement",
          requirementId: revision.id,
          category: "scope",
        },
      ),
    ).toEqual({ ok: true });
    const branched = { ...revision, id: "66666666-6666-4666-8666-666666666666" };
    expect(
      validateRequirementCommandV1(
        { ...state(), requirements: [requirement(), revision, branched] },
        {
          type: "confirm_requirement",
          requirementId: revision.id,
          category: "scope",
        },
      ),
    ).toMatchObject({ ok: false, code: "supersession_conflict" });
  });

  it("rejects occupied decision keys and preserves successor lineage", () => {
    const proposed = { ...state(), decisions: [decision("proposed")] };
    expect(
      validateDecisionCommandV1(proposed, {
        type: "confirm_decision",
        decisionId,
        decisionKey: "STACK",
      }),
    ).toEqual({ ok: true });
    expect(
      validateDecisionCommandV1(state(), {
        type: "supersede_decision",
        predecessorId: decisionId,
        decision: "New",
      }),
    ).toEqual({ ok: true });
    expect(
      validateDecisionCommandV1(state(), {
        type: "confirm_decision",
        decisionId,
        decisionKey: "invalid key",
      }),
    ).toMatchObject({ ok: false, code: "entity_state_conflict" });

    const predecessor = decision();
    const revision = {
      ...decision("proposed"),
      id: "55555555-5555-4555-8555-555555555555",
      decisionKey: "other",
      supersedesDecisionId: predecessor.id,
    };
    const revisionState = { ...state(), decisions: [predecessor, revision] };
    expect(
      validateDecisionCommandV1(revisionState, {
        type: "confirm_decision",
        decisionId: revision.id,
        decisionKey: " STACK ",
      }),
    ).toEqual({ ok: true });
    const branched = { ...revision, id: "66666666-6666-4666-8666-666666666666" };
    expect(
      validateDecisionCommandV1(
        { ...state(), decisions: [predecessor, revision, branched] },
        {
          type: "confirm_decision",
          decisionId: revision.id,
          decisionKey: "stack",
        },
      ),
    ).toMatchObject({ ok: false, code: "supersession_conflict" });
  });

  it("keeps milestone suggested and confirmed status separate", () => {
    expect(
      validateMilestoneCommandV1(state(), {
        type: "confirm_milestone_status",
        milestoneId,
        status: "completed",
      }),
    ).toEqual({ ok: true });
    expect(
      validateMilestoneCommandV1(state(), { type: "set_active_milestone", milestoneId: null }),
    ).toEqual({ ok: true });
    expect(
      validateMilestoneCommandV1(state(), {
        type: "set_active_milestone",
        milestoneId: "55555555-5555-4555-8555-555555555555",
      }),
    ).toMatchObject({ ok: false, code: "entity_not_found" });
  });

  it("applies confirmation/rejection matrices to every entity status and project ownership", () => {
    const statuses = ["proposed", "confirmed", "rejected", "superseded"] as const;
    for (const status of statuses) {
      const candidate = {
        ...state(),
        requirements: [requirement(status)],
        decisions: [decision(status)],
      };
      const requirementConfirmation = validateRequirementCommandV1(candidate, {
        type: "confirm_requirement",
        requirementId,
        category: "scope",
      });
      const requirementRejection = validateRequirementCommandV1(candidate, {
        type: "reject_requirement",
        requirementId,
      });
      expect(requirementConfirmation.ok).toBe(status === "proposed");
      expect(requirementRejection.ok).toBe(status === "proposed");
      const decisionConfirmation = validateDecisionCommandV1(candidate, {
        type: "confirm_decision",
        decisionId,
        decisionKey: "stack",
      });
      const decisionRejection = validateDecisionCommandV1(candidate, {
        type: "reject_decision",
        decisionId,
      });
      expect(decisionConfirmation.ok).toBe(status === "proposed");
      expect(decisionRejection.ok).toBe(status === "proposed");
    }
    expect(
      validateRequirementCommandV1(
        {
          ...state(),
          requirements: [
            { ...requirement("proposed"), projectId: "99999999-9999-4999-8999-999999999999" },
          ],
        },
        { type: "confirm_requirement", requirementId, category: "scope" },
      ),
    ).toMatchObject({ ok: false, code: "entity_not_found" });
    expect(
      validateDecisionCommandV1(
        {
          ...state(),
          decisions: [
            { ...decision("proposed"), projectId: "99999999-9999-4999-8999-999999999999" },
          ],
        },
        { type: "reject_decision", decisionId },
      ),
    ).toMatchObject({ ok: false, code: "entity_not_found" });
  });
});
