import { describe, expect, it } from "vitest";

import type { ProjectStateV1 } from "./contracts";
import { detectProjectContradictions } from "./contradictions";

const projectId = "11111111-1111-4111-8111-111111111111";
const decisionId = "33333333-3333-4333-8333-333333333333";

const baseState: ProjectStateV1 = {
  projection: {
    id: projectId,
    mode: "new_build",
    stage: "brief_confirmation",
    stateVersion: 3,
    selectedTool: "codex",
    activeMilestoneId: null,
    blockerSummary: null,
    blockedFromStage: null,
    archivedFromStage: null,
    archivedAt: null,
  },
  requirements: [],
  decisions: [
    {
      id: decisionId,
      projectId,
      decisionKey: "stack",
      decision: "Codex",
      rationale: null,
      status: "confirmed",
      sourceEventId: null,
      supersedesDecisionId: null,
      confirmedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  milestones: [],
  summaries: [],
};
const confirmedDecision = baseState.decisions[0]!;

describe("deterministic project contradiction classification", () => {
  it("classifies stale state before proposal details", () => {
    const result = detectProjectContradictions({
      state: baseState,
      expectedStateVersion: 2,
      proposal: {
        summary: "proposal",
        requirementProposals: [],
        decisionProposals: [],
        milestoneProposals: [],
        unresolvedConflicts: ["model prose is not deterministic truth"],
      },
    });
    expect(result).toEqual([{ kind: "stale_state", code: "stale_state_version" }]);
  });

  it("detects active decision-key conflicts without interpreting natural language", () => {
    const result = detectProjectContradictions({
      state: {
        ...baseState,
        decisions: [
          ...baseState.decisions,
          {
            ...confirmedDecision,
            id: "55555555-5555-4555-8555-555555555555",
            decisionKey: "other",
            status: "proposed",
            confirmedAt: null,
          },
        ],
      },
      expectedStateVersion: 3,
      command: {
        type: "confirm_decision",
        decisionId: "55555555-5555-4555-8555-555555555555",
        decisionKey: " STACK ",
      },
    });
    expect(result).toMatchObject([
      { kind: "decision_key_conflict", code: "decision_key_conflict" },
    ]);
  });

  it("classifies invalid transition and references deterministically", () => {
    expect(
      detectProjectContradictions({
        state: baseState,
        expectedStateVersion: 3,
        command: { type: "transition_stage", to: "completed" },
      }),
    ).toMatchObject([{ kind: "incompatible_transition", code: "invalid_transition" }]);
    expect(
      detectProjectContradictions({
        state: baseState,
        expectedStateVersion: 3,
        proposal: {
          summary: "x",
          requirementProposals: [],
          decisionProposals: [],
          milestoneProposals: [
            { action: "revise", reference: decisionId, title: "x", rationale: "x" },
          ],
          unresolvedConflicts: [],
        },
      }),
    ).toMatchObject([{ kind: "milestone_reference_conflict", code: "proposal_conflict" }]);
    expect(
      detectProjectContradictions({
        state: baseState,
        expectedStateVersion: 3,
        proposal: {
          summary: "x",
          requirementProposals: [
            { action: "remove", reference: decisionId, statement: "x", rationale: "x" },
          ],
          decisionProposals: [],
          milestoneProposals: [],
          unresolvedConflicts: [],
        },
      }),
    ).toMatchObject([{ kind: "requirement_reference_conflict", code: "proposal_conflict" }]);
    expect(
      detectProjectContradictions({
        state: baseState,
        expectedStateVersion: 3,
        proposal: {
          summary: "x",
          requirementProposals: [],
          decisionProposals: [],
          milestoneProposals: [],
          unresolvedConflicts: ["untrusted model text"],
        },
      }),
    ).toMatchObject([{ code: "proposal_conflict" }]);
  });
});
