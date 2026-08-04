import { describe, expect, it, vi } from "vitest";

import { parseModelEnvironment, type ModelEnvironment } from "@/config/model/schema";
import { getModelOutputSchema } from "@/domain/model/schemas";
import { serializeCanonicalJsonV1 } from "@/domain/project/commands";
import type { ModelGatewayRequest } from "@/domain/model/contracts";
import type {
  ComposerDraftExecutionSubject,
  ModelExecutionSubject,
  ProjectExecutionSubject,
  TypedModelGatewayRequest,
  TypedModelOperation,
} from "@/domain/model/contracts";
import { createModelGatewayError } from "@/lib/model/errors";
import { createModelGateway, type ModelGatewayDependencies } from "@/lib/model/gateway";
import type { DeadlineTimer } from "@/lib/model/deadline";
import {
  GENERATION_RUN_INPUT_SCHEMA_VERSION,
  MAX_VALIDATED_OUTPUT_BYTES,
} from "@/lib/model/generation-run-store";
import type {
  GenerationRunClaim,
  GenerationRunClaimInput,
  GenerationRunClaimInputV3,
  GenerationRunClaimV3,
  GenerationRunCompletion,
  GenerationRunCompletionInput,
  GenerationRunCompletionInputV3,
  GenerationRunCompletionV3,
  GenerationRunStore,
} from "@/lib/model/generation-run-store";
import type { ProviderAdapter, ProviderAdapterResult } from "@/lib/model/provider";

type MockedRunStore = GenerationRunStore & {
  readonly claim: ReturnType<typeof vi.fn>;
  readonly complete: ReturnType<typeof vi.fn>;
};

const PROJECT_ID = "01000000-0000-4000-8000-000000000001";
const RUN_ID = "06000000-0000-4000-8000-000000000001";
const CORRELATION_ID = "07000000-0000-4000-8000-000000000001";

const validCandidate = JSON.stringify({
  mode: "feature",
  confidence: 0.9,
  rationale: "The request describes a feature change.",
  detectedLanguage: "en",
});

const validSufficiencyCandidate = JSON.stringify({
  isSufficient: true,
  confidence: 0.9,
  missingFacts: [],
  rationale: "The discovery context is sufficient.",
});

const validQuestionCandidate = JSON.stringify({
  question: "Which audience should this serve?",
  rationale: "The audience is still ambiguous.",
  suggestedAnswers: [],
  allowsFreeText: true,
});

const validProjectDelta = {
  summary: "A bounded proposal.",
  requirementProposals: [],
  decisionProposals: [],
  milestoneProposals: [],
  unresolvedConflicts: [],
} as const;
const validProjectDeltaText = serializeCanonicalJsonV1(validProjectDelta);
const PROJECT_DELTA_OUTPUT_SCHEMA_VERSION = "unseenprompt.model-output.project_delta.v1" as const;

const environment = parseModelEnvironment({
  ANTHROPIC_API_KEY: "anthropic-test-key",
  OPENAI_API_KEY: "openai-test-key",
  MODEL_PRIMARY_PROVIDER: "anthropic",
  MODEL_PRIMARY_MODEL: "claude-test",
  MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS: "1000000",
  MODEL_PRIMARY_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: "2000000",
  MODEL_FALLBACK_PROVIDER: "openai",
  MODEL_FALLBACK_MODEL: "gpt-test",
  MODEL_FALLBACK_INPUT_COST_MICROS_PER_MILLION_TOKENS: "3000000",
  MODEL_FALLBACK_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: "4000000",
  MODEL_TOTAL_DEADLINE_MS: "30000",
  MODEL_ATTEMPT_TIMEOUT_MS: "12000",
  MODEL_MAX_OUTPUT_TOKENS: "1024",
});

function request(
  overrides: Partial<ModelGatewayRequest<unknown>> = {},
): ModelGatewayRequest<unknown> {
  return {
    projectId: PROJECT_ID,
    projectStateVersion: 1,
    idempotencyKey: "gateway-test-key",
    operation: "intent_detection",
    schema: getModelOutputSchema("intent_detection"),
    systemInstruction: "Return a structured decision.",
    input: "Build a feature.",
    reviewPolicy: "none",
    ...overrides,
  };
}

function projectDeltaRequest(
  overrides: Partial<ModelGatewayRequest<unknown>> = {},
): ModelGatewayRequest<unknown> {
  return request({
    operation: "project_delta",
    schema: getModelOutputSchema("project_delta"),
    ...overrides,
  });
}

function result(value: unknown, providerModel = "resolved-test"): ProviderAdapterResult {
  return {
    value,
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    resolvedModel: providerModel,
    requestId: "request-1",
  };
}

function adapter(
  providerId: ProviderAdapter["providerId"],
  values: readonly unknown[],
): ProviderAdapter {
  const queue = [...values];
  return {
    providerId,
    generate: vi.fn(async () => {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return result(next);
    }),
  };
}

function store(
  options: {
    readonly complete?: (input: GenerationRunCompletionInput) => Promise<GenerationRunCompletion>;
  } = {},
) {
  const claim = vi.fn(async (input: GenerationRunClaimInput) => ({
    runId: RUN_ID,
    correlationId: CORRELATION_ID,
    status: "running" as const,
    projectStateVersion: input.projectStateVersion,
    operationKind: input.operationKind,
    inputSchemaVersion: input.inputSchemaVersion,
    outputSchemaVersion: input.outputSchemaVersion,
  }));
  const complete = vi.fn(
    options.complete ??
      (async (input: GenerationRunCompletionInput): Promise<GenerationRunCompletion> => ({
        ...input,
        correlationId: CORRELATION_ID,
        projectStateVersion: 1,
        operationKind: "intent_detection",
        inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
        outputSchemaVersion: "unseenprompt.model-output.intent_detection.v1",
        validatedProjectDeltaText: null,
        validatedProjectDeltaHash: null,
      })),
  );
  return { claim, complete } satisfies GenerationRunStore & {
    claim: typeof claim;
    complete: typeof complete;
  };
}

function replayedStore(
  overrides: Partial<Extract<GenerationRunClaim, { status: "replayed" }>> = {},
) {
  const claim = vi.fn(async (input: GenerationRunClaimInput): Promise<GenerationRunClaim> => ({
    runId: RUN_ID,
    correlationId: CORRELATION_ID,
    status: "replayed",
    projectStateVersion: input.projectStateVersion,
    operationKind: "project_delta",
    inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
    outputSchemaVersion: PROJECT_DELTA_OUTPUT_SCHEMA_VERSION,
    provider: "openai",
    model: "gpt-test",
    latencyMs: 42,
    inputTokens: 10,
    outputTokens: 20,
    retryCount: 1,
    estimatedCostMicros: 30,
    validationResult: "passed",
    errorCode: null,
    validatedProjectDeltaText: validProjectDeltaText,
    validatedProjectDeltaHash: "00".repeat(32),
    ...overrides,
  }));
  const complete = vi.fn(async (): Promise<never> => {
    throw new Error("replayed execution must not complete");
  });
  return { claim, complete } satisfies MockedRunStore;
}

function dependencies(
  primary: ProviderAdapter,
  fallback: ProviderAdapter,
  runStore: MockedRunStore,
  overrides: Partial<ModelGatewayDependencies> = {},
): ModelGatewayDependencies {
  return {
    environment,
    adapters: { anthropic: primary, openai: fallback },
    store: runStore,
    createCorrelationId: () => CORRELATION_ID,
    digest: async () => new Uint8Array(32).buffer,
    ...overrides,
  };
}

