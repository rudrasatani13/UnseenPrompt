import { describe, expect, it } from "vitest";

import {
  COMPOSER_DRAFT_COMMAND_SCHEMA,
  DISCOVERY_COMMAND_SCHEMA,
  DiscoveryDomainError,
} from "./contracts";
import {
  composerDraftSchema,
  composerDraftCommandEnvelopeSchema,
  discoveryCommandEnvelopeSchema,
  discoveryAnswerSchema,
  discoveryQuestionSchema,
  discoverySessionSchema,
  parseDiscoveryCommandV1,
  serializeCanonicalJsonV1,
  containsPrototypeKey,
} from "./schemas";
import { questionFingerprintV1 } from "./policy";

const draftId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const generationRunId = "44444444-4444-4444-8444-444444444444";
const questionId = "55555555-5555-4555-8555-555555555555";
const eventId = "66666666-6666-4666-8666-666666666666";
const createdAt = "2026-01-01T00:00:00.000Z";

function validQuestion(overrides: Record<string, unknown> = {}) {
  const questionText = "Who will use this?";
  return {
    id: questionId,
    projectId,
    sessionId,
    generationRunId,
    position: 1,
    targetFactKey: "audience",
    basisStateVersion: 1,
    questionText,
    rationale: "The audience determines the first workflow.",
    suggestedAnswers: [],
    allowsFreeText: true,
    questionFingerprint: questionFingerprintV1(questionText),
    status: "active",
    createdAt,
    answeredAt: null,
    supersededAt: null,
    ...overrides,
  };
}

describe("discovery schemas", () => {
  it("accepts strict versioned commands and rejects unknown/prototype-shaped keys", () => {
    expect(
      composerDraftCommandEnvelopeSchema.safeParse({
        schema: COMPOSER_DRAFT_COMMAND_SCHEMA,
        schemaVersion: 1,
        draftId,
        expectedVersion: 1,
        idempotencyKey: "intent-1",
        command: {
          type: "confirm_and_promote",
          confirmedMode: "new_build",
          confirmedTitle: "Build",
        },
      }).success,
    ).toBe(true);
    expect(
      discoveryCommandEnvelopeSchema.safeParse({
        schema: DISCOVERY_COMMAND_SCHEMA,
        schemaVersion: 1,
        projectId,
        expectedStateVersion: 1,
        idempotencyKey: "advance-1",
        command: { type: "advance_discovery", extra: true },
      }).success,
    ).toBe(false);
    expect(
      discoveryCommandEnvelopeSchema.safeParse(
        JSON.parse(
          `{"schema":"${DISCOVERY_COMMAND_SCHEMA}","schemaVersion":1,"projectId":"${projectId}","expectedStateVersion":1,"idempotencyKey":"x","command":{"type":"advance_discovery","constructor":1}}`,
        ),
      ).success,
    ).toBe(false);
  });

  it("counts UTF-8 bytes and maps parse failures to safe domain errors", () => {
    const valid = {
      schema: DISCOVERY_COMMAND_SCHEMA,
      schemaVersion: 1,
      projectId,
      expectedStateVersion: 1,
      idempotencyKey: "é".repeat(127),
      command: { type: "advance_discovery" },
    };
    expect(discoveryCommandEnvelopeSchema.safeParse(valid).success).toBe(true);
    expect(
      discoveryCommandEnvelopeSchema.safeParse({ ...valid, idempotencyKey: "é".repeat(128) })
        .success,
    ).toBe(false);
    expect(() => parseDiscoveryCommandV1({ ...valid, projectId: "not-an-id" })).toThrowError(
      new DiscoveryDomainError("validation_failed"),
    );
  });

  it("preserves validated user text and rejects invalid Unicode or sparse canonical arrays", () => {
    const initialRequestText = "  Build a notes app  \n";
    const parsedDraft = composerDraftSchema.safeParse({
      id: draftId,
      ownerId: projectId,
      version: 1,
      initialRequestText,
      status: "routing",
      detectedMode: null,
      confidence: null,
      rationale: null,
      detectedLanguage: null,
      intentGenerationRunId: null,
      confirmedMode: null,
      confirmedTitle: null,
      projectId: null,
      lastErrorCode: null,
      createdAt,
      updatedAt: createdAt,
      promotedAt: null,
      abandonedAt: null,
    });
    expect(parsedDraft.success).toBe(true);
    if (parsedDraft.success) expect(parsedDraft.data.initialRequestText).toBe(initialRequestText);
    expect(
      composerDraftSchema.safeParse({
        id: draftId,
        ownerId: projectId,
        version: 1,
        initialRequestText: "bad\ud800",
        status: "routing",
        detectedMode: null,
        confidence: null,
        rationale: null,
        detectedLanguage: null,
        intentGenerationRunId: null,
        confirmedMode: null,
        confirmedTitle: null,
        projectId: null,
        lastErrorCode: null,
        createdAt,
        updatedAt: createdAt,
        promotedAt: null,
        abandonedAt: null,
      }).success,
    ).toBe(false);

    const sparse: unknown[] = [];
    sparse.length = 2;
    sparse[1] = "value";
    expect(() => serializeCanonicalJsonV1(sparse)).toThrowError(
      new DiscoveryDomainError("validation_failed"),
    );
    const customArray: unknown[] = [];
    Object.setPrototypeOf(customArray, { compromised: true });
    expect(containsPrototypeKey(customArray)).toBe(true);
  });

  it("enforces lifecycle relationships and binds fingerprints to question text", () => {
    const promotedDraft = composerDraftSchema.safeParse({
      id: draftId,
      ownerId: projectId,
      version: 1,
      initialRequestText: "Build",
      status: "promoted",
      detectedMode: null,
      confidence: null,
      rationale: null,
      detectedLanguage: null,
      intentGenerationRunId: null,
      confirmedMode: null,
      confirmedTitle: null,
      projectId: null,
      lastErrorCode: null,
      createdAt,
      updatedAt: createdAt,
      promotedAt: null,
      abandonedAt: null,
    });
    expect(promotedDraft.success).toBe(false);
    expect(
      discoverySessionSchema.safeParse({
        id: sessionId,
        projectId,
        sourceDraftId: draftId,
        status: "blocked",
        policyVersion: 1,
        activeQuestionId: null,
        latestAssessmentId: null,
        confirmedTurnCount: 1,
        blockCode: null,
        startedAt: createdAt,
        completedAt: null,
        abandonedAt: null,
      }).success,
    ).toBe(false);
    expect(
      discoveryQuestionSchema.safeParse(validQuestion({ questionFingerprint: "a".repeat(64) }))
        .success,
    ).toBe(false);
    expect(discoveryQuestionSchema.safeParse(validQuestion()).success).toBe(true);
    expect(
      discoveryAnswerSchema.safeParse({
        id: questionId,
        projectId,
        sessionId,
        questionId,
        source: "free_text",
        answerText: "  Exact answer  ",
        status: "confirmed",
        supersedesAnswerId: null,
        confirmationEventId: eventId,
        createdAt,
        supersededAt: createdAt,
      }).success,
    ).toBe(false);
  });
});
