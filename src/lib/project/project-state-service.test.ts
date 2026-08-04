import { describe, expect, it, vi } from "vitest";

import type {
  ModelExecutionMetadata,
  ModelGatewayRequest,
  ProjectDeltaV1,
} from "@/domain/model/contracts";
import type { EffectivePreferences } from "@/domain/account/effective-preferences";
import type {
  ProjectCommandEnvelopeV1,
  ProjectCommitResultV1,
  ProjectStateSnapshotV1,
} from "@/domain/project/contracts";
import { ProjectDomainError } from "@/domain/project/contracts";
import type { ModelGateway } from "@/lib/model/gateway";

import {
  createProjectStateService,
  type ProjectStateServiceDependencies,
} from "./project-state-service";
import type { ProjectStateRepository } from "./project-state-repository";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const REQUIREMENT_ID = "44444444-4444-4444-8444-444444444444";
const DECISION_ID = "55555555-5555-4555-8555-555555555555";
const MILESTONE_ID = "66666666-6666-4666-8666-666666666666";
const SUMMARY_ID = "77777777-7777-4777-8777-777777777777";
const DATE = "2026-08-01T00:00:00.000Z";

const proposal: ProjectDeltaV1 = {
  summary: "Bounded project proposal.",
  requirementProposals: [],
  decisionProposals: [],
  milestoneProposals: [],
  unresolvedConflicts: [],
};

const effectivePreferences: EffectivePreferences = {
  skillLevel: { value: "advanced", source: "global" },
  preferredStackBehavior: { value: "prefer_saved", source: "global" },
  preferredStack: { value: { frontend: "Next.js" }, source: "project" },
  codingStyle: { value: { testing: "test_first" }, source: "global" },
  deploymentPreference: { value: "cloudflare", source: "project" },
};

const snapshot: ProjectStateSnapshotV1 = {
  projection: {
    id: PROJECT_ID,
    mode: "feature",
    stage: "discovery",
    stateVersion: 7,
    selectedTool: "codex",
    activeMilestoneId: MILESTONE_ID,
    blockerSummary: null,
    blockedFromStage: null,
    archivedFromStage: null,
    archivedAt: null,
  },
  requirements: [
    {
      id: REQUIREMENT_ID,
      projectId: PROJECT_ID,
      category: "scope",
      statement: "The project state must remain typed.",
      rationale: null,
      status: "confirmed",
      sourceEventId: EVENT_ID,
      supersedesRequirementId: null,
      confirmedAt: DATE,
      createdAt: DATE,
      updatedAt: DATE,
    },
  ],
  decisions: [
    {
      id: DECISION_ID,
      projectId: PROJECT_ID,
      decisionKey: "state-boundary",
      decision: "Use the repository boundary.",
      rationale: null,
      status: "confirmed",
      sourceEventId: EVENT_ID,
      supersedesDecisionId: null,
      confirmedAt: DATE,
      createdAt: DATE,
      updatedAt: DATE,
    },
  ],
  milestones: [
    {
      id: MILESTONE_ID,
      projectId: PROJECT_ID,
      position: 1,
      title: "Compile context",
      description: null,
      suggestedStatus: "in_progress",
      confirmedStatus: null,
      confirmationEventId: null,
      blockedReason: null,
      createdAt: DATE,
      updatedAt: DATE,
    },
  ],
  summaries: [
    {
      id: SUMMARY_ID,
      projectId: PROJECT_ID,
      summaryKind: "state",
      version: 1,
      basedOnEventSequence: 7,
      summaryText: "Current state summary.",
      structuredFacts: { stable: true },
      status: "current",
      createdAt: DATE,
    },
  ],
  effectivePreferences,
  recentEvidence: [
    {
      id: EVENT_ID,
      kind: "test",
      summary: "A bounded evidence descriptor.",
      occurredAt: DATE,
      evidenceLabel: "verified",
    },
  ],
};

const receipt: ProjectCommitResultV1 = {
  projectId: PROJECT_ID,
  eventId: EVENT_ID,
  stateVersion: 8,
  replayed: false,
};

