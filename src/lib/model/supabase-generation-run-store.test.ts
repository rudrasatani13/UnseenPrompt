import { describe, expect, it } from "vitest";

import type {
  ModelErrorCode,
  ModelExecutionSubject,
  ModelOperation,
  TypedModelOperation,
} from "@/domain/model/contracts";
import { serializeCanonicalJsonV1 } from "@/domain/project/commands";
import {
  GENERATION_RUN_INPUT_SCHEMA_VERSION,
  GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
  type GenerationRunClaimInput,
  type GenerationRunClaimInputV3,
  type GenerationRunCompletionInput,
  type GenerationRunCompletionInputV3,
} from "@/lib/model/generation-run-store";
import {
  createSupabaseGenerationRunStore,
  type ClaimGenerationRunRpcArgs,
  type ClaimGenerationRunRpcArgsV3,
  type CompleteGenerationRunRpcArgs,
  type CompleteGenerationRunRpcArgsV3,
  type GenerationRunRpcClient,
  type GenerationRunRpcResult,
} from "@/lib/model/supabase-generation-run-store";

const PROJECT_ID = "01000000-0000-4000-8000-000000000001";
const RUN_ID = "06000000-0000-4000-8000-000000000001";
const CORRELATION_ID = "07000000-0000-4000-8000-000000000001";
const DRAFT_ID = "02000000-0000-4000-8000-000000000001";
const OWNER_ID = "09000000-0000-4000-8000-000000000001";
const SUBJECT_VERSION = 7;
const OPERATION: ModelOperation = "intent_detection";
const OUTPUT_SCHEMA_VERSION = "unseenprompt.model-output.intent_detection.v1";
const TYPED_OUTPUT_TEXT = '{"mode":"new_build"}';
const SECRET = "secret-persistence-sentinel";
const PROJECT_DELTA_TEXT = serializeCanonicalJsonV1({
  summary: "A bounded proposal.",
  requirementProposals: [],
  decisionProposals: [],
  milestoneProposals: [],
  unresolvedConflicts: [],
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const claimInput: GenerationRunClaimInput = {
  projectId: PROJECT_ID,
  projectStateVersion: 3,
  idempotencyKey: "generation-key",
  requestFingerprint: "a".repeat(64),
  operationKind: OPERATION,
  inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
  outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
};

const draftSubject: ModelExecutionSubject = {
  kind: "composer_draft",
  id: DRAFT_ID,
  version: SUBJECT_VERSION,
};

const claimInputV3: GenerationRunClaimInputV3 = {
  subject: draftSubject,
  idempotencyKey: "generation-v3-key",
  requestFingerprint: "b".repeat(64),
  operationKind: "intent_detection",
  inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
  outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
};

const succeededInputV3: GenerationRunCompletionInputV3 = {
  runId: RUN_ID,
  status: "succeeded",
  subject: draftSubject,
  provider: "openai",
  model: "gpt-test",
  latencyMs: 42,
  inputTokens: 10,
  outputTokens: 20,
  retryCount: 1,
  estimatedCostMicros: 30,
  validationResult: "passed",
  errorCode: null,
  validatedOutputText: TYPED_OUTPUT_TEXT,
};

type RpcCall =
  | {
      readonly name: "claim_generation_run_v2_server";
      readonly args: ClaimGenerationRunRpcArgs;
    }
  | {
      readonly name: "complete_generation_run_v2_server";
      readonly args: CompleteGenerationRunRpcArgs;
    }
  | {
      readonly name: "claim_generation_run_v3_server";
      readonly args: ClaimGenerationRunRpcArgsV3;
    }
  | {
      readonly name: "complete_generation_run_v3_server";
      readonly args: CompleteGenerationRunRpcArgsV3;
    };

class FakeRpcClient implements GenerationRunRpcClient {
  readonly calls: RpcCall[] = [];
  private readonly responses: GenerationRunRpcResult[];
  private readonly thrown: unknown | undefined;

  constructor(
    options: {
      readonly responses?: readonly GenerationRunRpcResult[];
      readonly thrown?: unknown;
    } = {},
  ) {
    this.responses = [...(options.responses ?? [])];
    this.thrown = options.thrown;
  }

  rpc(
    functionName: "claim_generation_run_v2_server",
    args: ClaimGenerationRunRpcArgs,
  ): PromiseLike<GenerationRunRpcResult>;
  rpc(
    functionName: "complete_generation_run_v2_server",
    args: CompleteGenerationRunRpcArgs,
  ): PromiseLike<GenerationRunRpcResult>;
  rpc(
    functionName: "claim_generation_run_v3_server",
    args: ClaimGenerationRunRpcArgsV3,
  ): PromiseLike<GenerationRunRpcResult>;
  rpc(
    functionName: "complete_generation_run_v3_server",
    args: CompleteGenerationRunRpcArgsV3,
  ): PromiseLike<GenerationRunRpcResult>;
  rpc(
    functionName:
      | "claim_generation_run_v2_server"
      | "complete_generation_run_v2_server"
      | "claim_generation_run_v3_server"
      | "complete_generation_run_v3_server",
    args:
      | ClaimGenerationRunRpcArgs
      | CompleteGenerationRunRpcArgs
      | ClaimGenerationRunRpcArgsV3
      | CompleteGenerationRunRpcArgsV3,
  ): PromiseLike<GenerationRunRpcResult> {
    if (functionName === "claim_generation_run_v2_server") {
      this.calls.push({ name: functionName, args: args as ClaimGenerationRunRpcArgs });
    } else if (functionName === "complete_generation_run_v2_server") {
      this.calls.push({ name: functionName, args: args as CompleteGenerationRunRpcArgs });
    } else if (functionName === "claim_generation_run_v3_server") {
      this.calls.push({ name: functionName, args: args as ClaimGenerationRunRpcArgsV3 });
    } else {
      this.calls.push({ name: functionName, args: args as CompleteGenerationRunRpcArgsV3 });
    }
    if (this.thrown !== undefined) return Promise.reject(this.thrown);
    return Promise.resolve(this.responses.shift() ?? { data: [], error: null });
  }
}

function claimRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: RUN_ID,
    correlation_id: CORRELATION_ID,
    claim_status: "running",
    status: "running",
    project_state_version: claimInput.projectStateVersion,
    operation_kind: OPERATION,
    input_schema_version: GENERATION_RUN_INPUT_SCHEMA_VERSION,
    output_schema_version: OUTPUT_SCHEMA_VERSION,
    provider: null,
    model: null,
    latency_ms: null,
    input_tokens: null,
    output_tokens: null,
    retry_count: null,
    estimated_cost_micros: null,
    validation_result: "not_attempted",
    error_code: null,
    validated_project_delta_text: null,
    validated_project_delta_hash: null,
    ...overrides,
  };
}

