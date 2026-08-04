import { describe, expect, it } from "vitest";

import { compileProjectContextV1 } from "./context-compiler";
import {
  DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS,
  DEFAULT_CONTEXT_MAX_UTF8_BYTES,
  parseCompiledProjectContextV1,
  type ProjectContextInputV1,
} from "./context";

const projectId = "11111111-1111-4111-8111-111111111111";
const requirementA = "22222222-2222-4222-8222-222222222222";
const requirementB = "33333333-3333-4333-8333-333333333333";
const decisionA = "44444444-4444-4444-8444-444444444444";
const decisionB = "55555555-5555-4555-8555-555555555555";
const requirementSourceEventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const decisionSourceEventId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function requirement(
  id: string,
  category: string,
  statement: string,
  confirmedAt: string,
  status: "confirmed" | "superseded" = "confirmed",
) {
  return {
    id,
    projectId,
    category,
    statement,
    rationale: "because",
    status,
    sourceEventId: requirementSourceEventId,
    supersedesRequirementId: null,
    confirmedAt: status === "confirmed" ? confirmedAt : null,
    createdAt: confirmedAt,
    updatedAt: confirmedAt,
  } as const;
}

function decision(
  id: string,
  decisionKey: string,
  text: string,
  confirmedAt: string,
  status: "confirmed" | "superseded" = "confirmed",
) {
  return {
    id,
    projectId,
    decisionKey,
    decision: text,
    rationale: null,
    status,
    sourceEventId: decisionSourceEventId,
    supersedesDecisionId: null,
    confirmedAt: status === "confirmed" ? confirmedAt : null,
    createdAt: confirmedAt,
    updatedAt: confirmedAt,
  } as const;
}

function milestone() {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    projectId,
    position: 1,
    title: "Ship the first slice",
    description: "A confirmed milestone",
    suggestedStatus: "in_progress" as const,
    confirmedStatus: "in_progress" as const,
    confirmationEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    blockedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

function seededShuffle<T>(values: readonly T[], seed: number): T[] {
  const output = [...values];
  let state = seed >>> 0;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const swap = state % (index + 1);
    [output[index], output[swap]] = [output[swap]!, output[index]!];
  }
  return output;
}

function baseInput(overrides: Partial<ProjectContextInputV1> = {}): ProjectContextInputV1 {
  return {
    projectId,
    mode: "new_build",
    stage: "result_review",
    stateVersion: 4,
    selectedTool: "codex",
    blockerSummary: null,
    requirements: [
      requirement(requirementB, "User Experience", "second", "2026-01-02T00:00:00.000Z"),
    ],
    decisions: [decision(decisionB, "stack", "Next.js", "2026-01-02T00:00:00.000Z")],
    activeMilestone: null,
    effectivePreferences: {
      skillLevel: { value: "beginner", source: "global" },
      preferredStackBehavior: { value: "prefer_saved", source: "global" },
      preferredStack: { value: { frontend: "Next.js" }, source: "project" },
      codingStyle: { value: { testing: "test_first" }, source: "global" },
      deploymentPreference: { value: null, source: "global" },
    },
    summaries: [],
    recentEvidence: [],
    ...overrides,
  };
}

function contextDocument(
  result: ReturnType<typeof compileProjectContextV1>,
): Record<string, unknown> {
  return JSON.parse(result.context) as Record<string, unknown>;
}

