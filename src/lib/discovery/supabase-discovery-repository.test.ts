import { describe, expect, it } from "vitest";

import {
  COMPOSER_DRAFT_COMMAND_SCHEMA,
  COMPOSER_DRAFT_INPUT_SCHEMA,
  DISCOVERY_COMMAND_SCHEMA,
  DISCOVERY_SCHEMA_VERSION,
  DiscoveryDomainError,
} from "@/domain/discovery/contracts";
import { discoverySnapshotSchema, serializeCanonicalJsonV1 } from "@/domain/discovery/schemas";
import { questionFingerprintV1 } from "@/domain/discovery/policy";

import {
  createSupabaseDiscoveryRepository,
  type DiscoveryRpcClient,
  type DiscoveryRpcResult,
} from "./supabase-discovery-repository";

const PROJECT_ID = "01000000-0000-4000-8000-000000000001";
const DRAFT_ID = "02000000-0000-4000-8000-000000000001";
const SESSION_ID = "03000000-0000-4000-8000-000000000001";
const QUESTION_ID = "04000000-0000-4000-8000-000000000001";
const ANSWER_ID = "05000000-0000-4000-8000-000000000001";
const RUN_ID = "06000000-0000-4000-8000-000000000001";
const EVENT_ID = "07000000-0000-4000-8000-000000000001";
const CREATED_AT = "2026-01-01T00:00:00.000Z";

type RpcCall = { readonly name: string; readonly args: Record<string, unknown> };

function fakeRpc(response: DiscoveryRpcResult = { data: {}, error: null }): {
  readonly client: DiscoveryRpcClient;
  readonly calls: RpcCall[];
} {
  const calls: RpcCall[] = [];
  const client = {
    rpc: ((name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve(response);
    }) as unknown as DiscoveryRpcClient["rpc"],
  } as DiscoveryRpcClient;
  return { client, calls };
}