async function replayedClaimRow(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return claimRow({
    claim_status: "replayed",
    status: "succeeded",
    operation_kind: "project_delta",
    output_schema_version: "unseenprompt.model-output.project_delta.v1",
    provider: "openai",
    model: "gpt-test",
    latency_ms: 42,
    input_tokens: 10,
    output_tokens: 20,
    retry_count: 1,
    estimated_cost_micros: 30,
    validation_result: "passed",
    error_code: null,
    validated_project_delta_text: PROJECT_DELTA_TEXT,
    validated_project_delta_hash: await sha256Hex(PROJECT_DELTA_TEXT),
    ...overrides,
  });
}

const succeededInput: GenerationRunCompletionInput = {
  runId: RUN_ID,
  status: "succeeded",
  provider: "openai",
  model: "gpt-test",
  latencyMs: 42,
  inputTokens: 10,
  outputTokens: 20,
  retryCount: 1,
  estimatedCostMicros: 30,
  validationResult: "passed",
  errorCode: null,
  validatedProjectDeltaText: null,
};

function completionRow(
  input: GenerationRunCompletionInput = succeededInput,
): Record<string, unknown> {
  return {
    run_id: RUN_ID,
    correlation_id: CORRELATION_ID,
    status: input.status,
    project_state_version: 3,
    operation_kind: OPERATION,
    input_schema_version: GENERATION_RUN_INPUT_SCHEMA_VERSION,
    output_schema_version: OUTPUT_SCHEMA_VERSION,
    provider: input.provider,
    model: input.model,
    latency_ms: input.latencyMs,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    retry_count: input.retryCount,
    estimated_cost_micros: input.estimatedCostMicros,
    validation_result: input.validationResult,
    error_code: input.errorCode,
    validated_project_delta_text: input.validatedProjectDeltaText ?? null,
    validated_project_delta_hash: null,
  };
}

function claimClient(overrides: Record<string, unknown> = {}): FakeRpcClient {
  return new FakeRpcClient({ responses: [{ data: [claimRow(overrides)], error: null }] });
}

function completionClient(
  input: GenerationRunCompletionInput = succeededInput,
  overrides: Record<string, unknown> = {},
): FakeRpcClient {
  return new FakeRpcClient({
    responses: [{ data: [completionRow(input)], error: null, ...overrides }],
  });
}

function claimRowV3(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: RUN_ID,
    correlation_id: CORRELATION_ID,
    claim_status: "running",
    status: "running",
    subject_kind: draftSubject.kind,
    subject_id: draftSubject.id,
    subject_version: draftSubject.version,
    project_state_version: draftSubject.version,
    operation_kind: claimInputV3.operationKind,
    input_schema_version: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
    output_schema_version: claimInputV3.outputSchemaVersion,
    provider: null,
    model: null,
    latency_ms: null,
    input_tokens: null,
    output_tokens: null,
    retry_count: null,
    estimated_cost_micros: null,
    validation_result: "not_attempted",
    error_code: null,
    validated_project_delta_text: null,
    validated_project_delta_hash: null,
    validated_output_text: null,
    validated_output_hash: null,
    ...overrides,
  };
}