describe("deterministic Context Compiler", () => {
  it("orders every section independently of deterministic seeded permutations", () => {
    const requirements = [
      requirement(requirementB, "UX", "B", "2026-01-02T00:00:00.000Z"),
      requirement(requirementA, "Architecture", "A", "2026-01-03T00:00:00.000Z"),
      requirement(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "Legacy",
        "superseded",
        "2026-01-01T00:00:00.000Z",
        "superseded",
      ),
    ];
    const decisions = [
      decision(decisionB, "z-key", "Z", "2026-01-01T00:00:00.000Z"),
      decision(decisionA, "a-key", "A", "2026-01-03T00:00:00.000Z"),
      decision(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "legacy",
        "superseded",
        "2026-01-01T00:00:00.000Z",
        "superseded",
      ),
    ];
    const summaries = [
      {
        id: "77777777-7777-4777-8777-777777777777",
        projectId,
        summaryKind: "brief",
        version: 1,
        basedOnEventSequence: 4,
        summaryText: "brief",
        structuredFacts: {},
        status: "current" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        projectId,
        summaryKind: "architecture",
        version: 2,
        basedOnEventSequence: 3,
        summaryText: "architecture",
        structuredFacts: {},
        status: "current" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "99999999-9999-4999-8999-999999999999",
        projectId,
        summaryKind: "old",
        version: 1,
        basedOnEventSequence: 4,
        summaryText: "superseded",
        structuredFacts: {},
        status: "superseded" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const evidence = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        kind: "test",
        summary: "evidence A",
        occurredAt: "2026-01-02T00:00:00.000Z",
        evidenceLabel: null,
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        kind: "test",
        summary: "evidence B",
        occurredAt: "2026-01-02T00:00:00.000Z",
        evidenceLabel: null,
      },
    ];
    const canonical = baseInput({ requirements, decisions, summaries, recentEvidence: evidence });
    const expected = compileProjectContextV1(canonical);
    for (const seed of [1, 2, 3, 17, 991]) {
      const result = compileProjectContextV1({
        ...canonical,
        requirements: seededShuffle(requirements, seed),
        decisions: seededShuffle(decisions, seed + 1),
        summaries: seededShuffle(summaries, seed + 2),
        recentEvidence: seededShuffle(evidence, seed + 3),
      });
      expect(result).toEqual(expected);
    }
    const document = contextDocument(expected);
    expect((document.requirements as Array<{ id: string }>).map((row) => row.id)).toEqual([
      requirementA,
      requirementB,
    ]);
    expect((document.decisions as Array<{ id: string }>).map((row) => row.id)).toEqual([
      decisionA,
      decisionB,
    ]);
  });

  it("normalizes CRLF and reports exact UTF-8 bytes with the named estimate", () => {
    const result = compileProjectContextV1(
      baseInput({ stage: "blocked", blockerSummary: "line 1\r\nline 2 🚀é" }),
    );
    const document = contextDocument(result);
    expect(document.blockerSummary).toBe("line 1\nline 2 🚀é");
    expect(result.utf8Bytes).toBe(new TextEncoder().encode(result.context).byteLength);
    expect(result.estimatedTokens).toBe(Math.ceil(result.utf8Bytes / 4));
    expect(result.estimator).toBe("utf8_bytes_divided_by_4_ceiling_v1");
  });

  it("accepts an exact boundary and rejects one byte below it", () => {
    const baseline = compileProjectContextV1(baseInput({ effectivePreferences: null }));
    expect(
      compileProjectContextV1(baseInput({ effectivePreferences: null }), {
        maxUtf8Bytes: baseline.utf8Bytes,
        maxEstimatedTokens: DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS,
      }).utf8Bytes,
    ).toBe(baseline.utf8Bytes);
    expect(() =>
      compileProjectContextV1(baseInput({ effectivePreferences: null }), {
        maxUtf8Bytes: baseline.utf8Bytes - 1,
        maxEstimatedTokens: DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS,
      }),
    ).toThrowError(expect.objectContaining({ code: "confirmed_invariants_exceed_budget" }));
  });

  it("retains mandatory invariants and fails with safe numeric overflow details", () => {
    expect(() =>
      compileProjectContextV1(baseInput({ effectivePreferences: null }), {
        maxUtf8Bytes: 1,
        maxEstimatedTokens: 1,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "confirmed_invariants_exceed_budget",
        details: expect.objectContaining({
          maxUtf8Bytes: 1,
          maxEstimatedTokens: 1,
          requiredUtf8Bytes: expect.any(Number),
          requiredEstimatedTokens: expect.any(Number),
        }),
      }),
    );
  });

  it("retains the complete active milestone and blocker as mandatory sections", () => {
    const activeMilestone = milestone();
    const input = baseInput({
      stage: "blocked",
      effectivePreferences: null,
      activeMilestone,
      blockerSummary: "blocked on user confirmation",
      requirements: [
        requirement(requirementA, "Core", "confirmed requirement", "2026-01-01T00:00:00.000Z"),
        requirement(
          requirementB,
          "Old",
          "superseded requirement",
          "2026-01-01T00:00:00.000Z",
          "superseded",
        ),
      ],
      decisions: [
        decision(decisionA, "core", "confirmed decision", "2026-01-01T00:00:00.000Z"),
        decision(decisionB, "old", "superseded decision", "2026-01-01T00:00:00.000Z", "superseded"),
      ],
    });
    const result = compileProjectContextV1(input);
    const document = contextDocument(result);
    expect(document.activeMilestone).toMatchObject({
      id: activeMilestone.id,
      title: activeMilestone.title,
      description: activeMilestone.description,
      suggestedStatus: activeMilestone.suggestedStatus,
      confirmedStatus: activeMilestone.confirmedStatus,
    });
    expect(document.blockerSummary).toBe("blocked on user confirmation");
    expect((document.requirements as Array<{ id: string }>).map((row) => row.id)).toEqual([
      requirementA,
    ]);
    expect((document.decisions as Array<{ id: string }>).map((row) => row.id)).toEqual([decisionA]);

    expect(() =>
      compileProjectContextV1(input, {
        maxUtf8Bytes: result.utf8Bytes - 1,
        maxEstimatedTokens: DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS,
      }),
    ).toThrowError(expect.objectContaining({ code: "confirmed_invariants_exceed_budget" }));
  });

  it("selects optional whole records and reports deterministic omission selectors", () => {
    const mandatory = compileProjectContextV1(baseInput({ effectivePreferences: null }));
    const result = compileProjectContextV1(
      baseInput({
        summaries: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            projectId,
            summaryKind: "brief",
            version: 1,
            basedOnEventSequence: 4,
            summaryText: `optional summary ${"SENTINEL_SUMMARY ".repeat(2_000)}`,
            structuredFacts: { ok: true },
            status: "current",
            createdAt: "2026-01-04T00:00:00.000Z",
          },
        ],
        recentEvidence: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            kind: "return",
            summary: `optional evidence ${"SENTINEL_EVIDENCE ".repeat(2_000)}`,
            occurredAt: "2026-01-04T00:00:00.000Z",
            evidenceLabel: null,
          },
        ],
      }),
      {
        maxUtf8Bytes: mandatory.utf8Bytes,
        maxEstimatedTokens: DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS,
      },
    );

    expect(result.included.preferenceFields).toEqual([]);
    expect(result.included.summaryIds).toEqual([]);
    expect(
      result.omittedOptional.some(
        (item) => item.selector === "preference:skillLevel" && item.reason === "budget_exceeded",
      ),
    ).toBe(true);
    expect(
      result.omittedOptional.some(
        (item) => item.selector.startsWith("summary:") && item.reason === "budget_exceeded",
      ),
    ).toBe(true);
    expect(contextDocument(result).summaries).toEqual([]);
    expect(result.context).not.toContain("SENTINEL_SUMMARY");
    expect(result.context).not.toContain("SENTINEL_EVIDENCE");
  });

  it("preserves preference provenance and excludes stale/non-current summaries", () => {
    const staleId = "77777777-7777-4777-8777-777777777777";
    const futureId = "88888888-8888-4888-8888-888888888888";
    const supersededId = "99999999-9999-4999-8999-999999999999";
    const result = compileProjectContextV1(
      baseInput({
        summaries: [
          {
            id: staleId,
            projectId,
            summaryKind: "brief",
            version: 1,
            basedOnEventSequence: 2,
            summaryText: "stale but current",
            structuredFacts: {},
            status: "current",
            createdAt: "2026-01-02T00:00:00.000Z",
          },
          {
            id: futureId,
            projectId,
            summaryKind: "future",
            version: 1,
            basedOnEventSequence: 5,
            summaryText: "not eligible",
            structuredFacts: {},
            status: "current",
            createdAt: "2026-01-02T00:00:00.000Z",
          },
          {
            id: supersededId,
            projectId,
            summaryKind: "old",
            version: 2,
            basedOnEventSequence: 4,
            summaryText: "not current",
            structuredFacts: {},
            status: "superseded",
            createdAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      }),
    );
    const document = contextDocument(result);
    expect(
      (document.preferences as Record<string, { value: unknown; source: string }>).preferredStack,
    ).toEqual({
      value: { frontend: "Next.js" },
      source: "project",
    });
    expect((document.summaries as Array<{ id: string }>).map((row) => row.id)).toEqual([staleId]);
    expect(result.summaryBoundary).toEqual({
      inputCount: 3,
      currentCount: 2,
      eligibleCount: 1,
      maxBasedOnEventSequence: 4,
    });
    expect(result.omittedOptional).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: `summary:${futureId}:future`,
          reason: "future_state_version",
        }),
        expect.objectContaining({ selector: `summary:${supersededId}:old`, reason: "not_current" }),
      ]),
    );
  });

  it("fails closed for duplicate current summary kinds and cross-project rows", () => {
    const summary = {
      id: "77777777-7777-4777-8777-777777777777",
      projectId,
      summaryKind: "brief",
      version: 1,
      basedOnEventSequence: 4,
      summaryText: "brief",
      structuredFacts: {},
      status: "current" as const,
      createdAt: "2026-01-02T00:00:00.000Z",
    };
    expect(() =>
      compileProjectContextV1(
        baseInput({
          summaries: [summary, { ...summary, id: "88888888-8888-4888-8888-888888888888" }],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() =>
      compileProjectContextV1(
        baseInput({
          requirements: [
            requirement(requirementA, "Core", "cross project", "2026-01-01T00:00:00.000Z"),
          ].map((row) => ({ ...row, projectId: "99999999-9999-4999-8999-999999999999" })),
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));
  });

  it("rejects current summary kinds that differ only by line endings", () => {
    const summary = {
      id: "77777777-7777-4777-8777-777777777777",
      projectId,
      summaryKind: "state\r\nbrief",
      version: 1,
      basedOnEventSequence: 4,
      summaryText: "summary",
      structuredFacts: {},
      status: "current" as const,
      createdAt: "2026-01-02T00:00:00.000Z",
    };
    expect(() =>
      compileProjectContextV1(
        baseInput({
          summaries: [
            summary,
            { ...summary, id: "88888888-8888-4888-8888-888888888888", summaryKind: "state\nbrief" },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));
  });

  it("rejects case-variant duplicate UUIDs and orders distinct UUID casing deterministically", () => {
    const duplicateUpper = requirement(
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      "Core",
      "duplicate",
      "2026-01-01T00:00:00.000Z",
    );
    const duplicateLower = requirement(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "Core",
      "duplicate",
      "2026-01-01T00:00:00.000Z",
    );
    expect(() =>
      compileProjectContextV1(baseInput({ requirements: [duplicateUpper, duplicateLower] })),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));

    const first = requirement(
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      "Core",
      "first",
      "2026-01-01T00:00:00.000Z",
    );
    const second = requirement(
      "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB",
      "Core",
      "second",
      "2026-01-01T00:00:00.000Z",
    );
    const canonical = compileProjectContextV1(baseInput({ requirements: [second, first] }));
    const permuted = compileProjectContextV1(baseInput({ requirements: [first, second] }));
    expect(permuted).toEqual(canonical);
  });

  it("fails closed for lineage, decision-key, blocker, and milestone invariant violations", () => {
    expect(() =>
      compileProjectContextV1(
        baseInput({
          requirements: [
            {
              ...requirement(
                requirementA,
                "Core",
                "missing predecessor",
                "2026-01-01T00:00:00.000Z",
              ),
              supersedesRequirementId: requirementB,
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));

    expect(() =>
      compileProjectContextV1(
        baseInput({
          requirements: [
            requirement(requirementA, "Core", "root", "2026-01-01T00:00:00.000Z"),
            {
              ...requirement(requirementB, "Core", "branch one", "2026-01-02T00:00:00.000Z"),
              supersedesRequirementId: requirementA,
            },
            {
              ...requirement(
                "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "Core",
                "branch two",
                "2026-01-03T00:00:00.000Z",
              ),
              supersedesRequirementId: requirementA,
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));

    expect(() =>
      compileProjectContextV1(
        baseInput({
          requirements: [
            {
              ...requirement(requirementA, "Core", "cycle one", "2026-01-01T00:00:00.000Z"),
              supersedesRequirementId: requirementB,
            },
            {
              ...requirement(requirementB, "Core", "cycle two", "2026-01-02T00:00:00.000Z"),
              supersedesRequirementId: requirementA,
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));

    expect(() =>
      compileProjectContextV1(
        baseInput({
          decisions: [
            decision(decisionA, "stack", "first", "2026-01-01T00:00:00.000Z"),
            decision(decisionB, "STACK", "second", "2026-01-02T00:00:00.000Z"),
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));

    expect(() =>
      compileProjectContextV1(baseInput({ stage: "discovery", blockerSummary: "unexpected" })),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));

    expect(() =>
      compileProjectContextV1(
        baseInput({
          activeMilestone: { ...milestone(), confirmedStatus: "blocked", blockedReason: null },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));
  });

  it("rejects database-invalid milestone, summary, facts, and confirmation shapes", () => {
    expect(() =>
      compileProjectContextV1(baseInput({ activeMilestone: { ...milestone(), position: 0 } })),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() =>
      compileProjectContextV1(
        baseInput({ activeMilestone: { ...milestone(), title: "x".repeat(241) } }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() =>
      compileProjectContextV1(
        baseInput({
          summaries: [
            {
              id: "77777777-7777-4777-8777-777777777777",
              projectId,
              summaryKind: "brief",
              version: 1,
              basedOnEventSequence: 0,
              summaryText: "summary",
              structuredFacts: [],
              status: "current",
              createdAt: "2026-01-02T00:00:00.000Z",
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() =>
      compileProjectContextV1(
        baseInput({
          requirements: [
            {
              ...requirement(
                requirementA,
                "Core",
                "bad timestamp",
                "2026-01-01T00:00:00.000Z",
                "superseded",
              ),
              confirmedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));
  });

  it("requires provenance for confirmed requirements and decisions only", () => {
    expect(() =>
      compileProjectContextV1(
        baseInput({
          requirements: [
            {
              ...requirement(requirementA, "Core", "confirmed", "2026-01-01T00:00:00.000Z"),
              sourceEventId: null,
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() =>
      compileProjectContextV1(
        baseInput({
          decisions: [
            {
              ...decision(decisionA, "stack", "confirmed", "2026-01-01T00:00:00.000Z"),
              sourceEventId: null,
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));

    expect(() =>
      compileProjectContextV1(
        baseInput({
          requirements: [
            {
              ...requirement(
                requirementA,
                "Core",
                "superseded",
                "2026-01-01T00:00:00.000Z",
                "superseded",
              ),
              sourceEventId: null,
            },
          ],
          decisions: [
            {
              ...decision(
                decisionA,
                "stack",
                "superseded",
                "2026-01-01T00:00:00.000Z",
                "superseded",
              ),
              sourceEventId: null,
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("caps evidence at twenty entries and uses UUID order for timestamp ties", () => {
    const evidence = Array.from({ length: 21 }, (_, index) => ({
      id: `${String(index + 1).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      kind: "test",
      summary: `evidence ${index}`,
      occurredAt: "2026-01-01T00:00:00.000Z",
      evidenceLabel: null,
    }));
    const result = compileProjectContextV1(
      baseInput({ effectivePreferences: null, recentEvidence: evidence }),
    );
    const document = contextDocument(result);
    expect(document.recentEvidence as Array<{ id: string }>).toHaveLength(20);
    expect(result.evidenceBoundary).toEqual({ inputCount: 21, cappedCount: 20, cap: 20 });
    expect(result.omittedOptional).toContainEqual(
      expect.objectContaining({ id: evidence[20]!.id, reason: "evidence_cap" }),
    );
  });

  it("rejects unknown keys, hostile prototypes, and caller-enlarged budgets", () => {
    expect(() => compileProjectContextV1({ ...baseInput(), unknown: true } as never)).toThrowError(
      expect.objectContaining({ code: "validation_failed" }),
    );
    const hostile = JSON.parse('{"__proto__":{"polluted":true}}') as object;
    expect(() => compileProjectContextV1({ ...baseInput(), ...hostile } as never)).toThrowError(
      expect.objectContaining({ code: "validation_failed" }),
    );
    expect(() =>
      compileProjectContextV1(baseInput(), {
        maxUtf8Bytes: DEFAULT_CONTEXT_MAX_UTF8_BYTES + 1,
        maxEstimatedTokens: DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS,
      }),
    ).toThrowError(expect.objectContaining({ code: "context_budget_invalid" }));
  });

  it("validates compiled document shape, metadata bindings, limits, and omissions", () => {
    const compiled = compileProjectContextV1(baseInput());
    expect(parseCompiledProjectContextV1(compiled)).toEqual(compiled);

    const mandatory = compileProjectContextV1(baseInput({ effectivePreferences: null }));
    const omitted = compileProjectContextV1(
      baseInput({
        effectivePreferences: null,
        summaries: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            projectId,
            summaryKind: "oversized",
            version: 1,
            basedOnEventSequence: 4,
            summaryText: "x".repeat(60_000),
            structuredFacts: {},
            status: "current",
            createdAt: "2026-01-04T00:00:00.000Z",
          },
        ],
      }),
      {
        maxUtf8Bytes: mandatory.utf8Bytes,
        maxEstimatedTokens: DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS,
      },
    );
    expect(omitted.omittedOptional.length).toBeGreaterThan(0);
    expect(parseCompiledProjectContextV1(omitted)).toEqual(omitted);
    expect(() => parseCompiledProjectContextV1({ ...omitted, omittedOptional: [] })).toThrowError(
      expect.objectContaining({ code: "validation_failed" }),
    );

    expect(() =>
      parseCompiledProjectContextV1({
        ...compiled,
        context: "1",
        utf8Bytes: 1,
        estimatedTokens: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));

    expect(() =>
      parseCompiledProjectContextV1({
        ...compiled,
        included: { ...compiled.included, summaryIds: ["77777777-7777-4777-8777-777777777777"] },
      }),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));

    expect(() =>
      parseCompiledProjectContextV1({
        ...compiled,
        limits: {
          ...compiled.limits,
          maxUtf8Bytes: DEFAULT_CONTEXT_MAX_UTF8_BYTES + 1,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "validation_failed" }));
  });
});