async function hash(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function snapshot(overrides: Record<string, unknown> = {}) {
  const questionText = "Who will use this?";
  return {
    projectId: PROJECT_ID,
    mode: "new_build",
    stage: "discovery",
    stateVersion: 3,
    initialRequestText: "Build a private notes app.",
    session: {
      id: SESSION_ID,
      projectId: PROJECT_ID,
      sourceDraftId: DRAFT_ID,
      status: "active",
      policyVersion: 1,
      activeQuestionId: null,
      latestAssessmentId: null,
      confirmedTurnCount: 2,
      blockCode: null,
      startedAt: CREATED_AT,
      completedAt: null,
      abandonedAt: null,
    },
    confirmedQuestions: [
      {
        id: QUESTION_ID,
        projectId: PROJECT_ID,
        sessionId: SESSION_ID,
        generationRunId: RUN_ID,
        position: 1,
        targetFactKey: "audience",
        basisStateVersion: 2,
        questionText,
        rationale: "The audience determines the workflow.",
        suggestedAnswers: [],
        allowsFreeText: true,
        questionFingerprint: questionFingerprintV1(questionText),
        status: "answered",
        createdAt: CREATED_AT,
        answeredAt: "2026-01-01T00:01:00.000Z",
        supersededAt: null,
      },
    ],
    confirmedAnswers: [
      {
        id: ANSWER_ID,
        projectId: PROJECT_ID,
        sessionId: SESSION_ID,
        questionId: QUESTION_ID,
        source: "free_text",
        answerText: "Field researchers",
        status: "confirmed",
        supersedesAnswerId: null,
        confirmationEventId: EVENT_ID,
        createdAt: "2026-01-01T00:01:00.000Z",
        supersededAt: null,
      },
    ],
    assessments: [],
    activeQuestion: null,
    ...overrides,
  };
}

describe("Supabase discovery repository", () => {
  it("uses exact create RPC args and a canonical request fingerprint", async () => {
    const response = {
      data: { draftId: DRAFT_ID, version: 1, status: "routing", replayed: false },
      error: null,
    };
    const fake = fakeRpc(response);
    const repository = createSupabaseDiscoveryRepository(fake.client);
    const input = {
      schema: COMPOSER_DRAFT_INPUT_SCHEMA,
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      initialRequestText: "Build a notes app.",
      idempotencyKey: "draft-key",
    } as const;

    await expect(repository.createComposerDraft(input)).resolves.toEqual(response.data);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({
      name: "create_composer_draft_v1",
      args: {
        p_idempotency_key: input.idempotencyKey,
        p_initial_request_text: input.initialRequestText,
      },
    });
    expect(fake.calls[0]?.args.p_request_fingerprint).toBe(
      await hash(
        serializeCanonicalJsonV1({
          schema: COMPOSER_DRAFT_INPUT_SCHEMA,
          schemaVersion: DISCOVERY_SCHEMA_VERSION,
          initialRequestText: input.initialRequestText,
          idempotencyKey: input.idempotencyKey,
        }),
      ),
    );
  });

  it("keeps apply_intent internal while public commands use the domain canonicalizer", async () => {
    const fake = fakeRpc({
      data: {
        draftId: DRAFT_ID,
        version: 2,
        status: "awaiting_confirmation",
        projectId: null,
        replayed: false,
      },
      error: null,
    });
    const repository = createSupabaseDiscoveryRepository(fake.client);
    await repository.applyIntent({
      draftId: DRAFT_ID,
      expectedVersion: 1,
      idempotencyKey: "apply-key",
      generationRunId: RUN_ID,
    });
    expect(fake.calls[0]).toMatchObject({
      name: "execute_composer_draft_command_v1",
      args: {
        p_draft_id: DRAFT_ID,
        p_expected_version: 1,
        p_idempotency_key: "apply-key",
        p_command: { type: "apply_intent", generationRunId: RUN_ID },
      },
    });
    expect(fake.calls[0]?.args.p_command).not.toHaveProperty("ownerId");
    expect(fake.calls[0]?.args.p_command).not.toHaveProperty("actorId");

    const publicFake = fakeRpc({
      data: {
        draftId: DRAFT_ID,
        version: 2,
        status: "abandoned",
        projectId: null,
        replayed: false,
      },
      error: null,
    });
    const publicRepository = createSupabaseDiscoveryRepository(publicFake.client);
    const envelope = {
      schema: COMPOSER_DRAFT_COMMAND_SCHEMA,
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      draftId: DRAFT_ID,
      expectedVersion: 1,
      idempotencyKey: "abandon-key",
      command: { type: "abandon_draft" },
    } as const;
    await publicRepository.executeComposerDraftCommand(envelope);
    expect(publicFake.calls[0]?.args.p_request_fingerprint).toBeTypeOf("string");
    expect(publicFake.calls[0]?.args.p_request_fingerprint).toHaveLength(64);
  });

  it("accepts both fresh and compact promotion replay receipts", async () => {
    const fresh = fakeRpc({
      data: {
        draftId: DRAFT_ID,
        version: 3,
        status: "promoted",
        projectId: PROJECT_ID,
        sessionId: SESSION_ID,
        stateVersion: 2,
        eventId: EVENT_ID,
        replayed: false,
      },
      error: null,
    });
    const envelope = {
      schema: COMPOSER_DRAFT_COMMAND_SCHEMA,
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      draftId: DRAFT_ID,
      expectedVersion: 2,
      idempotencyKey: "promote-key",
      command: { type: "confirm_and_promote", confirmedMode: "new_build", confirmedTitle: "Notes" },
    } as const;
    await expect(
      createSupabaseDiscoveryRepository(fresh.client).executeComposerDraftCommand(envelope),
    ).resolves.toMatchObject({
      replayed: false,
      sessionId: SESSION_ID,
    });

    const replay = fakeRpc({
      data: {
        draftId: DRAFT_ID,
        version: 3,
        status: "promoted",
        projectId: PROJECT_ID,
        replayed: true,
      },
      error: null,
    });
    await expect(
      createSupabaseDiscoveryRepository(replay.client).executeComposerDraftCommand(envelope),
    ).resolves.toEqual({
      draftId: DRAFT_ID,
      version: 3,
      status: "promoted",
      projectId: PROJECT_ID,
      replayed: true,
    });
  });

  it("requires the owner-facing initial request on retry_intent receipts", async () => {
    const fake = fakeRpc({
      data: {
        draftId: DRAFT_ID,
        version: 3,
        status: "routing",
        projectId: null,
        initialRequestText: "  Build a notes app.\n",
        replayed: false,
      },
      error: null,
    });
    const envelope = {
      schema: COMPOSER_DRAFT_COMMAND_SCHEMA,
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      draftId: DRAFT_ID,
      expectedVersion: 2,
      idempotencyKey: "retry-key",
      command: { type: "retry_intent" },
    } as const;
    await expect(
      createSupabaseDiscoveryRepository(fake.client).executeComposerDraftCommand(envelope),
    ).resolves.toMatchObject({ initialRequestText: "  Build a notes app.\n" });

    const malformed = fakeRpc({
      data: { draftId: DRAFT_ID, version: 3, status: "routing", projectId: null, replayed: false },
      error: null,
    });
    await expect(
      createSupabaseDiscoveryRepository(malformed.client).executeComposerDraftCommand(envelope),
    ).rejects.toMatchObject({ code: "persistence_failed" });
  });

  it("binds question target fact into the fingerprint without widening the exact RPC args", async () => {
    const fake = fakeRpc({
      data: { questionId: QUESTION_ID, stateVersion: 4, eventId: EVENT_ID, replayed: false },
      error: null,
    });
    const repository = createSupabaseDiscoveryRepository(fake.client);
    await repository.applyQuestion({
      projectId: PROJECT_ID,
      generationRunId: RUN_ID,
      targetFactKey: "audience",
      expectedStateVersion: 3,
      idempotencyKey: "question-key",
    });
    expect(fake.calls[0]).toMatchObject({
      name: "apply_discovery_question_v1",
      args: {
        p_project_id: PROJECT_ID,
        p_generation_run_id: RUN_ID,
        p_expected_state_version: 3,
        p_idempotency_key: "question-key",
      },
    });
    expect(fake.calls[0]?.args).not.toHaveProperty("p_target_fact_key");
    expect(fake.calls[0]?.args.p_request_fingerprint).toHaveLength(64);
  });

  it("accepts a valid owner-scoped snapshot and rejects cross-linked rows", async () => {
    const valid = fakeRpc({ data: snapshot(), error: null });
    await expect(
      createSupabaseDiscoveryRepository(valid.client).getSnapshot(PROJECT_ID),
    ).resolves.toMatchObject({
      projectId: PROJECT_ID,
      session: { id: SESSION_ID },
    });

    const malformed = fakeRpc({
      data: snapshot({
        confirmedQuestions: [
          {
            ...snapshot().confirmedQuestions[0],
            projectId: "11000000-0000-4000-8000-000000000001",
          },
        ],
      }),
      error: null,
    });
    await expect(
      createSupabaseDiscoveryRepository(malformed.client).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({
      code: "persistence_failed",
    });
  });

  it("rejects duplicate fingerprints, broken answer lineage, and invalid suggestion membership", async () => {
    const baseQuestion = snapshot().confirmedQuestions[0];
    const duplicate = fakeRpc({
      data: snapshot({
        confirmedQuestions: [
          baseQuestion,
          {
            ...baseQuestion,
            id: "09000000-0000-4000-8000-000000000001",
            position: 2,
          },
        ],
      }),
      error: null,
    });
    await expect(
      createSupabaseDiscoveryRepository(duplicate.client).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({
      code: "persistence_failed",
    });

    const brokenLineage = fakeRpc({
      data: snapshot({
        confirmedAnswers: [
          {
            ...snapshot().confirmedAnswers[0],
            supersedesAnswerId: "12000000-0000-4000-8000-000000000001",
          },
        ],
      }),
      error: null,
    });
    await expect(
      createSupabaseDiscoveryRepository(brokenLineage.client).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({
      code: "persistence_failed",
    });

    const invalidSuggestion = fakeRpc({
      data: snapshot({
        confirmedAnswers: [
          { ...snapshot().confirmedAnswers[0], source: "suggested", answerText: "not offered" },
        ],
      }),
      error: null,
    });
    await expect(
      createSupabaseDiscoveryRepository(invalidSuggestion.client).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({
      code: "persistence_failed",
    });
  });

  it("maps only stable safe SQL errors and redacts unknown provider errors", async () => {
    const safe = fakeRpc({ data: null, error: { code: "P0001", message: "stale_state_version" } });
    await expect(
      createSupabaseDiscoveryRepository(safe.client).completeDiscovery({
        projectId: PROJECT_ID,
        generationRunId: RUN_ID,
        expectedStateVersion: 3,
        idempotencyKey: "complete-key",
      }),
    ).rejects.toMatchObject({ code: "stale_state_version" });

    const secret = "private synthetic content";
    const unsafe = fakeRpc({
      data: null,
      error: { code: "P0001", message: secret, details: secret },
    });
    await expect(
      createSupabaseDiscoveryRepository(unsafe.client).completeDiscovery({
        projectId: PROJECT_ID,
        generationRunId: RUN_ID,
        expectedStateVersion: 3,
        idempotencyKey: "complete-key",
      }),
    ).rejects.toMatchObject({ code: "persistence_failed" });
    try {
      await createSupabaseDiscoveryRepository(unsafe.client).completeDiscovery({
        projectId: PROJECT_ID,
        generationRunId: RUN_ID,
        expectedStateVersion: 3,
        idempotencyKey: "complete-key",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(DiscoveryDomainError);
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("uses exact discovery command and completion receipts, including replay", async () => {
    const fake = fakeRpc({
      data: { projectId: PROJECT_ID, stateVersion: 4, eventId: EVENT_ID, replayed: true },
      error: null,
    });
    const repository = createSupabaseDiscoveryRepository(fake.client);
    const envelope = {
      schema: DISCOVERY_COMMAND_SCHEMA,
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      projectId: PROJECT_ID,
      expectedStateVersion: 3,
      idempotencyKey: "abandon-discovery",
      command: { type: "abandon_discovery" },
    } as const;
    await expect(repository.executeDiscoveryCommand(envelope)).resolves.toEqual({
      projectId: PROJECT_ID,
      stateVersion: 4,
      eventId: EVENT_ID,
      replayed: true,
    });
    expect(fake.calls[0]?.args).not.toHaveProperty("ownerId");
    expect(fake.calls[0]?.args).not.toHaveProperty("actorId");
  });

  it("rejects extra snapshot root keys before mapping any content", async () => {
    const fake = fakeRpc({ data: { ...snapshot(), injected: "synthetic" }, error: null });
    await expect(
      createSupabaseDiscoveryRepository(fake.client).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({
      code: "persistence_failed",
    });
    expect(
      discoverySnapshotSchema.safeParse({ ...snapshot(), injected: "synthetic" }).success,
    ).toBe(false);
  });
});
