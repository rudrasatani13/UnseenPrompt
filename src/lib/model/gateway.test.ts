import { describe, expect, it, vi } from "vitest";

import { parseModelEnvironment, type ModelEnvironment } from "@/config/model/schema";
import { getModelOutputSchema } from "@/domain/model/schemas";
import { serializeCanonicalJsonV1 } from "@/domain/project/commands";
import type { ModelGatewayRequest } from "@/domain/model/contracts";
import { createModelGatewayError } from "@/lib/model/errors";
import { createModelGateway, type ModelGatewayDependencies } from "@/lib/model/gateway";
import type { DeadlineTimer } from "@/lib/model/deadline";
import { GENERATION_RUN_INPUT_SCHEMA_VERSION } from "@/lib/model/generation-run-store";
import type {
  GenerationRunClaim,
  GenerationRunClaimInput,
  GenerationRunCompletion,
  GenerationRunCompletionInput,
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
});
