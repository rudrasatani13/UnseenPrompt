import { describe, expect, it } from "vitest";

import type { ModelErrorCode, ModelOperation } from "@/domain/model/contracts";
import {
  GENERATION_RUN_INPUT_SCHEMA_VERSION,
  type GenerationRunClaimInput,
  type GenerationRunCompletionInput,
} from "@/lib/model/generation-run-store";
import {
  createSupabaseGenerationRunStore,
  type ClaimGenerationRunRpcArgs,
  type CompleteGenerationRunRpcArgs,
  type GenerationRunRpcClient,
  type GenerationRunRpcResult,
} from "@/lib/model/supabase-generation-run-store";

const PROJECT_ID = "01000000-0000-4000-8000-000000000001";
const RUN_ID = "06000000-0000-4000-8000-000000000001";
const CORRELATION_ID = "07000000-0000-4000-8000-000000000001";
const OPERATION: ModelOperation = "intent_detection";
const OUTPUT_SCHEMA_VERSION = "unseenprompt.model-output.intent_detection.v1";
const SECRET = "secret-persistence-sentinel";

const claimInput: GenerationRunClaimInput = {
  projectId: PROJECT_ID,
  projectStateVersion: 3,
  idempotencyKey: "generation-key",
  requestFingerprint: "a".repeat(64),
  operationKind: OPERATION,
  inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
  outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
};

type RpcCall =
  | { readonly name: "claim_generation_run"; readonly args: ClaimGenerationRunRpcArgs }
  | { readonly name: "complete_generation_run"; readonly args: CompleteGenerationRunRpcArgs };

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
    functionName: "claim_generation_run",
    args: ClaimGenerationRunRpcArgs,
  ): PromiseLike<GenerationRunRpcResult>;
  rpc(
    functionName: "complete_generation_run",
    args: CompleteGenerationRunRpcArgs,
  ): PromiseLike<GenerationRunRpcResult>;
  rpc(
    functionName: "claim_generation_run" | "complete_generation_run",
    args: ClaimGenerationRunRpcArgs | CompleteGenerationRunRpcArgs,
  ): PromiseLike<GenerationRunRpcResult> {
    if (functionName === "claim_generation_run") {
      this.calls.push({ name: functionName, args: args as ClaimGenerationRunRpcArgs });
    } else {
      this.calls.push({ name: functionName, args: args as CompleteGenerationRunRpcArgs });
    }
    if (this.thrown !== undefined) return Promise.reject(this.thrown);
    return Promise.resolve(this.responses.shift() ?? { data: [], error: null });
  }
}

function claimRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: RUN_ID,
    correlation_id: CORRELATION_ID,
    status: "running",
    project_state_version: claimInput.projectStateVersion,
    operation_kind: OPERATION,
    input_schema_version: GENERATION_RUN_INPUT_SCHEMA_VERSION,
    output_schema_version: OUTPUT_SCHEMA_VERSION,
    ...overrides,
  };
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

function expectPersistenceFailure(error: unknown): void {
  expect(error).toMatchObject({ code: "persistence_failed" });
  const serialized = JSON.stringify(error);
  expect(serialized).not.toContain(SECRET);
}

