import { describe, expect, it } from "vitest";

import { canonicalizeProjectCommandV1 } from "@/domain/project/commands";
import { ProjectDomainError } from "@/domain/project/contracts";

import {
  createSupabaseProjectStateRepository,
  type ProjectStateSupabaseClient,
} from "./supabase-project-state-repository";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "44444444-4444-4444-8444-444444444444";
const RUN_ID = "55555555-5555-4555-8555-555555555555";
const REQUIREMENT_ID = "66666666-6666-4666-8666-666666666666";
const REQUIREMENT_ID_2 = "77777777-7777-4777-8777-777777777777";
const DECISION_ID = "88888888-8888-4888-8888-888888888888";
const DECISION_ID_2 = "99999999-9999-4999-8999-999999999999";
const MILESTONE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MILESTONE_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUMMARY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SUMMARY_ID_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DATE_1 = "2026-08-01T00:00:00.000Z";
const DATE_2 = "2026-08-02T00:00:00.000Z";

interface Fixtures {
  readonly project: unknown;
  readonly requirements: readonly unknown[];
  readonly decisions: readonly unknown[];
  readonly milestones: readonly unknown[];
  readonly summaries: readonly unknown[];
  readonly preferences: unknown;
  readonly override: unknown;
}

interface RpcResponse {
  readonly data: unknown;
  readonly error: unknown;
}

class FakeClient implements ProjectStateSupabaseClient {
  readonly rpcCalls: Array<{ readonly name: string; readonly args: unknown }> = [];
  readonly rpcResponses: RpcResponse[];
  readonly fixtures: Fixtures;

  constructor(fixtures: Fixtures = fixture(), rpcResponses: readonly RpcResponse[] = []) {
    this.fixtures = fixtures;
    this.rpcResponses = [...rpcResponses];
  }

  rpc(name: string, args: unknown): PromiseLike<RpcResponse> {
    this.rpcCalls.push({ name, args });
    const queued = this.rpcResponses.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (name === "get_project_state_snapshot_v1") {
      return Promise.resolve({
        data: {
          projection: this.fixtures.project,
          requirements: this.fixtures.requirements,
          decisions: this.fixtures.decisions,
          milestones: this.fixtures.milestones,
          summaries: this.fixtures.summaries,
          preferences: this.fixtures.preferences,
          project_preference_override: this.fixtures.override,
          recent_evidence: [],
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }
}

function projectRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PROJECT_ID,
    mode: "new_build",
    stage: "discovery",
    state_version: 3,
    selected_tool: null,
    active_milestone_id: MILESTONE_ID,
    blocker_summary: null,
    blocked_from_stage: null,
    archived_from_stage: null,
    archived_at: null,
    ...overrides,
  };
}

function requirementRow(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    project_id: PROJECT_ID,
    category: id === REQUIREMENT_ID ? "zeta" : "alpha",
    statement: id === REQUIREMENT_ID ? "Second requirement" : "First requirement",
    rationale: null,
    status: "confirmed",
    source_event_id: EVENT_ID,
    supersedes_requirement_id: null,
    confirmed_at: id === REQUIREMENT_ID ? DATE_2 : DATE_1,
    created_at: DATE_1,
    updated_at: DATE_2,
    ...overrides,
  };
}

function decisionRow(id: string): Record<string, unknown> {
  return {
    id,
    project_id: PROJECT_ID,
    decision_key: id === DECISION_ID ? "zeta" : "alpha",
    decision: "Use the typed state boundary",
    rationale: null,
    status: "confirmed",
    source_event_id: EVENT_ID,
    supersedes_decision_id: null,
    confirmed_at: id === DECISION_ID ? DATE_2 : DATE_1,
    created_at: DATE_1,
    updated_at: DATE_2,
  };
}

function milestoneRow(id: string, position: number): Record<string, unknown> {
  return {
    id,
    project_id: PROJECT_ID,
    position,
    title: `Milestone ${position}`,
    description: null,
    suggested_status: "pending",
    confirmed_status: null,
    confirmation_event_id: null,
    blocked_reason: null,
    created_at: DATE_1,
    updated_at: DATE_2,
  };
}

function summaryRow(
  id: string,
  kind: string,
  version: number,
  status: "current" | "superseded",
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    project_id: PROJECT_ID,
    summary_kind: kind,
    version,
    based_on_event_sequence: version,
    summary_text: `${kind} summary`,
    structured_facts: { version },
    status,
    created_at: DATE_2,
    ...overrides,
  };
}