async function replayedClaimRowV3(
  operation: TypedModelOperation = "intent_detection",
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const subject: ModelExecutionSubject =
    operation === "intent_detection"
      ? draftSubject
      : { kind: "project", id: PROJECT_ID, version: SUBJECT_VERSION };
  const outputText = TYPED_OUTPUT_TEXT;
  return {
    ...claimRowV3(),
    claim_status: "replayed",
    status: "succeeded",
    subject_kind: subject.kind,
    subject_id: subject.id,
    subject_version: subject.version,
    project_state_version: subject.version,
    operation_kind: operation,
    output_schema_version: `unseenprompt.model-output.${operation}.v1`,
    provider: "openai",
    model: "gpt-test",
    latency_ms: 42,
    input_tokens: 10,
    output_tokens: 20,
    retry_count: 1,
    estimated_cost_micros: 30,
    validation_result: "passed",
    error_code: null,
    validated_output_text: outputText,
    validated_output_hash: await sha256Hex(outputText),
    ...overrides,
  };
}

async function completionRowV3(
  input: GenerationRunCompletionInputV3 = succeededInputV3,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const operation =
    input.subject.kind === "composer_draft" ? "intent_detection" : "discovery_sufficiency";
  const outputText = input.validatedOutputText ?? null;
  return {
    run_id: input.runId,
    correlation_id: CORRELATION_ID,
    status: input.status,
    subject_kind: input.subject.kind,
    subject_id: input.subject.id,
    subject_version: input.subject.version,
    project_state_version: input.subject.version,
    operation_kind: operation,
    input_schema_version: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
    output_schema_version: `unseenprompt.model-output.${operation}.v1`,
    provider: input.provider,
    model: input.model,
    latency_ms: input.latencyMs,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    retry_count: input.retryCount,
    estimated_cost_micros: input.estimatedCostMicros,
    validation_result: input.validationResult,
    error_code: input.errorCode,
    validated_project_delta_text: null,
    validated_project_delta_hash: null,
    validated_output_text: outputText,
    validated_output_hash: outputText === null ? null : await sha256Hex(outputText),
    ...overrides,
  };
}

function expectPersistenceFailure(error: unknown): void {
  expect(error).toMatchObject({ code: "persistence_failed" });
  const serialized = JSON.stringify(error);
  expect(serialized).not.toContain(SECRET);
}

function v3Store(client: FakeRpcClient): {
  readonly claimV3: NonNullable<ReturnType<typeof createSupabaseGenerationRunStore>["claimV3"]>;
  readonly completeV3: NonNullable<
    ReturnType<typeof createSupabaseGenerationRunStore>["completeV3"]
  >;
} {
  const store = createSupabaseGenerationRunStore(client, {
    serverClient: client,
    ownerIdProvider: async () => OWNER_ID,
  });
  if (store.claimV3 === undefined || store.completeV3 === undefined) {
    throw new Error("v3 adapter methods are missing");
  }
  return { claimV3: store.claimV3, completeV3: store.completeV3 };
}

function testStore(client: FakeRpcClient) {
  return createSupabaseGenerationRunStore(client, {
    serverClient: client,
    ownerIdProvider: async () => OWNER_ID,
  });
}