describe("Supabase generation-run store", () => {
  it("calls only the exact claim RPC with safe snake-case metadata", async () => {
    const client = claimClient();
    const store = createSupabaseGenerationRunStore(client);

    await store.claim(claimInput);

    expect(client.calls).toHaveLength(1);
    const call = client.calls[0];
    expect(call).toMatchObject({ name: "claim_generation_run" });
    if (call?.name !== "claim_generation_run") throw new Error("unexpected RPC call");
    expect(call.args).toEqual({
      p_project_id: PROJECT_ID,
      p_project_state_version: 3,
      p_idempotency_key: "generation-key",
      p_request_fingerprint: "a".repeat(64),
      p_operation_kind: OPERATION,
      p_input_schema_version: GENERATION_RUN_INPUT_SCHEMA_VERSION,
      p_output_schema_version: OUTPUT_SCHEMA_VERSION,
    });
    for (const forbidden of [
      "owner_id",
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
    const result = await createSupabaseGenerationRunStore(client).claim(claimInput);

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
    const result = createSupabaseGenerationRunStore(client).claim(claimInput);

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
    await expect(createSupabaseGenerationRunStore(client).claim(claimInput)).rejects.toMatchObject({
      code,
    });
  });

  it("prefers an exact allowlisted SQL message over P0001 and never lets a thrown error spoof it", async () => {
    const returned = new FakeRpcClient({
      responses: [{ data: [], error: { code: "P0001", message: "idempotency_conflict" } }],
    });
    await expect(
      createSupabaseGenerationRunStore(returned).claim(claimInput),
    ).rejects.toMatchObject({
      code: "idempotency_conflict",
    });

    const thrown = new FakeRpcClient({ thrown: new Error("idempotency_in_progress") });
    const result = createSupabaseGenerationRunStore(thrown).claim(claimInput);
    await expect(result).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
  });

  it("redacts unknown claim errors and network messages", async () => {
    const unknown = new FakeRpcClient({
      responses: [{ data: [], error: { code: "P0001", message: `${SECRET} unknown` } }],
    });
    const unknownResult = createSupabaseGenerationRunStore(unknown).claim(claimInput);
    await expect(unknownResult).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });

    const network = new FakeRpcClient({ thrown: new TypeError(`network ${SECRET}`) });
    const networkResult = createSupabaseGenerationRunStore(network).claim(claimInput);
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
    const result = createSupabaseGenerationRunStore(client).claim(claimInput);
    await expect(result).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
  });

  it.each([
    { projectStateVersion: 4 },
    { operationKind: "risk_flags" as const },
    { inputSchemaVersion: "input.v2" as typeof GENERATION_RUN_INPUT_SCHEMA_VERSION },
    { outputSchemaVersion: "unseenprompt.model-output.risk_flags.v1" },
  ])("rejects forged claim echoes", async (overrides) => {
    const client = claimClient(overrides);
    const result = createSupabaseGenerationRunStore(client).claim(claimInput);
    await expect(result).rejects.toMatchObject({ code: "persistence_failed" });
  });

  it("rejects forged output schema versions before calling claim", async () => {
    const client = claimClient();
    const invalid = { ...claimInput, outputSchemaVersion: "wrong.v1" };
    const result = createSupabaseGenerationRunStore(client).claim(invalid);

    await expect(result).rejects.toMatchObject({ code: "persistence_failed" });
    expect(client.calls).toHaveLength(0);
  });

  it("uses only terminal metadata for succeeded completion and maps the echoed row", async () => {
    const client = completionClient();
    const result = await createSupabaseGenerationRunStore(client).complete(succeededInput);

    expect(result).toEqual({
      ...succeededInput,
      correlationId: CORRELATION_ID,
      projectStateVersion: 3,
      operationKind: OPERATION,
      inputSchemaVersion: GENERATION_RUN_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
    });
    expect(client.calls).toHaveLength(1);
    const call = client.calls[0];
    expect(call?.name).toBe("complete_generation_run");
    if (call?.name !== "complete_generation_run") throw new Error("unexpected RPC call");
    expect(call.args).toEqual({
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
    });
    for (const forbidden of [
      "owner_id",
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
    await expect(createSupabaseGenerationRunStore(client).complete(input)).resolves.toMatchObject({
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
    const result = createSupabaseGenerationRunStore(client).complete(input);

    await expect(result).rejects.toMatchObject({ code: "persistence_failed" });
    expect(client.calls).toHaveLength(0);
  });

  it("rejects multibyte idempotency keys over the database byte bound before RPC", async () => {
    const client = claimClient();
    const input = { ...claimInput, idempotencyKey: "é".repeat(128) };
    const result = createSupabaseGenerationRunStore(client).claim(input);

    await expect(result).rejects.toMatchObject({ code: "persistence_failed" });
    expect(client.calls).toHaveLength(0);
  });

  it("rejects a completion RPC error even when it includes valid-looking data", async () => {
    const client = new FakeRpcClient({
      responses: [{ data: [completionRow()], error: { code: "P0001", message: "database_down" } }],
    });
    const result = createSupabaseGenerationRunStore(client).complete(succeededInput);

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
    const result = createSupabaseGenerationRunStore(client).complete(succeededInput);

    await expect(result).rejects.toSatisfy((error: unknown) => {
      expectPersistenceFailure(error);
      return true;
    });
  });

  it("maps completion network/unknown errors to persistence_failed without retry", async () => {
    const client = new FakeRpcClient({ thrown: new Error(`completion ${SECRET}`) });
    const result = createSupabaseGenerationRunStore(client).complete(succeededInput);

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

    const claimed = await createSupabaseGenerationRunStore(client).claim(claimInput);
    expect(claimed).toMatchObject({ runId: RUN_ID, status: "running" });
    expect(claimed).not.toHaveProperty("statusText");

    const missingData = new FakeRpcClient({
      responses: [{ error: null } as GenerationRunRpcResult],
    });
    await expect(
      createSupabaseGenerationRunStore(missingData).claim(claimInput),
    ).rejects.toMatchObject({
      code: "persistence_failed",
    });
  });
});
