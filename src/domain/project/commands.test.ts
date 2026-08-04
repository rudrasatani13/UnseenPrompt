import { describe, expect, it } from "vitest";

import {
  canonicalizeProjectCommandTextV1,
  canonicalizeProjectCommandV1,
  normalizeDecisionKeyV1,
  parseProjectCommandV1,
  projectCommandEnvelopeSchema,
} from "./commands";
import type { ProjectCommandEnvelopeV1 } from "./contracts";

const projectId = "11111111-1111-4111-8111-111111111111";

function envelope(
  command: Record<string, unknown> = { type: "transition_stage", to: "brief_confirmation" },
): ProjectCommandEnvelopeV1 {
  return {
    schema: "unseenprompt.project-command",
    schemaVersion: 1,
    projectId,
    expectedStateVersion: 1,
    idempotencyKey: "stage-1",
    command,
  } as unknown as ProjectCommandEnvelopeV1;
}

describe("project command contracts", () => {
  it("accepts a strict versioned command envelope", () => {
    expect(parseProjectCommandV1(envelope())).toMatchObject({ schemaVersion: 1, projectId });
    expect(projectCommandEnvelopeSchema.safeParse(envelope({ type: "unknown" })).success).toBe(
      false,
    );
    expect(projectCommandEnvelopeSchema.safeParse({ ...envelope(), extra: true }).success).toBe(
      false,
    );
    expect(
      projectCommandEnvelopeSchema.safeParse(
        envelope({ type: "transition_stage", to: "bad", extra: 1 }),
      ).success,
    ).toBe(false);
  });

  it("normalizes only canonical ASCII decision keys", () => {
    expect(normalizeDecisionKeyV1("  Stack.Decision ")).toBe("stack.decision");
    expect(normalizeDecisionKeyV1("Å".replace("Å", "a"))).toBe("a");
    expect(() => normalizeDecisionKeyV1("stack/key")).toThrowError("validation_failed");
    expect(() => normalizeDecisionKeyV1("stack key")).toThrowError("validation_failed");
    expect(() => normalizeDecisionKeyV1("ümlaut")).toThrowError("validation_failed");
    expect(() => normalizeDecisionKeyV1("a".repeat(256))).toThrowError("validation_failed");
    const parsed = parseProjectCommandV1(
      envelope({
        type: "confirm_decision",
        decisionId: "33333333-3333-4333-8333-333333333333",
        decisionKey: " STACK ",
      }),
    );
    expect(parsed.command).toEqual({
      type: "confirm_decision",
      decisionId: "33333333-3333-4333-8333-333333333333",
      decisionKey: "stack",
    });
  });

  it("produces identical canonical bytes regardless of object insertion order", () => {
    const first = envelope({ type: "change_mode", mode: "feature" });
    const second = {
      command: { mode: "feature", type: "change_mode" },
      idempotencyKey: "stage-1",
      expectedStateVersion: 1,
      projectId,
      schemaVersion: 1,
      schema: "unseenprompt.project-command",
    } as unknown as ProjectCommandEnvelopeV1;
    expect([...canonicalizeProjectCommandV1(first)]).toEqual([
      ...canonicalizeProjectCommandV1(second),
    ]);
    expect(canonicalizeProjectCommandTextV1(first)).toBe(
      '{"command":{"mode":"feature","type":"change_mode"},"expectedStateVersion":1,"idempotencyKey":"stage-1","projectId":"11111111-1111-4111-8111-111111111111","schema":"unseenprompt.project-command","schemaVersion":1}',
    );
  });

  it("rejects non-finite numbers and prototype-shaped input", () => {
    expect(() =>
      canonicalizeProjectCommandV1(envelope({ type: "change_mode", mode: "feature" })),
    ).not.toThrow();
    expect(() =>
      canonicalizeProjectCommandV1({ ...envelope(), expectedStateVersion: Number.NaN } as never),
    ).toThrowError("validation_failed");
    expect(
      projectCommandEnvelopeSchema.safeParse(
        JSON.parse(
          '{"schema":"unseenprompt.project-command","schemaVersion":1,"projectId":"11111111-1111-4111-8111-111111111111","expectedStateVersion":1,"idempotencyKey":"x","command":{"type":"change_mode","mode":"feature","constructor":1}}',
        ),
      ).success,
    ).toBe(false);
  });

  it("parses every declared command variant and enforces byte/conditional bounds", () => {
    const variants: readonly Record<string, unknown>[] = [
      { type: "transition_stage", to: "brief_confirmation" },
      { type: "block_project", blockerSummary: "waiting" },
      { type: "unblock_project" },
      { type: "archive_project" },
      { type: "restore_project" },
      { type: "change_mode", mode: "bug" },
      { type: "set_active_milestone", milestoneId: null },
      {
        type: "confirm_requirement",
        requirementId: "22222222-2222-4222-8222-222222222222",
        category: "scope",
      },
      { type: "reject_requirement", requirementId: "22222222-2222-4222-8222-222222222222" },
      {
        type: "supersede_requirement",
        predecessorId: "22222222-2222-4222-8222-222222222222",
        category: "scope",
        statement: "new",
      },
      {
        type: "confirm_decision",
        decisionId: "33333333-3333-4333-8333-333333333333",
        decisionKey: "stack",
      },
      { type: "reject_decision", decisionId: "33333333-3333-4333-8333-333333333333" },
      {
        type: "supersede_decision",
        predecessorId: "33333333-3333-4333-8333-333333333333",
        decision: "new",
      },
      {
        type: "confirm_milestone_status",
        milestoneId: "44444444-4444-4444-8444-444444444444",
        status: "completed",
      },
      { type: "replace_summary", summaryKind: "brief", summaryText: "summary" },
    ];
    for (const command of variants)
      expect(parseProjectCommandV1(envelope(command)).command.type).toBe(command.type);
    expect(
      projectCommandEnvelopeSchema.safeParse(
        envelope({
          type: "confirm_milestone_status",
          milestoneId: "44444444-4444-4444-8444-444444444444",
          status: "completed",
          blockedReason: "not allowed",
        }),
      ).success,
    ).toBe(false);
    expect(
      projectCommandEnvelopeSchema.safeParse(
        envelope({
          type: "confirm_milestone_status",
          milestoneId: "44444444-4444-4444-8444-444444444444",
          status: "blocked",
        }),
      ).success,
    ).toBe(false);
    expect(
      projectCommandEnvelopeSchema.safeParse(
        envelope({ type: "block_project", blockerSummary: "é".repeat(16_385) }),
      ).success,
    ).toBe(false);
  });
});