describe("Supabase generation-run store", () => {
  it("requires an explicit owner-bound server client for every generation write", async () => {
    const client = new FakeRpcClient();
    const store = createSupabaseGenerationRunStore(client);

    await expect(store.claim(claimInput)).rejects.toMatchObject({ code: "persistence_failed" });
    await expect(store.claimV3?.(claimInputV3)).rejects.toMatchObject({
      code: "persistence_failed",
    });
    expect(client.calls).toHaveLength(0);
  });

  it("calls only the exact claim RPC with safe snake-case metadata", async () => {
    const client = claimClient();
    const store = testStore(client);

    await store.claim(claimInput);

    expect(client.calls).toHaveLength(1);
    const call = client.calls[0];
    expect(call).toMatchObject({ name: "claim_generation_run_v2_server" });
    if (call?.name !== "claim_generation_run_v2_server") throw new Error("unexpected RPC call");
    expect(call.args).toEqual({
      p_owner_id: OWNER_ID,
      p_project_id: PROJECT_ID,
      p_project_state_version: 3,
      p_idempotency_key: "generation-key",
      p_request_fingerprint: "a".repeat(64),
      p_operation_kind: OPERATION,
      p_input_schema_version: GENERATION_RUN_INPUT_SCHEMA_VERSION,
      p_output_schema_version: OUTPUT_SCHEMA_VERSION,
    });
    for (const forbidden of [
      "user_id",
      "prompt",
      "input",
      "output",
      "payload",
      "headers",
      "secret",
      "api_key",
      "json",
    ]) {
      expect(call.args).not.toHaveProperty(forbidden);
    }
  });

  it("maps a valid claim row to the neutral camelCase DTO", async () => {
    const client = claimClient();
    const result = await testStore(client).claim(claimInput);

    expect(result).toEqual({
      runId: RUN_ID,
      correlationId: CORRELATION_ID,
      status: "running",
      projectStateVersion: 3,
      operationKind: OPERATION,
      inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
    });
    expect(result).not.toHaveProperty("prompt");
    expect(result).not.toHaveProperty("output");
    expect(result).not.toHaveProperty("ownerId");
  });

  it("maps a strict replayed project-delta row with terminal aggregate metadata", async () => {
    const client = new FakeRpcClient({
      responses: [{ data: [await replayedClaimRow()], error: null }],
    });
    const result = await testStore(client).claim({
      ...claimInput,
      operationKind: "project_delta",
      outputSchemaVersion: "unseenprompt.model-output.project_delta.v1",
    });

    expect(result).toEqual({
      runId: RUN_ID,
      correlationId: CORRELATION_ID,
      status: "replayed",
      projectStateVersion: 3,
      operationKind: "project_delta",
      inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: "unseenprompt.model-output.project_delta.v1",
      provider: "openai",
      model: "gpt-test",
      latencyMs: 42,
      inputTokens: 10,
      outputTokens: 20,
      retryCount: 1,
      estimatedCostMicros: 30,
      validationResult: "passed",
      errorCode: null,
      validatedProjectDeltaText: PROJECT_DELTA_TEXT,
      validatedProjectDeltaHash: await sha256Hex(PROJECT_DELTA_TEXT),
    });
  });

  it.each([
    ["idempotency_conflict", "idempotency_conflict"],
    ["idempotency_in_progress", "idempotency_in_progress"],
    ["idempotency_replay_unavailable", "idempotency_replay_unavailable"],
    ["authentication_required", "authentication_failed"],
    ["project_not_found_or_not_owned", "permission_denied"],
  ] as const)("maps exact claim SQL message %s to %s", async (message, code) => {
    const client = new FakeRpcClient({
      responses: [{ data: [], error: { code: "P0001", message } }],
    });
    const result = testStore(client).claim(claimInput);

    await expect(result).rejects.toMatchObject({ code });
    expect(client.calls).toHaveLength(1);
  });

  it.each([
    "aborted",
    "deadline_exceeded",
    "attempt_timeout",
    "authentication_failed",
    "permission_denied",
    "billing_or_quota_exhausted",
    "rate_limited",
    "provider_unavailable",
    "invalid_provider_request",
    "model_not_found",
    "content_refused",
    "output_truncated",
    "invalid_output",
    "configuration_error",
    "persistence_failed",
    "provider_error",
  ] satisfies readonly ModelErrorCode[])("crosses safe terminal replay code %s", async (code) => {
    const client = new FakeRpcClient({
      responses: [{ data: [], error: { code: "P0001", message: code } }],
    });
    await expect(testStore(client).claim(claimInput)).rejects.toMatchObject({
      code,
    });
  });

  it("prefers an exact allowlisted SQL message over P0001 and never lets a thrown error spoof it", async () => {
    const returned = new FakeRpcClient({
      responses: [{ data: [], error: { code: "P0001", message: "idempotency_conflict" } }],
    });
    await expect(testStore(returned).claim(claimInput)).rejects.toMatchObject({
      code: "idempotency_conflict",
    });

    const thrown = new FakeRpcClient({ thrown: new Error("idempotency_in_progress") });
    const result = testStore(thrown).claim(claimInput);
    await expect(result).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
  });

  it("redacts unknown claim errors and network messages", async () => {
    const unknown = new FakeRpcClient({
      responses: [{ data: [], error: { code: "P0001", message: `${SECRET} unknown` } }],
    });
    const unknownResult = testStore(unknown).claim(claimInput);
    await expect(unknownResult).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });

    const network = new FakeRpcClient({ thrown: new TypeError(`network ${SECRET}`) });
    const networkResult = testStore(network).claim(claimInput);
    await expect(networkResult).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
  });

  const malformedClaimRows: readonly [unknown][] = [
    [],
    [claimRow(), claimRow()],
    [{ ...claimRow(), unexpected: SECRET }],
    [{ ...claimRow(), status: "failed" }],
    [{ ...claimRow(), run_id: "not-a-uuid" }],
    [{ ...claimRow(), output_schema_version: "unseenprompt.model-output.risk_flags.v1" }],
  ].map((rows) => [rows] as const);

  it.each(malformedClaimRows)("fails closed for malformed claim rows", async (rows: unknown) => {
    const client = new FakeRpcClient({ responses: [{ data: rows, error: null }] });
    const result = testStore(client).claim(claimInput);
    await expect(result).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
  });

  it.each([
    { unexpected: SECRET },
    { claim_status: "replayed", status: "succeeded", validated_project_delta_hash: null },
    { claim_status: "replayed", status: "succeeded", provider: null },
  ])("rejects malformed replay claim rows without widening the RPC DTO", async (overrides) => {
    const client = new FakeRpcClient({
      responses: [{ data: [await replayedClaimRow(overrides)], error: null }],
    });
    await expect(
      testStore(client).claim({
        ...claimInput,
        operationKind: "project_delta",
        outputSchemaVersion: "unseenprompt.model-output.project_delta.v1",
      }),
    ).rejects.toMatchObject({ code: "persistence_failed" });
  });

  it.each([
    { projectStateVersion: 4 },
    { operationKind: "risk_flags" as const },
    { inputSchemaVersion: "input.v2" as typeof GENERATION_RUN_INPUT_SCHEMA_VERSION },
    { outputSchemaVersion: "unseenprompt.model-output.risk_flags.v1" },
  ])("rejects forged claim echoes", async (overrides) => {
    const client = claimClient(overrides);
    const result = testStore(client).claim(claimInput);
    await expect(result).rejects.toMatchObject({ code: "persistence_failed" });
  });

  it("accepts a durable replay at its original state only with the non-persisted replay hint", async () => {
    const client = new FakeRpcClient({
      responses: [
        {
          data: [await replayedClaimRow({ project_state_version: 2 })],
          error: null,
        },
      ],
    });
    const result = await testStore(client).claim({
      ...claimInput,
      projectStateVersion: 3,
      operationKind: "project_delta",
      outputSchemaVersion: "unseenprompt.model-output.project_delta.v1",
      allowHistoricalReplay: true,
    });

    expect(result.status).toBe("replayed");
    expect(result.projectStateVersion).toBe(2);
    const call = client.calls[0];
    expect(call?.name).toBe("claim_generation_run_v2_server");
    if (call?.name !== "claim_generation_run_v2_server") throw new Error("unexpected RPC call");
    expect(call.args).not.toHaveProperty("allowHistoricalReplay");
  });

  it("never permits a running claim to bypass state-version binding", async () => {
    const client = claimClient({ project_state_version: 2 });
    const result = testStore(client).claim({
      ...claimInput,
      projectStateVersion: 3,
      allowHistoricalReplay: true,
    });
    await expect(result).rejects.toMatchObject({ code: "persistence_failed" });
  });

  it("rejects forged output schema versions before calling claim", async () => {
    const client = claimClient();
    const invalid = { ...claimInput, outputSchemaVersion: "wrong.v1" };
    const result = testStore(client).claim(invalid);

    await expect(result).rejects.toMatchObject({ code: "persistence_failed" });
    expect(client.calls).toHaveLength(0);
  });

  it("uses only terminal metadata for succeeded completion and maps the echoed row", async () => {
    const client = completionClient();
    const result = await testStore(client).complete(succeededInput);

    expect(result).toEqual({
      ...succeededInput,
      correlationId: CORRELATION_ID,
      projectStateVersion: 3,
      operationKind: OPERATION,
      inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
      validatedProjectDeltaText: null,
      validatedProjectDeltaHash: null,
    });
    expect(client.calls).toHaveLength(1);
    const call = client.calls[0];
    expect(call?.name).toBe("complete_generation_run_v2_server");
    if (call?.name !== "complete_generation_run_v2_server") throw new Error("unexpected RPC call");
    expect(call.args).toEqual({
      p_owner_id: OWNER_ID,
      p_run_id: RUN_ID,
      p_status: "succeeded",
      p_provider: "openai",
      p_model: "gpt-test",
      p_latency_ms: 42,
      p_input_tokens: 10,
      p_output_tokens: 20,
      p_retry_count: 1,
      p_estimated_cost_micros: 30,
      p_validation_result: "passed",
      p_error_code: null,
      p_validated_project_delta_text: null,
    });
    for (const forbidden of [
      "user_id",
      "prompt",
      "input",
      "output",
      "payload",
      "headers",
      "secret",
      "api_key",
      "json",
    ]) {
      expect(call.args).not.toHaveProperty(forbidden);
    }
  });

  it("sends the exact canonical project-delta text to v2 and accepts the database hash echo", async () => {
    const input: GenerationRunCompletionInput = {
      ...succeededInput,
      validatedProjectDeltaText: PROJECT_DELTA_TEXT,
    };
    const hash = await sha256Hex(PROJECT_DELTA_TEXT);
    const client = new FakeRpcClient({
      responses: [
        {
          data: [
            {
              ...completionRow(input),
              operation_kind: "project_delta",
              output_schema_version: "unseenprompt.model-output.project_delta.v1",
              validated_project_delta_text: PROJECT_DELTA_TEXT,
              validated_project_delta_hash: hash,
            },
          ],
          error: null,
        },
      ],
    });

    const result = await testStore(client).complete(input);
    expect(result.validatedProjectDeltaText).toBe(PROJECT_DELTA_TEXT);
    expect(result.validatedProjectDeltaHash).toBe(hash);
    const call = client.calls[0];
    expect(call?.name).toBe("complete_generation_run_v2_server");
    if (call?.name !== "complete_generation_run_v2_server") throw new Error("unexpected RPC call");
    expect(call.args.p_validated_project_delta_text).toBe(PROJECT_DELTA_TEXT);
    expect(JSON.stringify(call.args)).not.toContain("prompt");
  });

  it.each([
    {
      status: "failed" as const,
      provider: null,
      model: null,
      latencyMs: null,
      validationResult: "failed" as const,
      errorCode: "provider_error" as const,
    },
    {
      status: "canceled" as const,
      provider: null,
      model: null,
      latencyMs: null,
      validationResult: "not_attempted" as const,
      errorCode: "aborted" as const,
    },
  ])("accepts valid %s terminal completion", async (metadata) => {
    const input: GenerationRunCompletionInput = {
      ...succeededInput,
      ...metadata,
      inputTokens: null,
      outputTokens: null,
      retryCount: 0,
      estimatedCostMicros: null,
    };
    const client = completionClient(input);
    await expect(testStore(client).complete(input)).resolves.toMatchObject({
      status: metadata.status,
      errorCode: metadata.errorCode,
    });
  });

  it.each([
    { status: "running" as const },
    { provider: "cursor" as never },
    { model: "é".repeat(128) },
    { latencyMs: -1 },
    { inputTokens: Number.MAX_SAFE_INTEGER + 1 },
    { outputTokens: 1.5 },
    { retryCount: -1 },
    { estimatedCostMicros: -1 },
    { validationResult: "passed" as never, errorCode: "provider_error" as never },
    { errorCode: "idempotency_conflict" as never },
    { runId: "not-a-uuid" },
  ])("rejects invalid completion metadata before RPC (%j)", async (overrides) => {
    const client = completionClient();
    const input = { ...succeededInput, ...overrides } as GenerationRunCompletionInput;
    const result = testStore(client).complete(input);

    await expect(result).rejects.toMatchObject({ code: "persistence_failed" });
    expect(client.calls).toHaveLength(0);
  });

  it("rejects multibyte idempotency keys over the database byte bound before RPC", async () => {
    const client = claimClient();
    const input = { ...claimInput, idempotencyKey: "é".repeat(128) };
    const result = testStore(client).claim(input);

    await expect(result).rejects.toMatchObject({ code: "persistence_failed" });
    expect(client.calls).toHaveLength(0);
  });

  it("rejects a completion RPC error even when it includes valid-looking data", async () => {
    const client = new FakeRpcClient({
      responses: [{ data: [completionRow()], error: { code: "P0001", message: "database_down" } }],
    });
    const result = testStore(client).complete(succeededInput);

    await expect(result).rejects.toMatchObject({ code: "persistence_failed" });
  });

  it.each([
    { data: [], error: null },
    { data: [completionRow(), completionRow()], error: null },
    { data: [{ ...completionRow(), unexpected: SECRET }], error: null },
    { data: [{ ...completionRow(), status: "running" }], error: null },
    { data: [{ ...completionRow(), correlation_id: "not-a-uuid" }], error: null },
    { data: [{ ...completionRow(), output_schema_version: "wrong.v1" }], error: null },
    { data: [{ ...completionRow(), error_code: "idempotency_conflict" }], error: null },
  ])("fails closed for malformed completion rows", async (rpcResponse) => {
    const client = new FakeRpcClient({ responses: [rpcResponse] });
    const result = testStore(client).complete(succeededInput);

    await expect(result).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
  });

  it("maps completion network/unknown errors to persistence_failed without retry", async () => {
    const client = new FakeRpcClient({ thrown: new Error(`completion ${SECRET}`) });
    const result = testStore(client).complete(succeededInput);

    await expect(result).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
    expect(client.calls).toHaveLength(1);
  });

  it("accepts standard Supabase response metadata while requiring data and error", async () => {
    const client = new FakeRpcClient({
      responses: [
        {
          data: [claimRow()],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        } as GenerationRunRpcResult,
      ],
    });

    const claimed = await testStore(client).claim(claimInput);
    expect(claimed).toMatchObject({ runId: RUN_ID, status: "running" });
    expect(claimed).not.toHaveProperty("statusText");

    const missingData = new FakeRpcClient({
      responses: [{ error: null } as GenerationRunRpcResult],
    });
    await expect(testStore(missingData).claim(claimInput)).rejects.toMatchObject({
      code: "persistence_failed",
    });
  });

  it("calls the exact v3 claim RPC and maps a running subject-aware claim", async () => {
    const client = new FakeRpcClient({
      responses: [{ data: [claimRowV3()], error: null }],
    });
    const result = await v3Store(client).claimV3(claimInputV3);

    expect(result).toEqual({
      runId: RUN_ID,
      correlationId: CORRELATION_ID,
      status: "running",
      subject: draftSubject,
      operationKind: "intent_detection",
      inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
    });
    expect(client.calls).toHaveLength(1);
    const call = client.calls[0];
    expect(call?.name).toBe("claim_generation_run_v3_server");
    if (call?.name !== "claim_generation_run_v3_server") throw new Error("unexpected RPC call");
    expect(call.args).toEqual({
      p_owner_id: OWNER_ID,
      p_subject_kind: "composer_draft",
      p_subject_id: DRAFT_ID,
      p_subject_state_version: SUBJECT_VERSION,
      p_idempotency_key: "generation-v3-key",
      p_request_fingerprint: "b".repeat(64),
      p_operation_kind: "intent_detection",
      p_input_schema_version: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
      p_output_schema_version: OUTPUT_SCHEMA_VERSION,
    });
    expect(call.args).not.toHaveProperty("allowHistoricalReplay");
    for (const forbidden of ["user_id", "payload", "headers", "secret", "api_key"]) {
      expect(call.args).not.toHaveProperty(forbidden);
    }
  });

  it.each(["intent_detection", "discovery_sufficiency", "clarification_question"] as const)(
    "maps a strict v3 %s replay with its typed output pair",
    async (operation) => {
      const subject: ModelExecutionSubject =
        operation === "intent_detection"
          ? draftSubject
          : { kind: "project", id: PROJECT_ID, version: SUBJECT_VERSION };
      const input: GenerationRunClaimInputV3 = {
        subject,
        idempotencyKey: `replay-${operation}`,
        requestFingerprint: "c".repeat(64),
        operationKind: operation,
        inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
        outputSchemaVersion: `unseenprompt.model-output.${operation}.v1`,
      };
      const client = new FakeRpcClient({
        responses: [{ data: [await replayedClaimRowV3(operation)], error: null }],
      });

      const result = await v3Store(client).claimV3(input);
      expect(result).toMatchObject({
        runId: RUN_ID,
        correlationId: CORRELATION_ID,
        status: "replayed",
        subject,
        operationKind: operation,
        inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
        outputSchemaVersion: `unseenprompt.model-output.${operation}.v1`,
        provider: "openai",
        model: "gpt-test",
        validatedOutputText: TYPED_OUTPUT_TEXT,
        validatedOutputHash: await sha256Hex(TYPED_OUTPUT_TEXT),
      });
    },
  );

  it("calls the frozen 13-argument v3 completion RPC and verifies the output hash", async () => {
    const client = new FakeRpcClient({
      responses: [{ data: [await completionRowV3()], error: null }],
    });
    const result = await v3Store(client).completeV3(succeededInputV3);

    expect(result).toEqual({
      ...succeededInputV3,
      correlationId: CORRELATION_ID,
      operationKind: "intent_detection",
      inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION_V3,
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
      validatedOutputText: TYPED_OUTPUT_TEXT,
      validatedOutputHash: await sha256Hex(TYPED_OUTPUT_TEXT),
    });
    const call = client.calls[0];
    expect(call?.name).toBe("complete_generation_run_v3_server");
    if (call?.name !== "complete_generation_run_v3_server") throw new Error("unexpected RPC call");
    expect(call.args).toEqual({
      p_owner_id: OWNER_ID,
      p_run_id: RUN_ID,
      p_status: "succeeded",
      p_provider: "openai",
      p_model: "gpt-test",
      p_latency_ms: 42,
      p_input_tokens: 10,
      p_output_tokens: 20,
      p_retry_count: 1,
      p_estimated_cost_micros: 30,
      p_validation_result: "passed",
      p_error_code: null,
      p_validated_project_delta_text: null,
      p_validated_output_text: TYPED_OUTPUT_TEXT,
    });
    expect(Object.keys(call.args)).toHaveLength(14);
  });

  it("accepts a valid v3 failed completion without a replay output", async () => {
    const input: GenerationRunCompletionInputV3 = {
      ...succeededInputV3,
      status: "failed",
      provider: null,
      model: null,
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      retryCount: 0,
      estimatedCostMicros: null,
      validationResult: "failed",
      errorCode: "provider_error",
      validatedOutputText: null,
    };
    const client = new FakeRpcClient({
      responses: [{ data: [await completionRowV3(input)], error: null }],
    });
    await expect(v3Store(client).completeV3(input)).resolves.toMatchObject({
      status: "failed",
      errorCode: "provider_error",
      validatedOutputText: null,
      validatedOutputHash: null,
    });
  });

  it.each([
    { subject: { kind: "project", id: PROJECT_ID, version: SUBJECT_VERSION } },
    { operationKind: "project_delta" as never },
    { outputSchemaVersion: "wrong.v1" },
    { inputSchemaVersion: "unseenprompt.model-gateway-request.v2" as never },
    { allowHistoricalReplay: true as never },
  ])("rejects forged v3 claim input before RPC (%j)", async (overrides) => {
    const client = new FakeRpcClient();
    const input = { ...claimInputV3, ...overrides } as GenerationRunClaimInputV3;
    await expect(v3Store(client).claimV3(input)).rejects.toMatchObject({
      code: "persistence_failed",
    });
    expect(client.calls).toHaveLength(0);
  });

  it.each([
    { subject_id: PROJECT_ID },
    { subject_version: SUBJECT_VERSION + 1, project_state_version: SUBJECT_VERSION + 1 },
    { operation_kind: "project_delta" },
    { output_schema_version: "wrong.v1" },
    { validated_output_text: "tampered" },
    { validated_output_hash: "0".repeat(32) },
    { provider: null },
    { unexpected: SECRET },
  ])("rejects forged v3 claim rows safely (%j)", async (overrides) => {
    const client = new FakeRpcClient({
      responses: [{ data: [await replayedClaimRowV3("intent_detection", overrides)], error: null }],
    });
    await expect(
      v3Store(client).claimV3({
        ...claimInputV3,
        operationKind: "intent_detection",
        outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
  });

  it.each([
    { data: [], error: null },
    { data: [claimRowV3(), claimRowV3()], error: null },
    { data: [{ ...claimRowV3(), claim_status: "unknown" }], error: null },
    { data: [{ ...claimRowV3(), unexpected: SECRET }], error: null },
  ])("rejects duplicate or unknown v3 claim outcomes", async (rpcResponse) => {
    const client = new FakeRpcClient({ responses: [rpcResponse] });
    await expect(v3Store(client).claimV3(claimInputV3)).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
  });

  it.each([
    { subject_id: PROJECT_ID },
    { subject_version: SUBJECT_VERSION + 1, project_state_version: SUBJECT_VERSION + 1 },
    { operation_kind: "project_delta" },
    { output_schema_version: "wrong.v1" },
    { validated_output_text: "tampered" },
    { validated_output_hash: "0".repeat(32) },
    { provider: null },
    { unexpected: SECRET },
  ])("rejects forged v3 completion rows safely (%j)", async (overrides) => {
    const client = new FakeRpcClient({
      responses: [{ data: [await completionRowV3(succeededInputV3, overrides)], error: null }],
    });
    await expect(v3Store(client).completeV3(succeededInputV3)).rejects.toSatisfy(
      (error: unknown) => {
        expectPersistenceFailure(error);
        return true;
      },
    );
  });

  it("rejects a re-hashed but noncanonical v3 output", async () => {
    const noncanonical = '{"z":1,"a":2}';
    const client = new FakeRpcClient({
      responses: [
        {
          data: [
            await replayedClaimRowV3("intent_detection", {
              validated_output_text: noncanonical,
              validated_output_hash: await sha256Hex(noncanonical),
            }),
          ],
          error: null,
        },
      ],
    });
    await expect(v3Store(client).claimV3(claimInputV3)).rejects.toMatchObject({
      code: "persistence_failed",
    });
  });

  it("redacts v3 RPC throws and maps only allowlisted claim errors", async () => {
    const thrown = new FakeRpcClient({ thrown: new Error(`v3 ${SECRET}`) });
    await expect(v3Store(thrown).claimV3(claimInputV3)).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });

    const mapped = new FakeRpcClient({
      responses: [{ data: [], error: { code: "P0001", message: "draft_not_found" } }],
    });
    await expect(v3Store(mapped).claimV3(claimInputV3)).rejects.toMatchObject({
      code: "permission_denied",
    });

    const unknown = new FakeRpcClient({
      responses: [{ data: [], error: { code: "P0001", message: SECRET } }],
    });
    await expect(v3Store(unknown).claimV3(claimInputV3)).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
  });

  it("redacts v3 completion RPC errors and never trusts SQL content", async () => {
    const client = new FakeRpcClient({
      responses: [{ data: [await completionRowV3()], error: { code: "P0001", message: SECRET } }],
    });
    await expect(v3Store(client).completeV3(succeededInputV3)).rejects.toSatisfy(
      (error: unknown) => {
        expectPersistenceFailure(error);
        return true;
      },
    );
  });
});
