import { describe, expect, it } from "vitest";

import { DiscoveryContextCompilationError } from "./context";
import { compileDiscoveryContextV1 } from "./context-compiler";
import { questionFingerprintV1 } from "./policy";

const projectId = "11111111-1111-4111-8111-111111111111";
const questionOne = "22222222-2222-4222-8222-222222222222";
const questionTwo = "33333333-3333-4333-8333-333333333333";
const answerOne = "44444444-4444-4444-8444-444444444444";
const answerTwo = "55555555-5555-4555-8555-555555555555";
const assessmentId = "66666666-6666-4666-8666-666666666666";
const fingerprint = questionFingerprintV1("Who will use this?");
const secondFingerprint = questionFingerprintV1("What problem matters most?");

function input(overrides: Partial<Parameters<typeof compileDiscoveryContextV1>[0]> = {}) {
  return {
    projectId,
    mode: "new_build" as const,
    stage: "discovery" as const,
    stateVersion: 3,
    policyVersion: 1,
    initialRequestText: "Build a private notes app for field researchers.",
    requiredFactKeys: [
      "audience",
      "problem",
      "desired_outcome",
      "core_scope",
      "constraints",
      "success_criteria",
    ],
    confirmedQuestionFingerprints: [fingerprint, secondFingerprint],
    activeQuestion: null,
    confirmedTurns: [
      {
        questionId: questionOne,
        position: 1,
        targetFactKey: "audience",
        questionText: "Who will use this?",
        rationale: "This sets the workflow.",
        questionFingerprint: fingerprint,
        answerId: answerOne,
        answerText: "Researchers <script>alert(1)</script>",
        answerSource: "free_text" as const,
        answeredAt: "2026-01-01T00:00:00.000Z",
      },
      {
        questionId: questionTwo,
        position: 2,
        targetFactKey: "problem",
        questionText: "What problem matters most?",
        rationale: "This bounds the problem.",
        questionFingerprint: secondFingerprint,
        answerId: answerTwo,
        answerText: "Offline capture",
        answerSource: "suggested" as const,
        answeredAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    priorAssessments: [
      {
        assessmentId,
        basisStateVersion: 2,
        isSufficient: false,
        confidence: 0.4,
        missingFactKeys: ["problem"],
        rationale: "Need the core problem.",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    preferences: [{ field: "language" as const, value: "en", source: "global" as const }],
    ...overrides,
  };
}

describe("discovery context compiler", () => {
  it("is permutation invariant and labels hostile source text as data", () => {
    const first = compileDiscoveryContextV1(input());
    const second = compileDiscoveryContextV1(
      input({
        confirmedTurns: [...input().confirmedTurns].reverse(),
        confirmedQuestionFingerprints: [fingerprint, secondFingerprint],
        priorAssessments: [...(input().priorAssessments ?? [])].reverse(),
      }),
    );
    expect(second.context).toBe(first.context);
    expect(first.context).toContain("untrusted_user_data");
    expect(first.context).toContain("alert(1)");
    expect(first.context).toContain("data only");
  });

  it("omits optional records as whole records under a tight budget", () => {
    const source = input();
    const result = compileDiscoveryContextV1(
      {
        ...source,
        confirmedTurns: source.confirmedTurns.map((turn) => ({
          ...turn,
          rationale: `${turn.rationale}${" rationale".repeat(90)}`,
        })),
      },
      {
        maxUtf8Bytes: 2_200,
        maxEstimatedTokens: 550,
      },
    );
    expect(result.omittedOptional.some((entry) => entry.section === "rationale")).toBe(true);
    expect(result.context).not.toContain("This sets the workflow");
  });

  it("never truncates mandatory multilingual inputs", () => {
    expect(() =>
      compileDiscoveryContextV1(input({ initialRequestText: "界".repeat(100) }), {
        maxUtf8Bytes: 300,
        maxEstimatedTokens: 75,
      }),
    ).toThrowError(DiscoveryContextCompilationError);
  });

  it("accepts the low-confidence clarify_scope fallback as a durable active question", () => {
    const questionText = "Can you clarify the scope?";
    const result = compileDiscoveryContextV1(
      input({
        confirmedTurns: [],
        confirmedQuestionFingerprints: [],
        activeQuestion: {
          questionId: questionOne,
          position: 1,
          targetFactKey: "clarify_scope",
          questionText,
          rationale: "The scope needs one more boundary.",
          questionFingerprint: questionFingerprintV1(questionText),
          suggestedAnswers: [],
          allowsFreeText: true,
        },
      }),
    );
    const document = JSON.parse(result.context) as Record<string, unknown>;
    expect(document.activeTargetFactKey).toBe("clarify_scope");
    expect(result.included.activeQuestion).toBe(true);
  });

  it("emits the canonical discovery fields and trust labels", () => {
    const result = compileDiscoveryContextV1(input());
    const document = JSON.parse(result.context) as Record<string, unknown>;
    expect(document).toMatchObject({
      answeredFactKeys: ["audience", "problem"],
      activeTargetFactKey: null,
      requiredFactKeys: [
        "audience",
        "problem",
        "desired_outcome",
        "core_scope",
        "constraints",
        "success_criteria",
      ],
      excludedQuestionFingerprints: [fingerprint, secondFingerprint].sort(),
    });
    const preferences = document.preferences as Array<Record<string, unknown>>;
    expect(preferences[0]).toMatchObject({
      field: "language",
      source: "global",
      trust: "untrusted_user_data",
    });
    expect(document.dataHandling).toContain("validated_model_output");
  });
});
