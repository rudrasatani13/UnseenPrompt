import { describe, expect, it, vi } from "vitest";

import {
  COMPOSER_DRAFT_COMMAND_SCHEMA,
  type ComposerDraftCommandEnvelopeV1,
  type DiscoverySnapshotV1,
} from "@/domain/discovery/contracts";
import type { IntentDetectionV1 } from "@/domain/model/contracts";
import type { ModelGateway } from "@/lib/model/gateway";
import type { ProjectStateRepository } from "@/lib/project/project-state-repository";

import { createDiscoveryService } from "./discovery-service";
import type { ComposerDraftCommandReceiptV1, DiscoveryRepository } from "./discovery-repository";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";
const QUESTION_ID = "66666666-6666-4666-8666-666666666666";
const DATE = "2026-08-01T00:00:00.000Z";
const intent: IntentDetectionV1 = {
  mode: "new_build",
  confidence: 0.9,
  rationale: "A new project request.",
  detectedLanguage: "en",
};

function snapshot(overrides: Partial<DiscoverySnapshotV1> = {}): DiscoverySnapshotV1 {
  return {
    projectId: PROJECT_ID,
    mode: "new_build",
    stage: "discovery",
    stateVersion: 3,
    session: {
      id: SESSION_ID,
      projectId: PROJECT_ID,
      sourceDraftId: DRAFT_ID,
      status: "active",
      policyVersion: 1,
      activeQuestionId: null,
      latestAssessmentId: null,
      confirmedTurnCount: 1,
      blockCode: null,
      startedAt: DATE,
      completedAt: null,
      abandonedAt: null,
    },
    initialRequestText: "Build a small tool.",
    confirmedQuestions: [],
    confirmedAnswers: [],
    assessments: [],
    activeQuestion: null,
    ...overrides,
  };
}

function repository(overrides: Partial<DiscoveryRepository> = {}): DiscoveryRepository {
  return {
    createComposerDraft: vi.fn(),
    executeComposerDraftCommand: vi.fn(),
    applyIntent: vi.fn(),
    getSnapshot: vi.fn(),
    applyAssessment: vi.fn(),
    applyQuestion: vi.fn(),
    executeDiscoveryCommand: vi.fn(),
    completeDiscovery: vi.fn(),
    ...overrides,
  } as DiscoveryRepository;
}

function gateway(response: unknown): ModelGateway {
  return {
    execute: vi.fn(async () => response),
  } as unknown as ModelGateway;
}

function projectRepository(): ProjectStateRepository {
  return {
    getSnapshot: vi.fn(),
    execute: vi.fn(),
    applyValidatedDelta: vi.fn(async () => ({
      projectId: PROJECT_ID,
      eventId: EVENT_ID,
      stateVersion: 4,
      replayed: false,
    })),
  };
}