function fixture(overrides: Partial<Fixtures> = {}): Fixtures {
  return {
    project: projectRow(),
    requirements: [requirementRow(REQUIREMENT_ID_2), requirementRow(REQUIREMENT_ID)],
    decisions: [decisionRow(DECISION_ID_2), decisionRow(DECISION_ID)],
    milestones: [milestoneRow(MILESTONE_ID_2, 2), milestoneRow(MILESTONE_ID, 1)],
    summaries: [
      summaryRow(SUMMARY_ID_2, "state", 1, "superseded"),
      summaryRow(SUMMARY_ID, "state", 2, "current"),
    ],
    preferences: {
      skill_level: "advanced",
      preferred_stack_behavior: "prefer_saved",
      preferred_stack: { frontend: "Next.js" },
      coding_style: { testing: "test_first" },
      deployment_preference: "cloudflare",
    },
    override: {
      skill_level: null,
      preferred_stack_behavior: null,
      preferred_stack: { backend: "Workers" },
      coding_style: { comments: "minimal" },
      deployment_preference: "vercel",
    },
    ...overrides,
  };
}

function commitResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project_id: PROJECT_ID,
    event_id: EVENT_ID,
    state_version: 4,
    replayed: false,
    ...overrides,
  };
}

function expectCode(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(ProjectDomainError);
  expect(error).toMatchObject({ code, message: code });
}