function typedDependencies(
  primary: ProviderAdapter,
  fallback: ProviderAdapter,
  runStore: MockedRunStore & {
    readonly claimV3: ReturnType<typeof vi.fn>;
    readonly completeV3: ReturnType<typeof vi.fn>;
  },
  overrides: Partial<ModelGatewayDependencies> = {},
): ModelGatewayDependencies {
  return dependencies(primary, fallback, runStore, {
    digest: async (input) =>
      globalThis.crypto.subtle.digest("SHA-256", input as unknown as BufferSource),
    ...overrides,
  });
}

const DRAFT_ID = "02000000-0000-4000-8000-000000000001";
const DRAFT_SUBJECT: ComposerDraftExecutionSubject = {
  kind: "composer_draft",
  id: DRAFT_ID,
  version: 4,
};
const PROJECT_SUBJECT: ProjectExecutionSubject = {
  kind: "project",
  id: PROJECT_ID,
  version: 2,
};

function typedRequest(
  overrides: Partial<TypedModelGatewayRequest<unknown>> = {},
): TypedModelGatewayRequest<unknown> {
  return {
    subject: DRAFT_SUBJECT,
    idempotencyKey: "typed-gateway-test-key",
    operation: "intent_detection",
    schema: getModelOutputSchema("intent_detection"),
    systemInstruction: "Return a structured decision.",
    input: "Build a feature.",
    reviewPolicy: "none",
    ...overrides,
  } as TypedModelGatewayRequest<unknown>;
}

function typedProjectRequest<O extends "discovery_sufficiency" | "clarification_question">(
  operation: O,
  overrides: Partial<TypedModelGatewayRequest<unknown, O>> = {},
): TypedModelGatewayRequest<unknown, O> {
  return {
    subject: PROJECT_SUBJECT,
    idempotencyKey: `typed-${operation}-test-key`,
    operation,
    schema: getModelOutputSchema(operation),
    systemInstruction: "Return a structured decision.",
    input: "The project context needs discovery.",
    reviewPolicy: "none",
    ...overrides,
  } as TypedModelGatewayRequest<unknown, O>;
}

function assertTypedOperationPairTypes(): void {
  const draftSubject: ModelExecutionSubject = DRAFT_SUBJECT;
  const typedOperation: TypedModelOperation = "intent_detection";
  const draftIntent = typedRequest();
  const projectSufficiency = typedProjectRequest("discovery_sufficiency");
  const projectQuestion = typedProjectRequest("clarification_question");

  const invalidDraft = {
    ...projectSufficiency,
    // @ts-expect-error composer drafts may only run intent detection
    subject: DRAFT_SUBJECT,
  } satisfies TypedModelGatewayRequest<unknown, "discovery_sufficiency">;
  const invalidProject = {
    ...draftIntent,
    // @ts-expect-error projects may not run intent detection through the typed v3 port
    subject: PROJECT_SUBJECT,
  } satisfies TypedModelGatewayRequest<unknown, "intent_detection">;

  void draftSubject;
  void typedOperation;
  void projectQuestion;
  void invalidDraft;
  void invalidProject;
}

assertTypedOperationPairTypes();

function typedStore(
  operation:
    "intent_detection" | "discovery_sufficiency" | "clarification_question" = "intent_detection",
) {
  const legacy = store();
  const claimV3 = vi.fn(
    async (input: GenerationRunClaimInputV3): Promise<GenerationRunClaimV3> => ({
      runId: RUN_ID,
      correlationId: CORRELATION_ID,
      status: "running" as const,
      subject: input.subject,
      operationKind: input.operationKind,
      inputSchemaVersion: input.inputSchemaVersion,
      outputSchemaVersion: input.outputSchemaVersion,
    }),
  );
  const completeV3 = vi.fn(
    async (input: GenerationRunCompletionInputV3): Promise<GenerationRunCompletionV3> => ({
      ...input,
      correlationId: CORRELATION_ID,
      subject: input.subject,
      operationKind: operation,
      inputSchemaVersion: "unseenprompt.model-gateway-request.v3",
      outputSchemaVersion: `unseenprompt.model-output.${operation}.v1`,
      validatedOutputText: input.validatedOutputText ?? null,
      validatedOutputHash:
        input.validatedOutputText === undefined || input.validatedOutputText === null
          ? null
          : await sha256Hex(input.validatedOutputText),
    }),
  );
  return { ...legacy, claimV3, completeV3 } satisfies GenerationRunStore & {
    claimV3: typeof claimV3;
    completeV3: typeof completeV3;
  };
}