function metadata(overrides: Partial<ModelExecutionMetadata> = {}): ModelExecutionMetadata {
  return {
    generationRunId: RUN_ID,
    projectStateVersion: 7,
    correlationId: EVENT_ID,
    provider: "openai",
    model: "test-model",
    resolvedModel: "test-model",
    latencyMs: 1,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    estimatedCostMicros: null,
    retryCount: 0,
    validationResult: "passed",
    calls: [],
    errorCode: null,
    replayed: false,
    ...overrides,
  };
}

type ProjectDeltaResponse = {
  readonly data: ProjectDeltaV1;
  readonly metadata: ModelExecutionMetadata;
};
type ProjectDeltaExecutor = (
  request: ModelGatewayRequest<ProjectDeltaV1>,
) => Promise<ProjectDeltaResponse>;

function dependencies(
  execute: ProjectDeltaExecutor,
  repositoryOverrides: Partial<ProjectStateRepository> = {},
): ProjectStateServiceDependencies & { readonly repository: ProjectStateRepository } {
  const repository: ProjectStateRepository = {
    getSnapshot: vi.fn(async () => snapshot),
    execute: vi.fn(async () => receipt),
    applyValidatedDelta: vi.fn(async () => receipt),
    ...repositoryOverrides,
  };
  return {
    gateway: { execute: execute as unknown as ModelGateway["execute"] },
    repository,
  };
}

function gatewayResponse(
  responseMetadata: Partial<ModelExecutionMetadata> = {},
  responseProposal: ProjectDeltaV1 = proposal,
): { readonly data: ProjectDeltaV1; readonly metadata: ModelExecutionMetadata } {
  return { data: responseProposal, metadata: metadata(responseMetadata) };
}

function baseInput() {
  return {
    projectId: PROJECT_ID,
    idempotencyKey: "project-delta-test",
    systemInstruction: "Return only a bounded project delta.",
    reviewPolicy: "none" as const,
    contextBudget: { maxUtf8Bytes: 65_000, maxEstimatedTokens: 16_000 },
  };
}