describe("Supabase project-state repository", () => {
  it("uses one owner-scoped snapshot RPC, assembles rows deterministically, and preserves preference provenance", async () => {
    const client = new FakeClient();
    const snapshot = await createSupabaseProjectStateRepository(client).getSnapshot(PROJECT_ID);

    expect(snapshot.requirements.map((row) => row.id)).toEqual([REQUIREMENT_ID_2, REQUIREMENT_ID]);
    expect(snapshot.decisions.map((row) => row.id)).toEqual([DECISION_ID_2, DECISION_ID]);
    expect(snapshot.milestones.map((row) => row.id)).toEqual([MILESTONE_ID, MILESTONE_ID_2]);
    expect(snapshot.summaries.map((row) => row.id)).toEqual([SUMMARY_ID, SUMMARY_ID_2]);
    expect(snapshot.effectivePreferences).toEqual({
      skillLevel: { value: "advanced", source: "global" },
      preferredStackBehavior: { value: "prefer_saved", source: "global" },
      preferredStack: { value: { backend: "Workers" }, source: "project" },
      codingStyle: { value: { comments: "minimal" }, source: "project" },
      deploymentPreference: { value: "vercel", source: "project" },
    });

    expect(client.rpcCalls).toEqual([
      {
        name: "get_project_state_snapshot_v1",
        args: { p_project_id: PROJECT_ID },
      },
    ]);
  });

  it("returns the same snapshot when the snapshot RPC changes row order", async () => {
    const first = await createSupabaseProjectStateRepository(new FakeClient()).getSnapshot(
      PROJECT_ID,
    );
    const reversed = fixture({
      requirements: [...fixture().requirements].reverse(),
      decisions: [...fixture().decisions].reverse(),
      milestones: [...fixture().milestones].reverse(),
      summaries: [...fixture().summaries].reverse(),
    });
    const second = await createSupabaseProjectStateRepository(new FakeClient(reversed)).getSnapshot(
      PROJECT_ID,
    );
    expect(second).toEqual(first);
  });

  it("rejects unknown row keys and cross-project rows without leaking provider data", async () => {
    const malformed = requirementRow(REQUIREMENT_ID, { unexpected: "secret" });
    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(fixture({ requirements: [malformed] })),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(
          fixture({
            requirements: [requirementRow(REQUIREMENT_ID, { project_id: OTHER_PROJECT_ID })],
          }),
        ),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    const snapshotWithUnknownRootKey = {
      projection: projectRow(),
      requirements: [],
      decisions: [],
      milestones: [],
      summaries: [],
      preferences: null,
      project_preference_override: null,
      recent_evidence: [],
      unexpected: "secret",
    };
    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(fixture(), [{ data: snapshotWithUnknownRootKey, error: null }]),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(
          fixture({
            requirements: [
              requirementRow(REQUIREMENT_ID),
              requirementRow(REQUIREMENT_ID.toUpperCase()),
            ],
          }),
        ),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });
  });

  it("does not manufacture effective preferences when the RLS-visible global row is absent", async () => {
    const snapshot = await createSupabaseProjectStateRepository(
      new FakeClient(fixture({ preferences: null })),
    ).getSnapshot(PROJECT_ID);
    expect(snapshot.effectivePreferences).toBeUndefined();
  });

  it("rejects malformed canonical state relationships before returning a snapshot", async () => {
    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(
          fixture({
            project: projectRow({ active_milestone_id: OTHER_PROJECT_ID }),
          }),
        ),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(
          fixture({
            milestones: [milestoneRow(MILESTONE_ID, 1), milestoneRow(MILESTONE_ID_2, 1)],
          }),
        ),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(
          fixture({
            requirements: [
              requirementRow(REQUIREMENT_ID, {
                supersedes_requirement_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                status: "proposed",
                confirmed_at: null,
              }),
            ],
          }),
        ),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(
          fixture({
            decisions: [decisionRow(DECISION_ID), decisionRow(DECISION_ID_2)].map((row, index) => ({
              ...row,
              decision_key: index === 0 ? "Architecture" : " architecture ",
            })),
          }),
        ),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(
          fixture({
            summaries: [
              summaryRow(SUMMARY_ID, "state\r\n", 1, "current"),
              summaryRow(SUMMARY_ID_2, "state\n", 2, "current"),
            ],
          }),
        ),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(
          fixture({
            requirements: [requirementRow(REQUIREMENT_ID, { source_event_id: null })],
          }),
        ),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(
          fixture({
            decisions: [{ ...decisionRow(DECISION_ID), source_event_id: null }],
          }),
        ),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    await expect(
      createSupabaseProjectStateRepository(
        new FakeClient(
          fixture({
            summaries: [
              summaryRow(SUMMARY_ID, "state", 1, "current", {
                structured_facts: { text: "x".repeat(70_000) },
              }),
            ],
          }),
        ),
      ).getSnapshot(PROJECT_ID),
    ).rejects.toMatchObject({ code: "persistence_failed" });
  });

  it("accepts the preserved blocked resume pair while archived", async () => {
    const snapshot = await createSupabaseProjectStateRepository(
      new FakeClient(
        fixture({
          project: projectRow({
            stage: "archived",
            blocked_from_stage: "ready_for_prompt",
            archived_from_stage: "blocked",
            blocker_summary: "Waiting for a user decision.",
            archived_at: DATE_2,
          }),
        }),
      ),
    ).getSnapshot(PROJECT_ID);
    expect(snapshot.projection).toMatchObject({
      stage: "archived",
      blockedFromStage: "ready_for_prompt",
      archivedFromStage: "blocked",
      blockerSummary: "Waiting for a user decision.",
    });
  });

  it("sends only exact command RPC arguments with a canonical fingerprint", async () => {
    const client = new FakeClient(fixture(), [{ data: commitResult(), error: null }]);
    const repository = createSupabaseProjectStateRepository(client);
    const command = {
      schema: "unseenprompt.project-command" as const,
      schemaVersion: 1 as const,
      projectId: PROJECT_ID,
      expectedStateVersion: 3,
      idempotencyKey: "lifecycle-key",
      command: { type: "change_mode" as const, mode: "feature" as const },
    };

    await repository.execute(command);

    expect(client.rpcCalls).toHaveLength(1);
    expect(client.rpcCalls[0]).toMatchObject({ name: "execute_project_command_v1" });
    const args = client.rpcCalls[0]?.args as Record<string, unknown>;
    expect(Object.keys(args).sort()).toEqual([
      "p_command",
      "p_expected_state_version",
      "p_idempotency_key",
      "p_project_id",
      "p_request_fingerprint",
    ]);
    expect(args.p_command).toEqual(command.command);
    expect(args.p_request_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("owner_id");
    expect(JSON.stringify(args)).not.toContain("actor");
    expect(JSON.stringify(args)).not.toContain("timestamp");
    const expected = await globalThis.crypto.subtle.digest(
      "SHA-256",
      canonicalizeProjectCommandV1(command) as unknown as BufferSource,
    );
    expect(args.p_request_fingerprint).toBe(
      [...new Uint8Array(expected)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    );
  });

  it("maps only stable errors and rejects malformed command/apply results", async () => {
    const staleClient = new FakeClient(fixture(), [
      { data: null, error: { message: "stale_state_version", details: "secret" } },
    ]);
    await expect(
      createSupabaseProjectStateRepository(staleClient).execute({
        schema: "unseenprompt.project-command",
        schemaVersion: 1,
        projectId: PROJECT_ID,
        expectedStateVersion: 3,
        idempotencyKey: "stale-key",
        command: { type: "change_mode", mode: "feature" },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectCode(error, "stale_state_version");
      expect(JSON.stringify(error)).not.toContain("secret");
      return true;
    });

    const malformedResultClient = new FakeClient(fixture(), [
      { data: [commitResult()], error: null },
    ]);
    await expect(
      createSupabaseProjectStateRepository(malformedResultClient).execute({
        schema: "unseenprompt.project-command",
        schemaVersion: 1,
        projectId: PROJECT_ID,
        expectedStateVersion: 3,
        idempotencyKey: "bad-result",
        command: { type: "change_mode", mode: "feature" },
      }),
    ).rejects.toMatchObject({ code: "persistence_failed" });

    const applyClient = new FakeClient(fixture(), [
      { data: commitResult({ replayed: true }), error: null },
    ]);
    await expect(
      createSupabaseProjectStateRepository(applyClient).applyValidatedDelta({
        projectId: PROJECT_ID,
        generationRunId: RUN_ID,
        expectedStateVersion: 3,
      }),
    ).resolves.toEqual({
      projectId: PROJECT_ID,
      eventId: EVENT_ID,
      stateVersion: 4,
      replayed: true,
    });
    expect(applyClient.rpcCalls[0]).toEqual({
      name: "apply_validated_project_delta_v1",
      args: {
        p_project_id: PROJECT_ID,
        p_generation_run_id: RUN_ID,
        p_expected_state_version: 3,
      },
    });
    const crossProjectReceiptClient = new FakeClient(fixture(), [
      { data: commitResult({ project_id: OTHER_PROJECT_ID }), error: null },
    ]);
    await expect(
      createSupabaseProjectStateRepository(crossProjectReceiptClient).applyValidatedDelta({
        projectId: PROJECT_ID,
        generationRunId: RUN_ID,
        expectedStateVersion: 3,
      }),
    ).rejects.toMatchObject({ code: "persistence_failed" });
    await expect(
      createSupabaseProjectStateRepository(new FakeClient()).applyValidatedDelta({
        projectId: PROJECT_ID,
        generationRunId: RUN_ID,
        expectedStateVersion: 3,
        ownerId: OTHER_PROJECT_ID,
      } as never),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });
});