async function sha256Hex(value: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function typedReplayClaim(
  operation: TypedModelOperation = "intent_detection",
  overrides: Partial<Extract<GenerationRunClaimV3, { status: "replayed" }>> = {},
): Promise<Extract<GenerationRunClaimV3, { status: "replayed" }>> {
  const value =
    operation === "intent_detection"
      ? JSON.parse(validCandidate)
      : operation === "discovery_sufficiency"
        ? JSON.parse(validSufficiencyCandidate)
        : JSON.parse(validQuestionCandidate);
  const text = serializeCanonicalJsonV1(value);
  return {
    runId: RUN_ID,
    correlationId: CORRELATION_ID,
    status: "replayed",
    subject: operation === "intent_detection" ? DRAFT_SUBJECT : PROJECT_SUBJECT,
    operationKind: operation,
    inputSchemaVersion: "unseenprompt.model-gateway-request.v3",
    outputSchemaVersion: `unseenprompt.model-output.${operation}.v1`,
    provider: "openai",
    model: "gpt-test",
    latencyMs: 42,
    inputTokens: 10,
    outputTokens: 20,
    retryCount: 1,
    estimatedCostMicros: 30,
    validationResult: "passed",
    errorCode: null,
    validatedOutputText: text,
    validatedOutputHash: await sha256Hex(text),
    ...overrides,
  };
}

describe("model gateway", () => {
  it("claims before any provider call and returns validated success metadata", async () => {
    const events: string[] = [];
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();
    const gatewayRequest = request();
    runStore.claim.mockImplementation(async (input) => {
      events.push("claim");
      return {
        runId: RUN_ID,
        correlationId: CORRELATION_ID,
        status: "running",
        projectStateVersion: input.projectStateVersion,
        operationKind: input.operationKind,
        inputSchemaVersion: input.inputSchemaVersion,
        outputSchemaVersion: input.outputSchemaVersion,
      };
    });
    vi.mocked(primary.generate).mockImplementation(async () => {
      events.push("provider");
      return result(validCandidate);
    });

    const response = await createModelGateway(dependencies(primary, fallback, runStore)).execute(
      gatewayRequest,
    );
    expect(events).toEqual(["claim", "provider"]);
    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(response.metadata.validationResult).toBe("passed");
    expect(response.metadata.generationRunId).toBe(RUN_ID);
    expect(response.metadata.usage).toEqual({ inputTokens: 10, outputTokens: 20, totalTokens: 30 });
    expect(runStore.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        validationResult: "passed",
        errorCode: null,
        validatedProjectDeltaText: null,
      }),
    );
    expect(runStore.claim.mock.calls[0]?.[0].requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(response.metadata.replayed).toBe(false);
  });

  it("persists only the canonical validated project-delta text on original success", async () => {
    const primary = adapter("anthropic", [JSON.stringify(validProjectDelta)]);
    const fallback = adapter("openai", []);
    const complete = vi.fn(
      async (input: GenerationRunCompletionInput): Promise<GenerationRunCompletion> => ({
        ...input,
        correlationId: CORRELATION_ID,
        projectStateVersion: 1,
        operationKind: "project_delta" as const,
        inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
        outputSchemaVersion: PROJECT_DELTA_OUTPUT_SCHEMA_VERSION,
        validatedProjectDeltaText: input.validatedProjectDeltaText ?? null,
        validatedProjectDeltaHash: "00".repeat(32),
      }),
    );
    const runStore = {
      claim: vi.fn(async (input: GenerationRunClaimInput) => ({
        runId: RUN_ID,
        correlationId: CORRELATION_ID,
        status: "running" as const,
        projectStateVersion: input.projectStateVersion,
        operationKind: input.operationKind,
        inputSchemaVersion: input.inputSchemaVersion,
        outputSchemaVersion: input.outputSchemaVersion,
      })),
      complete,
    } satisfies MockedRunStore;

    const response = await createModelGateway(dependencies(primary, fallback, runStore)).execute(
      projectDeltaRequest(),
    );

    expect(response.data).toEqual(validProjectDelta);
    expect(response.metadata.replayed).toBe(false);
    expect(response.metadata.generationRunId).toBe(RUN_ID);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        validatedProjectDeltaText: validProjectDeltaText,
      }),
    );
    expect(complete.mock.calls[0]?.[0]).not.toHaveProperty("systemInstruction");
    expect(complete.mock.calls[0]?.[0]).not.toHaveProperty("input");
  });

  it("passes a provider-safe registered schema name without changing persisted schema identity", async () => {
    const primary = adapter("openai", [validCandidate]);
    const fallback = adapter("anthropic", []);
    const runStore = store();
    const gatewayRequest = request();
    const openAiEnvironment = {
      ...environment,
      primary: { ...environment.primary, provider: "openai" },
      fallback: { ...environment.fallback, provider: "anthropic" },
    } satisfies ModelEnvironment;

    await createModelGateway(
      dependencies(primary, fallback, runStore, {
        environment: openAiEnvironment,
        adapters: { openai: primary, anthropic: fallback },
      }),
    ).execute(gatewayRequest);

    const providerRequest = vi.mocked(primary.generate).mock.calls[0]?.[0];
    expect(providerRequest?.outputSchemaName).toBe("intent_detection_v1");
    expect(providerRequest?.outputSchemaName).not.toBe(gatewayRequest.schema.versionedId);
    expect(providerRequest?.outputSchema).toBe(gatewayRequest.schema.jsonSchema);
    expect(runStore.claim.mock.calls[0]?.[0].outputSchemaVersion).toBe(
      gatewayRequest.schema.schemaVersion,
    );
  });

  it("withholds provider calls for pre-claim cancellation and stable claim errors", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = store();
    const controller = new AbortController();
    controller.abort();

    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(
        request({ signal: controller.signal }),
      ),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(runStore.claim).not.toHaveBeenCalled();
    expect(primary.generate).not.toHaveBeenCalled();

    runStore.claim.mockRejectedValueOnce(
      createModelGatewayError("idempotency_in_progress", CORRELATION_ID),
    );
    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(request()),
    ).rejects.toMatchObject({
      code: "idempotency_in_progress",
    });
    expect(primary.generate).not.toHaveBeenCalled();
  });

  it.each([
    "idempotency_conflict",
    "idempotency_in_progress",
    "idempotency_replay_unavailable",
  ] as const)("does not call a provider for %s claim outcomes", async (code) => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = store();
    runStore.claim.mockRejectedValueOnce(createModelGatewayError(code, CORRELATION_ID));

    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(request()),
    ).rejects.toMatchObject({
      code,
    });
    expect(primary.generate).not.toHaveBeenCalled();
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(runStore.complete).not.toHaveBeenCalled();
  });

  it("replays a durable project delta with aggregate metadata and zero provider calls", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = replayedStore();
    const response = await createModelGateway(dependencies(primary, fallback, runStore)).execute(
      projectDeltaRequest(),
    );

    expect(response.data).toEqual(validProjectDelta);
    expect(response.metadata).toMatchObject({
      generationRunId: RUN_ID,
      correlationId: CORRELATION_ID,
      projectStateVersion: 1,
      provider: "openai",
      model: "gpt-test",
      latencyMs: 42,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      retryCount: 1,
      estimatedCostMicros: 30,
      validationResult: "passed",
      replayed: true,
      calls: [],
      errorCode: null,
    });
    expect(primary.generate).not.toHaveBeenCalled();
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(runStore.complete).not.toHaveBeenCalled();
  });

  it("accepts a durable replay from an older state only with an explicit logical fingerprint", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = replayedStore({ projectStateVersion: 1 });
    const logicalFingerprint = "ab".repeat(32);

    const response = await createModelGateway(dependencies(primary, fallback, runStore)).execute(
      projectDeltaRequest({
        projectStateVersion: 2,
        logicalIdempotencyFingerprint: logicalFingerprint,
      }),
    );

    expect(runStore.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        projectStateVersion: 2,
        allowHistoricalReplay: true,
      }),
    );
    expect(runStore.claim.mock.calls[0]?.[0].requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(runStore.claim.mock.calls[0]?.[0].requestFingerprint).not.toBe(logicalFingerprint);
    expect(response.metadata.projectStateVersion).toBe(1);
    expect(response.metadata.replayed).toBe(true);
    expect(primary.generate).not.toHaveBeenCalled();
    expect(fallback.generate).not.toHaveBeenCalled();
  });

  it("rejects a running claim with a historical version even when a logical fingerprint is supplied", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();
    runStore.claim.mockResolvedValueOnce({
      runId: RUN_ID,
      correlationId: CORRELATION_ID,
      status: "running",
      projectStateVersion: 1,
      operationKind: "project_delta",
      inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: PROJECT_DELTA_OUTPUT_SCHEMA_VERSION,
    });

    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(
        projectDeltaRequest({
          projectStateVersion: 2,
          logicalIdempotencyFingerprint: "cd".repeat(32),
        }),
      ),
    ).rejects.toMatchObject({ code: "persistence_failed" });
    expect(primary.generate).not.toHaveBeenCalled();
    expect(runStore.complete).not.toHaveBeenCalled();
  });

  it("rejects malformed logical fingerprints before claiming", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();

    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(
        projectDeltaRequest({ logicalIdempotencyFingerprint: "AB".repeat(32) }),
      ),
    ).rejects.toMatchObject({ code: "configuration_error" });
    expect(runStore.claim).not.toHaveBeenCalled();
  });

  it("binds a logical fingerprint to immutable request identity before persistence", async () => {
    const primary = adapter("anthropic", [validCandidate, validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();
    const gateway = createModelGateway(
      dependencies(primary, fallback, runStore, {
        digest: async (input) =>
          globalThis.crypto.subtle.digest("SHA-256", input as unknown as BufferSource),
      }),
    );
    const logicalFingerprint = "ef".repeat(32);

    await gateway.execute(request({ logicalIdempotencyFingerprint: logicalFingerprint }));
    await gateway.execute(
      request({
        logicalIdempotencyFingerprint: logicalFingerprint,
        systemInstruction: "Return a different structured decision.",
      }),
    );

    const firstFingerprint = runStore.claim.mock.calls[0]?.[0].requestFingerprint;
    const secondFingerprint = runStore.claim.mock.calls[1]?.[0].requestFingerprint;
    expect(firstFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(secondFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(firstFingerprint).not.toBe(secondFingerprint);
  });

  it.each([
    {
      name: "tampered hash before JSON parse",
      claim: { validatedProjectDeltaText: "not-json", validatedProjectDeltaHash: "11".repeat(32) },
    },
    {
      name: "tampered text with original hash",
      claim: {
        validatedProjectDeltaText: validProjectDeltaText.replace("A bounded", "Tampered"),
        validatedProjectDeltaHash: "11".repeat(32),
      },
    },
    {
      name: "schema metadata",
      claim: { outputSchemaVersion: "unseenprompt.model-output.intent_detection.v1" },
    },
    {
      name: "terminal metadata",
      claim: { provider: "cursor" as never },
    },
  ])("fails closed for replay %s without provider calls", async ({ claim }) => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = replayedStore(
      claim as Partial<Extract<GenerationRunClaim, { status: "replayed" }>>,
    );

    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(projectDeltaRequest()),
    ).rejects.toMatchObject({ code: "persistence_failed" });
    expect(primary.generate).not.toHaveBeenCalled();
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(runStore.complete).not.toHaveBeenCalled();
  });

  it("repairs one malformed candidate using the same route and schema", async () => {
    const primary = adapter("anthropic", ["{malformed", validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();
    const response = await createModelGateway(dependencies(primary, fallback, runStore)).execute(
      request({ systemInstruction: "system-prefix-".repeat(8_000) }),
    );
    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(response.metadata.validationResult).toBe("repaired");
    expect(primary.generate).toHaveBeenCalledTimes(2);
    expect(fallback.generate).not.toHaveBeenCalled();
    const first = vi.mocked(primary.generate).mock.calls[0]?.[0];
    const second = vi.mocked(primary.generate).mock.calls[1]?.[0];
    expect(second?.outputSchema).toBe(first?.outputSchema);
    expect(second?.systemInstruction).toContain(
      "Return only a corrected JSON object matching the supplied schema. Do not include commentary.",
    );
    expect(runStore.complete).toHaveBeenCalledWith(
      expect.objectContaining({ validationResult: "repaired" }),
    );
  });

  it("uses fallback once after repair fails and never exceeds three production calls", async () => {
    const primary = adapter("anthropic", ["bad-primary", "bad-repair"]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = store();
    const response = await createModelGateway(dependencies(primary, fallback, runStore)).execute(
      request(),
    );
    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(primary.generate).toHaveBeenCalledTimes(2);
    expect(fallback.generate).toHaveBeenCalledTimes(1);
    expect(response.metadata.calls).toHaveLength(3);
    expect(response.metadata.calls.map((call) => call.kind)).toEqual([
      "primary",
      "repair",
      "fallback",
    ]);
  });

  it("allows exactly one transport retry globally, then fallback", async () => {
    const primary = adapter("anthropic", [
      createModelGatewayError("provider_unavailable", CORRELATION_ID),
      createModelGatewayError("provider_unavailable", CORRELATION_ID),
    ]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = store();
    const response = await createModelGateway(dependencies(primary, fallback, runStore)).execute(
      request(),
    );
    expect(primary.generate).toHaveBeenCalledTimes(2);
    expect(fallback.generate).toHaveBeenCalledTimes(1);
    expect(response.metadata.retryCount).toBe(1);
    expect(response.metadata.calls.map((call) => call.kind)).toEqual([
      "primary",
      "transport_retry",
      "fallback",
    ]);
  });

  it("honors a bounded Retry-After delay before the single retry", async () => {
    const primary = adapter("anthropic", [
      createModelGatewayError("rate_limited", CORRELATION_ID, { retryAfterMs: 1_800 }),
      validCandidate,
    ]);
    const fallback = adapter("openai", []);
    const runStore = store();
    const sleep = vi.fn(async () => undefined);

    const response = await createModelGateway(
      dependencies(primary, fallback, runStore, { sleep }),
    ).execute(request());
    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(sleep).toHaveBeenCalledWith(1_800, expect.any(AbortSignal));
    expect(response.metadata.retryCount).toBe(1);
    expect(response.metadata.calls.map((call) => call.kind)).toEqual([
      "primary",
      "transport_retry",
    ]);
  });

  it("cancels a retry backoff without entering fallback", async () => {
    const primary = adapter("anthropic", [
      createModelGatewayError("provider_unavailable", CORRELATION_ID),
    ]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = store();
    const controller = new AbortController();
    const sleep = vi.fn(async (_delayMs: number, signal?: AbortSignal) => {
      controller.abort();
      throw signal?.reason ?? new Error("backoff-canceled");
    });

    await expect(
      createModelGateway(dependencies(primary, fallback, runStore, { sleep })).execute(
        request({ signal: controller.signal }),
      ),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(primary.generate).toHaveBeenCalledTimes(1);
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(runStore.complete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled", errorCode: "aborted" }),
    );
  });

  it("does not route around safety, auth, quota, permission, request, model, configuration, or provider errors", async () => {
    for (const code of [
      "content_refused",
      "authentication_failed",
      "billing_or_quota_exhausted",
      "permission_denied",
      "invalid_provider_request",
      "model_not_found",
      "configuration_error",
      "provider_error",
    ] as const) {
      const primary = adapter("anthropic", [createModelGatewayError(code, CORRELATION_ID)]);
      const fallback = adapter("openai", [validCandidate]);
      const runStore = store();
      await expect(
        createModelGateway(dependencies(primary, fallback, runStore)).execute(request()),
      ).rejects.toMatchObject({ code });
      expect(fallback.generate).not.toHaveBeenCalled();
      expect(runStore.complete).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", errorCode: code }),
      );
    }
  });

  it("fails closed on a malformed adapter result", async () => {
    const malformed = {
      providerId: "anthropic" as const,
      generate: vi.fn(async () => undefined),
    } as unknown as ProviderAdapter;
    const fallback = adapter("openai", [validCandidate]);
    const runStore = store();

    await expect(
      createModelGateway(dependencies(malformed, fallback, runStore)).execute(request()),
    ).rejects.toMatchObject({
      code: "provider_error",
    });
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(runStore.complete).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "provider_error" }),
    );
  });

  it("routes truncation to fallback without repair", async () => {
    const primary = adapter("anthropic", [
      createModelGatewayError("output_truncated", CORRELATION_ID),
    ]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = store();
    const response = await createModelGateway(dependencies(primary, fallback, runStore)).execute(
      request(),
    );
    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(response.metadata.calls.map((call) => call.kind)).toEqual(["primary", "fallback"]);
  });

  it("keeps a valid candidate on best-effort reviewer failure and fails closed when required", async () => {
    const reviewer: ProviderAdapter = adapter("gemini", ["reviewer-bad"]);
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();
    const reviewerEnvironment = {
      ...environment,
      reviewer: {
        provider: "gemini" as const,
        model: "reviewer-test",
        inputCostMicrosPerMillionTokens: 1,
        outputCostMicrosPerMillionTokens: 1,
      },
    } satisfies ModelEnvironment;
    const deps = dependencies(primary, fallback, runStore, {
      environment: reviewerEnvironment,
      adapters: { anthropic: primary, openai: fallback, gemini: reviewer },
    });
    const bestEffort = await createModelGateway(deps).execute(
      request({ reviewPolicy: "best_effort" }),
    );
    expect(bestEffort.data).toEqual(JSON.parse(validCandidate));
    expect(bestEffort.metadata.validationResult).toBe("passed");
    expect(bestEffort.metadata.calls.at(-1)?.validationResult).toBe("failed");

    const requiredStore = store();
    const requiredPrimary = adapter("anthropic", [validCandidate]);
    const requiredReviewer = adapter("gemini", ["reviewer-bad"]);
    await expect(
      createModelGateway(
        dependencies(requiredPrimary, fallback, requiredStore, {
          environment: reviewerEnvironment,
          adapters: { anthropic: requiredPrimary, openai: fallback, gemini: requiredReviewer },
        }),
      ).execute(request({ reviewPolicy: "required" })),
    ).rejects.toMatchObject({ code: "invalid_output" });
    expect(requiredStore.complete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("accepts a valid reviewer replacement within the absolute four-call budget", async () => {
    const replacement = JSON.stringify({
      mode: "review",
      confidence: 0.8,
      rationale: "Reviewer replacement.",
      detectedLanguage: "en",
    });
    const primary = adapter("anthropic", ["bad-primary", "bad-repair"]);
    const fallback = adapter("openai", [validCandidate]);
    const reviewer = adapter("gemini", [replacement]);
    const runStore = store();
    const reviewerEnvironment = {
      ...environment,
      reviewer: {
        provider: "gemini" as const,
        model: "reviewer-test",
        inputCostMicrosPerMillionTokens: 1,
        outputCostMicrosPerMillionTokens: 1,
      },
    } satisfies ModelEnvironment;

    const response = await createModelGateway(
      dependencies(primary, fallback, runStore, {
        environment: reviewerEnvironment,
        adapters: { anthropic: primary, openai: fallback, gemini: reviewer },
      }),
    ).execute(request({ reviewPolicy: "required" }));

    expect(response.data).toEqual(JSON.parse(replacement));
    expect(response.metadata.validationResult).toBe("reviewed");
    expect(response.metadata.calls).toHaveLength(4);
    expect(response.metadata.calls.map((call) => call.kind)).toEqual([
      "primary",
      "repair",
      "fallback",
      "reviewer",
    ]);
    expect(runStore.complete).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "gemini", validationResult: "reviewed" }),
    );
  });

  it("withholds a reviewer call when cancellation arrives after production validation", async () => {
    const controller = new AbortController();
    const primary: ProviderAdapter = {
      providerId: "anthropic",
      generate: vi.fn(async () => {
        controller.abort();
        return result(validCandidate);
      }),
    };
    const fallback = adapter("openai", []);
    const reviewer = adapter("gemini", [validCandidate]);
    const runStore = store();
    const reviewerEnvironment = {
      ...environment,
      reviewer: {
        provider: "gemini" as const,
        model: "reviewer-test",
        inputCostMicrosPerMillionTokens: 1,
        outputCostMicrosPerMillionTokens: 1,
      },
    } satisfies ModelEnvironment;

    await expect(
      createModelGateway(
        dependencies(primary, fallback, runStore, {
          environment: reviewerEnvironment,
          adapters: { anthropic: primary, openai: fallback, gemini: reviewer },
        }),
      ).execute(request({ reviewPolicy: "required", signal: controller.signal })),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(reviewer.generate).not.toHaveBeenCalled();
    expect(runStore.complete).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "aborted" }),
    );
  });

  it("does not return a no-review candidate when cancellation arrives before completion", async () => {
    const controller = new AbortController();
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();
    const logger = {
      log: vi.fn(() => controller.abort()),
    };

    await expect(
      createModelGateway(dependencies(primary, fallback, runStore, { logger })).execute(
        request({ signal: controller.signal }),
      ),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(runStore.complete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled", errorCode: "aborted" }),
    );
  });

  it("retries unknown completion once without replaying a provider call", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    let completions = 0;
    const runStore = store({
      complete: async (input) => {
        completions += 1;
        if (completions === 1) throw createModelGatewayError("persistence_failed", CORRELATION_ID);
        return {
          ...input,
          correlationId: CORRELATION_ID,
          projectStateVersion: 1,
          operationKind: "intent_detection",
          inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
          outputSchemaVersion: "unseenprompt.model-output.intent_detection.v1",
          validatedProjectDeltaText: null,
          validatedProjectDeltaHash: null,
        };
      },
    });
    await createModelGateway(dependencies(primary, fallback, runStore)).execute(request());
    expect(primary.generate).toHaveBeenCalledTimes(1);
    expect(completions).toBe(2);
  });

  it("withholds output when completion remains unknown after one retry", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store({
      complete: async () => {
        throw createModelGatewayError("persistence_failed", CORRELATION_ID);
      },
    });
    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(request()),
    ).rejects.toMatchObject({
      code: "persistence_failed",
    });
    expect(primary.generate).toHaveBeenCalledTimes(1);
    expect(runStore.complete).toHaveBeenCalledTimes(2);
  });

  it("preserves the original provider error when terminal completion also fails", async () => {
    const primary = adapter("anthropic", [
      createModelGatewayError("authentication_failed", CORRELATION_ID),
    ]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = store({
      complete: async () => {
        throw createModelGatewayError("persistence_failed", CORRELATION_ID);
      },
    });

    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(request()),
    ).rejects.toMatchObject({ code: "authentication_failed" });
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(runStore.complete).toHaveBeenCalledTimes(2);
  });

  it("rejects a completion echo mismatch and never replays the provider", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store({
      complete: async (input) => ({
        ...input,
        provider: "openai",
        correlationId: CORRELATION_ID,
        projectStateVersion: 1,
        operationKind: "intent_detection",
        inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
        outputSchemaVersion: "unseenprompt.model-output.intent_detection.v1",
        validatedProjectDeltaText: null,
        validatedProjectDeltaHash: null,
      }),
    });

    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(request()),
    ).rejects.toMatchObject({
      code: "persistence_failed",
    });
    expect(primary.generate).toHaveBeenCalledTimes(1);
    expect(runStore.complete).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid environment and forged claim identity before provider calls", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const invalidEnvironment = { ...environment, maxOutputTokens: 0 } satisfies ModelEnvironment;
    const invalidEnvironmentStore = store();
    await expect(
      createModelGateway(
        dependencies(primary, fallback, invalidEnvironmentStore, {
          environment: invalidEnvironment,
        }),
      ).execute(request()),
    ).rejects.toMatchObject({ code: "configuration_error" });
    expect(invalidEnvironmentStore.claim).not.toHaveBeenCalled();

    const invalidCostEnvironment = {
      ...environment,
      primary: {
        ...environment.primary,
        inputCostMicrosPerMillionTokens: Number.MAX_SAFE_INTEGER,
      },
    } satisfies ModelEnvironment;
    const invalidCostStore = store();
    await expect(
      createModelGateway(
        dependencies(primary, fallback, invalidCostStore, { environment: invalidCostEnvironment }),
      ).execute(request()),
    ).rejects.toMatchObject({ code: "configuration_error" });
    expect(invalidCostStore.claim).not.toHaveBeenCalled();

    const forgedClaimStore = store();
    forgedClaimStore.claim.mockResolvedValueOnce({
      runId: RUN_ID,
      correlationId: CORRELATION_ID,
      status: "running",
      projectStateVersion: 1,
      operationKind: "intent_detection",
      inputSchemaVersion: "forged-input-schema" as typeof GENERATION_RUN_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: "unseenprompt.model-output.intent_detection.v1",
    });
    await expect(
      createModelGateway(dependencies(primary, fallback, forgedClaimStore)).execute(request()),
    ).rejects.toMatchObject({
      code: "persistence_failed",
    });
    expect(primary.generate).not.toHaveBeenCalled();
    expect(forgedClaimStore.complete).not.toHaveBeenCalled();

    const malformedRunIdStore = store();
    malformedRunIdStore.claim.mockResolvedValueOnce({
      runId: "not-a-uuid",
      correlationId: CORRELATION_ID,
      status: "running",
      projectStateVersion: 1,
      operationKind: "intent_detection",
      inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: "unseenprompt.model-output.intent_detection.v1",
    });
    await expect(
      createModelGateway(dependencies(primary, fallback, malformedRunIdStore)).execute(request()),
    ).rejects.toMatchObject({ code: "persistence_failed" });
    expect(primary.generate).not.toHaveBeenCalled();
    expect(malformedRunIdStore.complete).not.toHaveBeenCalled();
  });

  it("classifies a valid adapter result resolved after attempt abort as a timeout", async () => {
    let attemptTimers = 0;
    const attemptAbortTimer = {
      setTimeout: vi.fn((callback: () => void, delayMs: number) => {
        if (delayMs === 500 && attemptTimers < 2) {
          attemptTimers += 1;
          queueMicrotask(callback);
        }
        return 0;
      }),
      clearTimeout: vi.fn(),
    } as unknown as DeadlineTimer;
    const primary = adapter("anthropic", [validCandidate, validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = store();
    const response = await createModelGateway(
      dependencies(primary, fallback, runStore, {
        environment: { ...environment, totalDeadlineMs: 1_000, attemptTimeoutMs: 500 },
        timer: attemptAbortTimer,
        sleep: async () => undefined,
        now: () => 0,
      }),
    ).execute(request());

    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(primary.generate).toHaveBeenCalledTimes(2);
    expect(response.metadata.calls.slice(0, 2).map((call) => call.outcome)).toEqual([
      "attempt_timeout",
      "attempt_timeout",
    ]);
    expect(response.metadata.calls[2]?.kind).toBe("fallback");
  });

  it("enforces total and caller deadlines before claim", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const totalDeadlineTimer = {
      setTimeout: vi.fn((callback: () => void, delayMs: number) => {
        if (delayMs === 1_000) queueMicrotask(callback);
        return 0;
      }),
      clearTimeout: vi.fn(),
    } as unknown as DeadlineTimer;
    const totalStore = store();
    await expect(
      createModelGateway(
        dependencies(primary, fallback, totalStore, {
          environment: { ...environment, totalDeadlineMs: 1_000, attemptTimeoutMs: 500 },
          timer: totalDeadlineTimer,
          sleep: async () => undefined,
          now: () => 0,
        }),
      ).execute(request()),
    ).rejects.toMatchObject({ code: "deadline_exceeded" });
    expect(totalStore.claim).toHaveBeenCalledTimes(1);
    expect(primary.generate).toHaveBeenCalledTimes(1);

    let clock = 100;
    const callerStore = store();
    await expect(
      createModelGateway(
        dependencies(primary, fallback, callerStore, {
          now: () => {
            const current = clock;
            clock += 1_001;
            return current;
          },
        }),
      ).execute(request({ deadlineMs: 1_000 })),
    ).rejects.toMatchObject({ code: "deadline_exceeded" });
    expect(callerStore.claim).not.toHaveBeenCalled();
  });

  it("bounds repair diagnostics to paths and keeps provider payloads out of metadata", async () => {
    const extraSentinel = "MODEL_PRIVATE_SENTINEL";
    const malformed = JSON.stringify({
      mode: "feature",
      confidence: 0.9,
      rationale: "The request describes a feature change.",
      detectedLanguage: "en",
      extra: extraSentinel,
    }).replace("}", `,"__proto__":{"polluted":true}}`);
    const primary = adapter("anthropic", [malformed, validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();
    const events: unknown[] = [];
    const logger = {
      log: vi.fn((event: unknown) => {
        events.push(event);
        throw new Error("diagnostic sink failure");
      }),
    };
    const response = await createModelGateway(
      dependencies(primary, fallback, runStore, { logger }),
    ).execute(request({ input: `input-${extraSentinel}` }));
    const repairRequest = vi.mocked(primary.generate).mock.calls[1]?.[0];

    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(repairRequest?.input).toContain("Validation paths:\n- $");
    expect(repairRequest?.input).not.toContain("Unrecognized key");
    expect(JSON.stringify(response.metadata)).not.toContain(extraSentinel);
    expect(JSON.stringify(events)).not.toContain(extraSentinel);
  });

  it("freezes aggregate metadata, records cost and latency, and tolerates sink failure", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();
    let nowValue = 0;
    const response = await createModelGateway(
      dependencies(primary, fallback, runStore, {
        now: () => {
          nowValue += 5;
          return nowValue;
        },
        logger: {
          log: () => {
            throw new Error("sink-failure");
          },
        },
      }),
    ).execute(request());

    expect(response.metadata.estimatedCostMicros).toBe(50);
    expect(response.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Object.isFrozen(response.metadata)).toBe(true);
    expect(Object.isFrozen(response.metadata.usage)).toBe(true);
    expect(Object.isFrozen(response.metadata.calls)).toBe(true);
    expect(Object.isFrozen(response.metadata.calls[0])).toBe(true);
    expect(Object.isFrozen(response.metadata.calls[0]?.usage)).toBe(true);
  });

  it("uses bounded sanitized provider model metadata consistently", async () => {
    const rawResolvedModel = `\u0000${"m".repeat(159)}💥MODEL_SECRET_SENTINEL`;
    const primary: ProviderAdapter = {
      providerId: "anthropic",
      generate: vi.fn(async () => ({ ...result(validCandidate), resolvedModel: rawResolvedModel })),
    };
    const fallback = adapter("openai", []);
    const runStore = store();
    const response = await createModelGateway(dependencies(primary, fallback, runStore)).execute(
      request(),
    );

    const aggregateResolvedModel = response.metadata.resolvedModel;
    const callResolvedModel = response.metadata.calls[0]?.resolvedModel;
    expect(aggregateResolvedModel).toBe(callResolvedModel);
    expect(aggregateResolvedModel).not.toBeNull();
    if (aggregateResolvedModel === null) throw new Error("expected a resolved model");
    expect(aggregateResolvedModel).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(aggregateResolvedModel).not.toContain("\uFFFD");
    expect(aggregateResolvedModel).not.toContain("MODEL_SECRET_SENTINEL");
    expect(aggregateResolvedModel).toBe("m".repeat(159));
    expect(aggregateResolvedModel.length).toBeLessThanOrEqual(160);
    expect(new TextEncoder().encode(aggregateResolvedModel).byteLength).toBeLessThanOrEqual(160);
  });

  it("rejects forged schema identity before claim", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();
    const schema = getModelOutputSchema("intent_detection");
    const forged = { ...schema };
    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(
        request({ schema: forged }),
      ),
    ).rejects.toMatchObject({ code: "configuration_error" });
    expect(runStore.claim).not.toHaveBeenCalled();
  });

  it("executes a composer-draft intent request through the v3 ports and fingerprint", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = typedStore();
    const response = await createModelGateway(
      dependencies(primary, fallback, runStore, {
        digest: async (input) =>
          globalThis.crypto.subtle.digest("SHA-256", input as unknown as BufferSource),
      }),
    ).execute(typedRequest());

    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(runStore.claim).not.toHaveBeenCalled();
    expect(runStore.complete).not.toHaveBeenCalled();
    expect(runStore.claimV3).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: DRAFT_SUBJECT,
        inputSchemaVersion: "unseenprompt.model-gateway-request.v3",
      }),
    );
    expect(runStore.claimV3.mock.calls[0]?.[0].requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(runStore.completeV3).toHaveBeenCalledWith(
      expect.objectContaining({ subject: DRAFT_SUBJECT, validatedOutputText: expect.any(String) }),
    );
    expect(response.metadata.projectStateVersion).toBe(DRAFT_SUBJECT.version);
  });

  it("replays a validated typed output without provider or completion calls", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const text = serializeCanonicalJsonV1(JSON.parse(validCandidate));
    const hash = await sha256Hex(text);
    const runStore = typedStore();
    runStore.claimV3.mockResolvedValueOnce({
      runId: RUN_ID,
      correlationId: CORRELATION_ID,
      status: "replayed",
      subject: DRAFT_SUBJECT,
      operationKind: "intent_detection",
      inputSchemaVersion: "unseenprompt.model-gateway-request.v3",
      outputSchemaVersion: "unseenprompt.model-output.intent_detection.v1",
      provider: "openai",
      model: "gpt-test",
      latencyMs: 42,
      inputTokens: 10,
      outputTokens: 20,
      retryCount: 1,
      estimatedCostMicros: 30,
      validationResult: "passed",
      errorCode: null,
      validatedOutputText: text,
      validatedOutputHash: hash,
    });
    const response = await createModelGateway(
      dependencies(primary, fallback, runStore, {
        digest: async (input) =>
          globalThis.crypto.subtle.digest("SHA-256", input as unknown as BufferSource),
      }),
    ).execute(typedRequest());

    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(response.metadata.replayed).toBe(true);
    expect(primary.generate).not.toHaveBeenCalled();
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(runStore.completeV3).not.toHaveBeenCalled();
  });

  it("rejects a forged typed replay subject, hash, or noncanonical output", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const text = serializeCanonicalJsonV1(JSON.parse(validCandidate));
    const runStore = typedStore();
    runStore.claimV3.mockResolvedValueOnce({
      runId: RUN_ID,
      correlationId: CORRELATION_ID,
      status: "replayed",
      subject: { ...DRAFT_SUBJECT, version: 5 },
      operationKind: "intent_detection",
      inputSchemaVersion: "unseenprompt.model-gateway-request.v3",
      outputSchemaVersion: "unseenprompt.model-output.intent_detection.v1",
      provider: "openai",
      model: "gpt-test",
      latencyMs: 42,
      inputTokens: 10,
      outputTokens: 20,
      retryCount: 1,
      estimatedCostMicros: 30,
      validationResult: "passed",
      errorCode: null,
      validatedOutputText: text,
      validatedOutputHash: await sha256Hex(text),
    });

    await expect(
      createModelGateway(
        dependencies(primary, fallback, runStore, {
          digest: async (input) =>
            globalThis.crypto.subtle.digest("SHA-256", input as unknown as BufferSource),
        }),
      ).execute(typedRequest()),
    ).rejects.toMatchObject({ code: "persistence_failed" });
    expect(primary.generate).not.toHaveBeenCalled();
    expect(runStore.completeV3).not.toHaveBeenCalled();
  });

  it("rejects draft operations other than intent detection and missing v3 ports before provider work", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = store();
    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(
        typedRequest({
          operation: "discovery_sufficiency",
          schema: getModelOutputSchema("discovery_sufficiency"),
        }),
      ),
    ).rejects.toMatchObject({ code: "configuration_error" });
    await expect(
      createModelGateway(dependencies(primary, fallback, runStore)).execute(typedRequest()),
    ).rejects.toMatchObject({ code: "configuration_error" });
    expect(primary.generate).not.toHaveBeenCalled();
    expect(runStore.claim).not.toHaveBeenCalled();
  });

  it("accepts both project v3 operation pairs and rejects project intent or project delta before claim", async () => {
    const sufficiencyPrimary = adapter("anthropic", [validSufficiencyCandidate]);
    const sufficiencyFallback = adapter("openai", []);
    const sufficiencyStore = typedStore("discovery_sufficiency");
    const sufficiency = await createModelGateway(
      typedDependencies(sufficiencyPrimary, sufficiencyFallback, sufficiencyStore),
    ).execute(typedProjectRequest("discovery_sufficiency"));
    expect(sufficiency.data).toEqual(JSON.parse(validSufficiencyCandidate));
    expect(sufficiencyStore.claimV3).toHaveBeenCalledTimes(1);

    const questionPrimary = adapter("anthropic", [validQuestionCandidate]);
    const questionFallback = adapter("openai", []);
    const questionStore = typedStore("clarification_question");
    const question = await createModelGateway(
      typedDependencies(questionPrimary, questionFallback, questionStore),
    ).execute(typedProjectRequest("clarification_question"));
    expect(question.data).toEqual(JSON.parse(validQuestionCandidate));
    expect(questionStore.claimV3).toHaveBeenCalledTimes(1);

    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = typedStore();
    await expect(
      createModelGateway(typedDependencies(primary, fallback, runStore)).execute(
        typedRequest({
          subject: PROJECT_SUBJECT,
          operation: "intent_detection",
          schema: getModelOutputSchema("intent_detection"),
        } as never),
      ),
    ).rejects.toMatchObject({ code: "configuration_error" });
    await expect(
      createModelGateway(typedDependencies(primary, fallback, runStore)).execute(
        typedRequest({
          subject: PROJECT_SUBJECT,
          operation: "project_delta",
          schema: getModelOutputSchema("project_delta"),
        } as never),
      ),
    ).rejects.toMatchObject({ code: "configuration_error" });
    expect(runStore.claimV3).not.toHaveBeenCalled();
    expect(primary.generate).not.toHaveBeenCalled();
    expect(fallback.generate).not.toHaveBeenCalled();
  });

  it("does not request typed historical replay and rejects a stale v3 subject claim", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = typedStore();
    runStore.claimV3.mockResolvedValueOnce({
      runId: RUN_ID,
      correlationId: CORRELATION_ID,
      status: "running",
      subject: { ...DRAFT_SUBJECT, version: DRAFT_SUBJECT.version + 1 },
      operationKind: "intent_detection",
      inputSchemaVersion: "unseenprompt.model-gateway-request.v3",
      outputSchemaVersion: "unseenprompt.model-output.intent_detection.v1",
    });

    await expect(
      createModelGateway(typedDependencies(primary, fallback, runStore)).execute(
        typedRequest({ logicalIdempotencyFingerprint: "ab".repeat(32) }),
      ),
    ).rejects.toMatchObject({ code: "persistence_failed" });
    expect(runStore.claimV3.mock.calls[0]?.[0]).not.toHaveProperty("allowHistoricalReplay");
    expect(primary.generate).not.toHaveBeenCalled();
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(runStore.completeV3).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "wrong subject kind",
      overrides: { subject: PROJECT_SUBJECT },
    },
    {
      name: "wrong subject version",
      overrides: { subject: { ...DRAFT_SUBJECT, version: 5 } },
    },
    {
      name: "wrong operation echo",
      overrides: {
        operationKind: "discovery_sufficiency" as const,
        outputSchemaVersion: "unseenprompt.model-output.discovery_sufficiency.v1",
      },
    },
    {
      name: "wrong schema echo",
      overrides: { outputSchemaVersion: "unseenprompt.model-output.discovery_sufficiency.v1" },
    },
    {
      name: "wrong output hash",
      overrides: { validatedOutputHash: "00".repeat(32) },
    },
    {
      name: "failed success echo",
      overrides: { validationResult: "failed" as never },
    },
    {
      name: "noncanonical output",
      overrides: {
        validatedOutputText: JSON.stringify(JSON.parse(validCandidate)),
        validatedOutputHash: "placeholder",
      },
    },
  ])("fails closed for typed replay $name before provider or completion", async ({ overrides }) => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const runStore = typedStore();
    const replayOverrides = { ...overrides } as Partial<
      Extract<GenerationRunClaimV3, { status: "replayed" }>
    >;
    const normalizedReplayOverrides =
      replayOverrides.validatedOutputText === undefined
        ? replayOverrides
        : {
            ...replayOverrides,
            validatedOutputHash: await sha256Hex(replayOverrides.validatedOutputText),
          };
    runStore.claimV3.mockResolvedValueOnce(
      await typedReplayClaim("intent_detection", normalizedReplayOverrides),
    );

    await expect(
      createModelGateway(typedDependencies(primary, fallback, runStore)).execute(typedRequest()),
    ).rejects.toMatchObject({ code: "persistence_failed" });
    expect(primary.generate).not.toHaveBeenCalled();
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(runStore.completeV3).not.toHaveBeenCalled();
  });

  it("rejects exactly-bound and multibyte-overflow typed replay payloads before provider work", async () => {
    const payloads = [
      "x".repeat(MAX_VALIDATED_OUTPUT_BYTES),
      `${"😀".repeat(MAX_VALIDATED_OUTPUT_BYTES / 4)}x`,
    ];
    for (const payload of payloads) {
      const primary = adapter("anthropic", [validCandidate]);
      const fallback = adapter("openai", [validCandidate]);
      const runStore = typedStore();
      runStore.claimV3.mockResolvedValueOnce(
        await typedReplayClaim("intent_detection", {
          validatedOutputText: payload,
          validatedOutputHash: await sha256Hex(payload),
        }),
      );

      await expect(
        createModelGateway(typedDependencies(primary, fallback, runStore)).execute(typedRequest()),
      ).rejects.toMatchObject({ code: "persistence_failed" });
      expect(primary.generate).not.toHaveBeenCalled();
      expect(runStore.completeV3).not.toHaveBeenCalled();
    }
  });

  it("retries typed completion persistence once without replaying the provider", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = typedStore();
    runStore.completeV3.mockRejectedValueOnce(
      createModelGatewayError("persistence_failed", CORRELATION_ID),
    );

    const response = await createModelGateway(
      typedDependencies(primary, fallback, runStore),
    ).execute(typedRequest());
    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(primary.generate).toHaveBeenCalledTimes(1);
    expect(runStore.completeV3).toHaveBeenCalledTimes(2);
  });

  it("fails closed on a typed completion echo mismatch without replaying the provider", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", []);
    const runStore = typedStore();
    runStore.completeV3.mockImplementationOnce(async (input) => ({
      ...input,
      correlationId: CORRELATION_ID,
      subject: input.subject,
      operationKind: "discovery_sufficiency",
      inputSchemaVersion: "unseenprompt.model-gateway-request.v3",
      outputSchemaVersion: "unseenprompt.model-output.discovery_sufficiency.v1",
      validatedOutputText: input.validatedOutputText ?? null,
      validatedOutputHash:
        input.validatedOutputText === undefined || input.validatedOutputText === null
          ? null
          : await sha256Hex(input.validatedOutputText),
    }));

    await expect(
      createModelGateway(typedDependencies(primary, fallback, runStore)).execute(typedRequest()),
    ).rejects.toMatchObject({ code: "persistence_failed" });
    expect(primary.generate).toHaveBeenCalledTimes(1);
    expect(runStore.completeV3).toHaveBeenCalledTimes(1);
  });

  it("preserves typed abort and caller-deadline behavior before claim", async () => {
    const primary = adapter("anthropic", [validCandidate]);
    const fallback = adapter("openai", [validCandidate]);
    const abortedStore = typedStore();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createModelGateway(typedDependencies(primary, fallback, abortedStore)).execute(
        typedRequest({ signal: controller.signal }),
      ),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(abortedStore.claimV3).not.toHaveBeenCalled();
    expect(primary.generate).not.toHaveBeenCalled();

    let clock = 100;
    const deadlineStore = typedStore();
    await expect(
      createModelGateway(
        typedDependencies(primary, fallback, deadlineStore, {
          now: () => {
            const current = clock;
            clock += 1_001;
            return current;
          },
        }),
      ).execute(typedRequest({ deadlineMs: 1_000 })),
    ).rejects.toMatchObject({ code: "deadline_exceeded" });
    expect(deadlineStore.claimV3).not.toHaveBeenCalled();
  });

  it("preserves typed retry, repair, fallback, reviewer, and diagnostic privacy behavior", async () => {
    const malformed = `bad-${"MODEL_PRIVATE_SENTINEL"}`;
    const primary = adapter("anthropic", [malformed, "still-bad"]);
    const fallback = adapter("openai", [validCandidate]);
    const reviewer = adapter("gemini", [validCandidate]);
    const runStore = typedStore();
    const events: unknown[] = [];
    const reviewerEnvironment = {
      ...environment,
      reviewer: {
        provider: "gemini" as const,
        model: "reviewer-test",
        inputCostMicrosPerMillionTokens: 1,
        outputCostMicrosPerMillionTokens: 1,
      },
    } satisfies ModelEnvironment;

    const response = await createModelGateway(
      typedDependencies(primary, fallback, runStore, {
        environment: reviewerEnvironment,
        adapters: { anthropic: primary, openai: fallback, gemini: reviewer },
        logger: { log: (event) => events.push(event) },
        sleep: async () => undefined,
      }),
    ).execute(
      typedRequest({
        reviewPolicy: "required",
        input: "PRIVATE_INPUT_SENTINEL",
        systemInstruction: "PRIVATE_SYSTEM_SENTINEL",
      }),
    );

    expect(response.data).toEqual(JSON.parse(validCandidate));
    expect(response.metadata.calls.map((call) => call.kind)).toEqual([
      "primary",
      "repair",
      "fallback",
      "reviewer",
    ]);
    expect(JSON.stringify(events)).not.toContain("MODEL_PRIVATE_SENTINEL");
    expect(JSON.stringify(events)).not.toContain("PRIVATE_INPUT_SENTINEL");
    expect(JSON.stringify(events)).not.toContain("PRIVATE_SYSTEM_SENTINEL");
  });
});