describe("project state service", () => {
  it("compiles canonical context, calls the exact project_delta schema, and applies only the run ID", async () => {
    const execute = vi.fn(async (request: ModelGatewayRequest<ProjectDeltaV1>) => {
      expect(request.operation).toBe("project_delta");
      expect(request.schema).toBeDefined();
      expect(request.schema.versionedId).toBe("unseenprompt.model-output.project_delta.v1");
      const context = JSON.parse(request.input) as {
        readonly requirements: readonly unknown[];
        readonly decisions: readonly unknown[];
        readonly activeMilestone: { readonly id: string } | null;
        readonly preferences: { readonly preferredStack?: { readonly source: string } } | null;
      };
      expect(context.requirements).toHaveLength(1);
      expect(context.decisions).toHaveLength(1);
      expect(context.activeMilestone?.id).toBe(MILESTONE_ID);
      expect(context.preferences?.preferredStack?.source).toBe("project");
      return gatewayResponse();
    });
    const applyValidatedDelta = vi.fn(async () => receipt);
    const service = createProjectStateService(dependencies(execute, { applyValidatedDelta }));

    const result = await service.proposeAndApplyProjectDelta(baseInput());

    expect(result.proposal).toEqual(proposal);
    expect(result.compilerMetadata).not.toBeNull();
    if (result.compilerMetadata === null) throw new Error("expected compiler metadata");
    expect(result.compilerMetadata.projectStateVersion).toBe(7);
    expect(result.compilerMetadata.limits).toEqual({
      maxUtf8Bytes: 65_000,
      maxEstimatedTokens: 16_000,
    });
    expect(result.modelMetadata.generationRunId).toBe(RUN_ID);
    expect(result.applyReceipt).toEqual(receipt);
    expect(applyValidatedDelta).toHaveBeenCalledTimes(1);
    expect(applyValidatedDelta).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      generationRunId: RUN_ID,
      expectedStateVersion: 7,
    });
  });

  it("replays a durable gateway result after apply failure without repeating provider work", async () => {
    const execute = vi
      .fn<ProjectDeltaExecutor>()
      .mockResolvedValueOnce(gatewayResponse())
      .mockResolvedValueOnce(gatewayResponse({ replayed: true }));
    const applyValidatedDelta = vi
      .fn<() => Promise<ProjectCommitResultV1>>()
      .mockRejectedValueOnce(new Error("persistence failure"))
      .mockResolvedValueOnce(receipt);
    const service = createProjectStateService(dependencies(execute, { applyValidatedDelta }));

    await expect(service.proposeAndApplyProjectDelta(baseInput())).rejects.toMatchObject({
      code: "persistence_failed",
    });
    const replayed = await service.proposeAndApplyProjectDelta(baseInput());

    expect(replayed.modelMetadata.replayed).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(applyValidatedDelta).toHaveBeenCalledTimes(2);
  });

  it("replays a committed proposal after a lost response without charging the provider twice", async () => {
    let currentSnapshot = snapshot;
    let providerCalls = 0;
    let applyAttempts = 0;
    const requests: ModelGatewayRequest<ProjectDeltaV1>[] = [];
    const execute = vi.fn<ProjectDeltaExecutor>(async (request) => {
      requests.push(request);
      if (requests.length === 1) {
        providerCalls += 1;
        return gatewayResponse();
      }
      return gatewayResponse({ replayed: true, projectStateVersion: 7 });
    });
    const replayReceipt = { ...receipt, replayed: true };
    const applyValidatedDelta = vi.fn(
      async (input: Parameters<ProjectStateRepository["applyValidatedDelta"]>[0]) => {
        applyAttempts += 1;
        expect(input.expectedStateVersion).toBe(7);
        if (applyAttempts === 1) {
          currentSnapshot = {
            ...currentSnapshot,
            projection: { ...currentSnapshot.projection, stateVersion: 8 },
          };
          throw new Error("response lost after commit");
        }
        return replayReceipt;
      },
    );
    const service = createProjectStateService(
      dependencies(execute, {
        getSnapshot: vi.fn(async () => currentSnapshot),
        applyValidatedDelta,
      }),
    );

    await expect(service.proposeAndApplyProjectDelta(baseInput())).rejects.toMatchObject({
      code: "persistence_failed",
    });
    const replayed = await service.proposeAndApplyProjectDelta(baseInput());

    expect(providerCalls).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(requests[0]?.projectStateVersion).toBe(7);
    expect(requests[1]?.projectStateVersion).toBe(8);
    expect(requests[0]?.logicalIdempotencyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(requests[1]?.logicalIdempotencyFingerprint).toBe(
      requests[0]?.logicalIdempotencyFingerprint,
    );
    expect(replayed.modelMetadata).toMatchObject({
      generationRunId: RUN_ID,
      projectStateVersion: 7,
      replayed: true,
    });
    expect(replayed.compilerMetadata).toBeNull();
    expect(replayed.applyReceipt).toEqual(replayReceipt);
  });

  it("uses a changed logical input to produce a different same-key fingerprint", async () => {
    const requests: ModelGatewayRequest<ProjectDeltaV1>[] = [];
    const execute = vi.fn<ProjectDeltaExecutor>(async (request) => {
      requests.push(request);
      if (requests.length === 1) return gatewayResponse();
      throw new ProjectDomainError("idempotency_conflict");
    });
    const applyValidatedDelta = vi.fn(async () => receipt);
    const service = createProjectStateService(dependencies(execute, { applyValidatedDelta }));

    await service.proposeAndApplyProjectDelta(baseInput());
    await expect(
      service.proposeAndApplyProjectDelta({
        ...baseInput(),
        systemInstruction: "Return a different project delta contract.",
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });

    expect(requests).toHaveLength(2);
    expect(requests[0]?.logicalIdempotencyFingerprint).not.toBe(
      requests[1]?.logicalIdempotencyFingerprint,
    );
    expect(applyValidatedDelta).toHaveBeenCalledTimes(1);
  });

  it("fails closed for malformed model metadata", async () => {
    const malformedResponses = [
      {
        data: proposal,
        metadata: { ...metadata(), generationRunId: "not-a-run-id" },
      },
      {
        data: proposal,
        metadata: { ...metadata(), projectStateVersion: 8 } as unknown as ModelExecutionMetadata,
      },
    ];

    for (const response of malformedResponses) {
      const execute: ProjectDeltaExecutor = vi.fn(
        async () => response as unknown as ProjectDeltaResponse,
      );
      const applyValidatedDelta = vi.fn(async () => receipt);
      const service = createProjectStateService(dependencies(execute, { applyValidatedDelta }));

      await expect(service.proposeAndApplyProjectDelta(baseInput())).rejects.toMatchObject({
        code: "persistence_failed",
      });
      expect(applyValidatedDelta).not.toHaveBeenCalled();
    }
  });

  it("does not apply an unvalidated proposal", async () => {
    const execute = vi.fn(async () =>
      gatewayResponse({}, { ...proposal, unexpected: "not allowed" } as never),
    );
    const applyValidatedDelta = vi.fn(async () => receipt);
    const service = createProjectStateService(dependencies(execute, { applyValidatedDelta }));

    await expect(service.proposeAndApplyProjectDelta(baseInput())).rejects.toMatchObject({
      code: "persistence_failed",
    });
    expect(applyValidatedDelta).not.toHaveBeenCalled();
  });

  it("rejects apply receipts that are not bound to the snapshot and sanitizes unknown failures", async () => {
    const invalidReceipts = [
      { ...receipt, projectId: "88888888-8888-4888-8888-888888888888" },
      { ...receipt, stateVersion: 9 },
    ];

    for (const invalidReceipt of invalidReceipts) {
      const execute = vi.fn(async () => gatewayResponse());
      const applyValidatedDelta = vi.fn(async () => invalidReceipt);
      const service = createProjectStateService(dependencies(execute, { applyValidatedDelta }));

      await expect(service.proposeAndApplyProjectDelta(baseInput())).rejects.toMatchObject({
        code: "persistence_failed",
      });
    }

    const execute = vi.fn(async () => gatewayResponse());
    const applyValidatedDelta = vi.fn(async () => {
      throw new Error("provider body must not cross the service boundary");
    });
    const service = createProjectStateService(dependencies(execute, { applyValidatedDelta }));

    await expect(service.proposeAndApplyProjectDelta(baseInput())).rejects.toMatchObject({
      code: "persistence_failed",
      message: "persistence_failed",
    });

    const safeError = new ProjectDomainError("stale_state_version");
    const safeApply = vi.fn(async () => {
      throw safeError;
    });
    const safeService = createProjectStateService(
      dependencies(execute, { applyValidatedDelta: safeApply }),
    );
    await expect(safeService.proposeAndApplyProjectDelta(baseInput())).rejects.toBe(safeError);
  });

  it("delegates direct commands without involving the gateway", async () => {
    const executeGateway = vi.fn(async () => gatewayResponse());
    const executeCommand = vi.fn(async () => receipt);
    const service = createProjectStateService(
      dependencies(executeGateway, { execute: executeCommand }),
    );
    const envelope: ProjectCommandEnvelopeV1 = {
      schema: "unseenprompt.project-command",
      schemaVersion: 1,
      projectId: PROJECT_ID,
      expectedStateVersion: 7,
      idempotencyKey: "command-test",
      command: { type: "transition_stage", to: "brief_confirmation" },
    };

    await expect(service.executeCommand(envelope)).resolves.toEqual(receipt);
    expect(executeCommand).toHaveBeenCalledWith(envelope);
    expect(executeGateway).not.toHaveBeenCalled();
  });

  it("validates direct-command receipt binding and sanitizes repository failures", async () => {
    const envelope: ProjectCommandEnvelopeV1 = {
      schema: "unseenprompt.project-command",
      schemaVersion: 1,
      projectId: PROJECT_ID,
      expectedStateVersion: 7,
      idempotencyKey: "command-receipt-test",
      command: { type: "transition_stage", to: "brief_confirmation" },
    };

    const malformedRepository = vi.fn(async () => ({ ...receipt, stateVersion: 9 }));
    const malformedService = createProjectStateService(
      dependencies(
        vi.fn(async () => gatewayResponse()),
        { execute: malformedRepository },
      ),
    );
    await expect(malformedService.executeCommand(envelope)).rejects.toMatchObject({
      code: "persistence_failed",
    });

    const unknownRepository = vi.fn(async () => {
      throw new Error("raw database details must not cross the boundary");
    });
    const unknownService = createProjectStateService(
      dependencies(
        vi.fn(async () => gatewayResponse()),
        { execute: unknownRepository },
      ),
    );
    await expect(unknownService.executeCommand(envelope)).rejects.toMatchObject({
      code: "persistence_failed",
      message: "persistence_failed",
    });
  });
});