describe("discovery service orchestration", () => {
  it("creates and applies intent, while replaying awaiting drafts without a provider call", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ draftId: DRAFT_ID, version: 1, status: "routing", replayed: false })
      .mockResolvedValueOnce({
        draftId: DRAFT_ID,
        version: 2,
        status: "awaiting_confirmation",
        replayed: true,
        intent,
      });
    const repo = repository({
      createComposerDraft: create,
      applyIntent: vi.fn(
        async () =>
          ({
            draftId: DRAFT_ID,
            version: 2,
            status: "awaiting_confirmation" as const,
            projectId: null,
            replayed: false,
          }) as ComposerDraftCommandReceiptV1,
      ),
    });
    const model = gateway({
      data: intent,
      metadata: { generationRunId: RUN_ID, projectStateVersion: 1, replayed: false },
    });
    const service = createDiscoveryService({
      repository: repo,
      gateway: model,
      projectStateRepository: projectRepository(),
    });

    const first = await service.createDraft({
      initialRequestText: "Build a tool.",
      idempotencyKey: "draft-key",
    });
    const replay = await service.createDraft({
      initialRequestText: "Build a tool.",
      idempotencyKey: "draft-key",
    });

    expect(first).toMatchObject({ draftId: DRAFT_ID, status: "awaiting_confirmation", intent });
    expect(replay).toMatchObject({ draftId: DRAFT_ID, status: "awaiting_confirmation", intent });
    expect(model.execute).toHaveBeenCalledTimes(1);
  });

  it("returns a persisted active question without a model call", async () => {
    const activeQuestion = {
      id: QUESTION_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      generationRunId: RUN_ID,
      position: 1,
      targetFactKey: "audience",
      basisStateVersion: 3,
      questionText: "Who is this for?",
      rationale: "Audience is needed.",
      suggestedAnswers: [],
      allowsFreeText: true,
      questionFingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: "active" as const,
      createdAt: DATE,
      answeredAt: null,
      supersededAt: null,
    };
    const repo = repository({
      getSnapshot: vi.fn(async () =>
        snapshot({
          activeQuestion,
          session: {
            ...snapshot().session,
            activeQuestionId: QUESTION_ID,
          },
        }),
      ),
    });
    const model = gateway({});
    const service = createDiscoveryService({
      repository: repo,
      gateway: model,
      projectStateRepository: projectRepository(),
    });

    const result = await service.advance({ projectId: PROJECT_ID, idempotencyKey: "advance-key" });

    expect(result.status).toBe("question");
    if (result.status !== "question") throw new Error("expected question result");
    expect(result.snapshot.activeQuestion?.id).toBe(QUESTION_ID);
    expect(model.execute).not.toHaveBeenCalled();
  });

  it("forwards request cancellation and deadline controls for retry intent", async () => {
    const executeComposerDraftCommand = vi.fn(async () => ({
      draftId: DRAFT_ID,
      version: 1,
      status: "routing" as const,
      projectId: null,
      replayed: false,
      initialRequestText: "Retry this intent.",
    }));
    const applyIntent = vi.fn(async () => ({
      draftId: DRAFT_ID,
      version: 2,
      status: "awaiting_confirmation" as const,
      projectId: null,
      replayed: false,
    }));
    const execute = vi.fn(async () => ({
      data: intent,
      metadata: { generationRunId: RUN_ID, projectStateVersion: 1, replayed: false },
    }));
    const repo = repository({ executeComposerDraftCommand, applyIntent });
    const service = createDiscoveryService({
      repository: repo,
      gateway: { execute } as unknown as ModelGateway,
      projectStateRepository: projectRepository(),
    });
    const envelope: ComposerDraftCommandEnvelopeV1 = {
      schema: COMPOSER_DRAFT_COMMAND_SCHEMA,
      schemaVersion: 1,
      draftId: DRAFT_ID,
      expectedVersion: 1,
      idempotencyKey: "retry-key",
      command: { type: "retry_intent" },
    };
    const signal = new AbortController().signal;

    await service.executeDraftCommand(envelope, { signal, deadlineMs: 30_000 });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "intent_detection",
        signal,
        deadlineMs: 30_000,
      }),
    );
  });

  it("uses discovery context and the applied state version for completion", async () => {
    const repo = repository({
      getSnapshot: vi.fn(async () =>
        snapshot({ session: { ...snapshot().session, status: "sufficient" } }),
      ),
      completeDiscovery: vi.fn(async (input) => {
        expect(input.expectedStateVersion).toBe(4);
        return { projectId: PROJECT_ID, stateVersion: 5, eventId: EVENT_ID, replayed: false };
      }),
    });
    const model = gateway({
      data: {
        summary: "English proposal.",
        requirementProposals: [
          {
            action: "add",
            reference: "req-1",
            statement: "The tool is usable.",
            rationale: "Scope.",
          },
        ],
        decisionProposals: [],
        milestoneProposals: [],
        unresolvedConflicts: [],
      },
      metadata: { generationRunId: RUN_ID, projectStateVersion: 3, replayed: false },
    });
    const project = projectRepository();
    const service = createDiscoveryService({
      repository: repo,
      gateway: model,
      projectStateRepository: project,
    });

    const result = await service.advance({ projectId: PROJECT_ID, idempotencyKey: "complete-key" });

    expect(result).toMatchObject({
      status: "completed",
      projectId: PROJECT_ID,
      stateVersion: 5,
      nextPath: `/projects/${PROJECT_ID}/brief`,
    });
    expect(project.applyValidatedDelta).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      generationRunId: RUN_ID,
      expectedStateVersion: 3,
    });
    expect(model.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "project_delta",
        input: expect.stringContaining("unseenprompt.discovery-context"),
      }),
    );
  });
});
