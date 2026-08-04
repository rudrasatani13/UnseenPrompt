import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

/**
 * True two-session Phase 6 races against the isolated Supabase Postgres.
 *
 * This file is excluded from unit tests and is intentionally fail-closed: a missing database is a
 * CI failure, not a skipped test. Never point SUPABASE_DB_URL or DATABASE_URL at shared staging or
 * production; the test owner and all created rows are deleted in afterAll.
 */

const connectionString =
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ownerId = randomUUID();
const ownerEmail = `phase6-concurrent-${ownerId}@users.invalid`;
const createdProjectIds = new Set<string>();
const canonicalProjectDeltaText = JSON.stringify({
  summary: "A bounded project proposal.",
  requirementProposals: [
    {
      action: "add",
      reference: "",
      statement: "Users can sign in.",
      rationale: "Ownership is required.",
    },
  ],
  decisionProposals: [
    {
      action: "add",
      reference: "",
      statement: "Use a typed boundary.",
      rationale: "The boundary limits unsafe data.",
    },
  ],
  milestoneProposals: [
    {
      action: "add",
      reference: "",
      title: "First milestone",
      rationale: "Establish the foundation.",
    },
  ],
  unresolvedConflicts: [],
});

type CommandResult = {
  readonly project_id: string;
  readonly event_id: string;
  readonly state_version: number;
  readonly replayed: boolean;
};

type GenerationClaimResult = {
  readonly run_id: string;
  readonly correlation_id: string;
  readonly claim_status: "running" | "replayed";
  readonly status: "running" | "succeeded" | "failed" | "canceled";
  readonly project_state_version: string;
  readonly operation_kind: string;
  readonly input_schema_version: string;
  readonly output_schema_version: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly latency_ms: number | null;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly retry_count: number | null;
  readonly estimated_cost_micros: string | null;
  readonly validation_result: string | null;
  readonly error_code: string | null;
  readonly validated_project_delta_text: string | null;
  readonly validated_project_delta_hash: string | null;
};

type GenerationCompletionResult = Omit<GenerationClaimResult, "claim_status">;

type ApplyResult = {
  readonly project_id: string;
  readonly event_id: string;
  readonly state_version: number;
  readonly replayed: boolean;
};

function assertIsolatedConnectionTarget(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("invalid isolated database connection target");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !["127.0.0.1", "localhost", "::1"].includes(hostname) ||
    parsed.port !== "54322" ||
    parsed.pathname !== "/postgres" ||
    !["postgres:", "postgresql:"].includes(parsed.protocol)
  ) {
    throw new Error("database target must be loopback Postgres on port 54322 and /postgres");
  }
}

async function connect(): Promise<pg.Client> {
  assertIsolatedConnectionTarget(connectionString);
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5_000,
  });
  try {
    await client.connect();
    return client;
  } catch {
    try {
      await client.end();
    } catch {
      // Ignore close failures after a failed connection.
    }
    throw new Error("isolated database connection failed");
  }
}

async function setAuth(client: pg.Client): Promise<void> {
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ownerId]);
  await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`);
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: ownerId, role: "authenticated" }),
  ]);
  await client.query(`set local role authenticated`);
}

async function withAuth<T>(client: pg.Client, callback: () => Promise<T>): Promise<T> {
  await client.query("begin");
  await setAuth(client);
  try {
    const result = await callback();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function backendPid(client: pg.Client): Promise<number> {
  const result = await client.query<{ pid: number }>(`select pg_backend_pid() as pid`);
  const pid = result.rows[0]?.pid;
  if (typeof pid !== "number") throw new Error("failed to resolve pg_backend_pid()");
  return pid;
}

async function waitUntilBackendIsLockWaiting(
  observer: pg.Client,
  pid: number,
  timeoutMs = 8_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const locks = await observer.query<{ waiting: boolean }>(
      `
      select exists (
        select 1 from pg_locks where pid = $1 and not granted
      ) as waiting
      `,
      [pid],
    );
    if (locks.rows[0]?.waiting) return;

    const activity = await observer.query<{
      wait_event_type: string | null;
      wait_event: string | null;
      state: string | null;
    }>(
      `
      select wait_event_type, wait_event, state
      from pg_stat_activity
      where pid = $1
      `,
      [pid],
    );
    const row = activity.rows[0];
    if (row?.wait_event_type === "Lock") return;
    await delay(25);
  }

  const snapshot = await observer.query(
    `
    select pid, state, wait_event_type, wait_event
    from pg_stat_activity
    where pid = $1
    `,
    [pid],
  );
  throw new Error(
    `backend ${pid} did not enter a lock wait within ${timeoutMs}ms; ` +
      `last activity=${JSON.stringify(snapshot.rows[0] ?? null)}`,
  );
}

async function createProject(client: pg.Client): Promise<CommandResult> {
  return withAuth(client, async () => {
    const result = await client.query<{ result: CommandResult }>(
      `select public.create_project($1, $2, $3, $4, null) as result`,
      [
        `phase6-project-${randomUUID()}`,
        `phase6-fingerprint-${randomUUID()}`,
        "Phase 6 Concurrency Project",
        "feature",
      ],
    );
    const payload = result.rows[0]?.result;
    if (
      payload === undefined ||
      typeof payload.project_id !== "string" ||
      typeof payload.state_version !== "number"
    ) {
      throw new Error("create_project returned an invalid receipt");
    }
    createdProjectIds.add(payload.project_id);
    return payload;
  });
}

async function claimGenerationRun(
  client: pg.Client,
  projectId: string,
  expectedStateVersion: number,
  idempotencyKey: string,
  fingerprint: string,
): Promise<GenerationClaimResult> {
  const result = await client.query<GenerationClaimResult>(
    `
    select *
    from public.claim_generation_run_v2($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      projectId,
      expectedStateVersion,
      idempotencyKey,
      fingerprint,
      "project_delta",
      "unseenprompt.model-gateway-request.v1",
      "unseenprompt.model-output.project_delta.v1",
    ],
  );
  const payload = result.rows[0];
  if (payload === undefined) throw new Error("claim_generation_run_v2 returned no receipt");
  return payload;
}

async function completeGenerationRun(
  client: pg.Client,
  runId: string,
  validatedProjectDeltaText: string,
): Promise<GenerationCompletionResult> {
  const result = await client.query<GenerationCompletionResult>(
    `
    select *
    from public.complete_generation_run_v2(
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    `,
    [
      runId,
      "succeeded",
      "openai",
      "model-phase6",
      10,
      1,
      2,
      0,
      3,
      "passed",
      null,
      validatedProjectDeltaText,
    ],
  );
  const payload = result.rows[0];
  if (payload === undefined) {
    throw new Error("complete_generation_run_v2 returned no receipt");
  }
  return payload;
}

async function applyValidatedProjectDelta(
  client: pg.Client,
  projectId: string,
  runId: string,
  expectedStateVersion: number,
): Promise<ApplyResult> {
  const result = await client.query<{ result: ApplyResult }>(
    `select public.apply_validated_project_delta_v1($1, $2, $3) as result`,
    [projectId, runId, expectedStateVersion],
  );
  const payload = result.rows[0]?.result;
  if (payload === undefined) {
    throw new Error("apply_validated_project_delta_v1 returned no receipt");
  }
  return payload;
}

async function executeCommand(
  client: pg.Client,
  projectId: string,
  expectedStateVersion: number,
  idempotencyKey: string,
  fingerprint: string,
  command: Record<string, unknown>,
): Promise<CommandResult> {
  const result = await client.query<{ result: CommandResult }>(
    `select public.execute_project_command_v1($1, $2, $3, $4, $5::jsonb) as result`,
    [projectId, expectedStateVersion, idempotencyKey, fingerprint, JSON.stringify(command)],
  );
  const payload = result.rows[0]?.result;
  if (payload === undefined) throw new Error("execute_project_command_v1 returned no receipt");
  return payload;
}

async function lockProject(client: pg.Client, projectId: string): Promise<void> {
  await client.query("begin");
  await setAuth(client);
  await client.query(`select id from public.projects where id = $1 for update`, [projectId]);
}

async function projectEventSequence(
  client: pg.Client,
  projectId: string,
): Promise<readonly number[]> {
  const result = await withAuth(client, () =>
    client.query<{ sequence_number: number }>(
      `
      select sequence_number::int
      from public.project_events
      where project_id = $1
      order by sequence_number
      `,
      [projectId],
    ),
  );
  return result.rows.map((row) => row.sequence_number);
}

function expectDatabaseError(error: unknown, code: string): void {
  expect(error).toMatchObject({ code: "P0001", message: code });
}

describe("Phase 6 project-state concurrency (two database sessions)", () => {
  let bootstrap: pg.Client | undefined;

  const database = (): pg.Client => {
    if (!bootstrap) throw new Error("isolated database bootstrap is unavailable");
    return bootstrap;
  };

  beforeAll(async () => {
    try {
      assertIsolatedConnectionTarget(connectionString);
      bootstrap = await connect();
      await bootstrap.query("begin");
      await bootstrap.query(
        `
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change
        ) values (
          '00000000-0000-0000-0000-000000000000',
          $1,
          'authenticated', 'authenticated', $2,
          null,
          timezone('utc', now()), '{"provider":"email","providers":["email"]}', '{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), '', '', '', ''
        )
        `,
        [ownerId, ownerEmail],
      );
      await bootstrap.query(
        `
        insert into public.profiles (id, display_name)
        values ($1, 'Phase 6 Concurrent IT User')
        `,
        [ownerId],
      );
      await bootstrap.query("commit");
    } catch {
      await bootstrap?.query("rollback").catch(() => undefined);
      await bootstrap?.end().catch(() => undefined);
      bootstrap = undefined;
      throw new Error(
        "Database unavailable for the isolated loopback Postgres; " +
          "pnpm test:db:concurrency requires the CI database job",
      );
    }
  }, 15_000);

  afterAll(async () => {
    if (!bootstrap) return;
    try {
      await bootstrap.query("begin");
      if (createdProjectIds.size > 0) {
        await bootstrap.query(
          `delete from public.projects where owner_id = $1 and id = any($2::uuid[])`,
          [ownerId, [...createdProjectIds]],
        );
      }
      await bootstrap.query(`delete from public.idempotency_records where owner_id = $1`, [
        ownerId,
      ]);
      await bootstrap.query(`delete from public.profiles where id = $1`, [ownerId]);
      await bootstrap.query(`delete from auth.users where id = $1`, [ownerId]);
      await bootstrap.query("commit");
    } catch {
      await bootstrap.query("rollback").catch(() => undefined);
      throw new Error("isolated database concurrency cleanup failed");
    } finally {
      await bootstrap.end();
      bootstrap = undefined;
    }
  });

  test("serializes stale commands and keeps state/event sequence contiguous", async () => {
    const project = await createProject(database());
    const clientA = await connect();
    const clientB = await connect();

    try {
      await lockProject(clientA, project.project_id);
      await clientB.query("begin");
      await setAuth(clientB);
      const clientBPid = await backendPid(clientB);
      const waitingCommand = executeCommand(
        clientB,
        project.project_id,
        project.state_version,
        `phase6-stale-${randomUUID()}`,
        "a".repeat(64),
        { type: "transition_stage", to: "brief_confirmation" },
      );
      void waitingCommand.catch(() => undefined);

      await waitUntilBackendIsLockWaiting(database(), clientBPid);
      const winner = await executeCommand(
        clientA,
        project.project_id,
        project.state_version,
        `phase6-winner-${randomUUID()}`,
        "b".repeat(64),
        { type: "change_mode", mode: "bug" },
      );
      await clientA.query("commit");

      let staleError: unknown;
      try {
        await waitingCommand;
      } catch (error) {
        staleError = error;
      }
      await clientB.query("rollback");
      expectDatabaseError(staleError, "stale_state_version");
      expect(winner.replayed).toBe(false);
      expect(winner.state_version).toBe(project.state_version + 1);

      const sequence = await projectEventSequence(database(), project.project_id);
      expect(sequence).toEqual([1, winner.state_version]);
      const current = await withAuth(database(), () =>
        database().query<{ state_version: number }>(
          `select state_version::int from public.projects where id = $1`,
          [project.project_id],
        ),
      );
      expect(current.rows[0]?.state_version).toBe(winner.state_version);
    } finally {
      await clientA.query("rollback").catch(() => undefined);
      await clientB.query("rollback").catch(() => undefined);
      await clientA.end();
      await clientB.end();
    }
  }, 30_000);

  test("serializes same-key requests into one event and one replay", async () => {
    const project = await createProject(database());
    const clientA = await connect();
    const clientB = await connect();
    const idempotencyKey = `phase6-same-key-${randomUUID()}`;
    const fingerprint = "c".repeat(64);

    try {
      await lockProject(clientA, project.project_id);
      await clientB.query("begin");
      await setAuth(clientB);
      const clientBPid = await backendPid(clientB);
      const waitingCommand = executeCommand(
        clientB,
        project.project_id,
        project.state_version,
        idempotencyKey,
        fingerprint,
        { type: "change_mode", mode: "bug" },
      );
      void waitingCommand.catch(() => undefined);
      await waitUntilBackendIsLockWaiting(database(), clientBPid);

      const first = await executeCommand(
        clientA,
        project.project_id,
        project.state_version,
        idempotencyKey,
        fingerprint,
        { type: "change_mode", mode: "bug" },
      );
      await clientA.query("commit");
      const second = await waitingCommand;
      await clientB.query("commit");

      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.event_id).toBe(first.event_id);
      expect(second.state_version).toBe(first.state_version);

      const sequence = await projectEventSequence(database(), project.project_id);
      expect(sequence).toEqual([1, first.state_version]);
    } finally {
      await clientA.query("rollback").catch(() => undefined);
      await clientB.query("rollback").catch(() => undefined);
      await clientA.end();
      await clientB.end();
    }
  }, 30_000);

  test("serializes same-key project-delta generation and apply across two sessions", async () => {
    const project = await createProject(database());
    const clientA = await connect();
    const clientB = await connect();
    const idempotencyKey = `phase6-delta-${randomUUID()}`;
    const fingerprint = "d".repeat(64);
    let waitingClaim: Promise<GenerationClaimResult> | undefined;
    let waitingApply: Promise<ApplyResult> | undefined;

    try {
      await lockProject(clientA, project.project_id);
      await clientB.query("begin");
      await setAuth(clientB);
      const claimWaitingPid = await backendPid(clientB);
      waitingClaim = claimGenerationRun(
        clientB,
        project.project_id,
        project.state_version,
        idempotencyKey,
        fingerprint,
      );
      void waitingClaim.catch(() => undefined);
      await waitUntilBackendIsLockWaiting(database(), claimWaitingPid);

      const winnerClaim = await claimGenerationRun(
        clientA,
        project.project_id,
        project.state_version,
        idempotencyKey,
        fingerprint,
      );
      expect(winnerClaim.claim_status).toBe("running");
      expect(winnerClaim.status).toBe("running");
      const winnerCompletion = await completeGenerationRun(
        clientA,
        winnerClaim.run_id,
        canonicalProjectDeltaText,
      );
      expect(winnerCompletion.status).toBe("succeeded");
      expect(winnerCompletion.validated_project_delta_text).toBe(canonicalProjectDeltaText);
      await clientA.query("commit");

      if (!waitingClaim) throw new Error("generation replay session was not started");
      const replayClaim = await waitingClaim;
      await clientB.query("commit");
      expect(replayClaim.claim_status).toBe("replayed");
      expect(replayClaim.run_id).toBe(winnerClaim.run_id);
      expect(replayClaim.status).toBe("succeeded");
      expect(replayClaim.validated_project_delta_text).toBe(canonicalProjectDeltaText);

      await lockProject(clientA, project.project_id);
      await clientB.query("begin");
      await setAuth(clientB);
      const applyWaitingPid = await backendPid(clientB);
      waitingApply = applyValidatedProjectDelta(
        clientB,
        project.project_id,
        winnerClaim.run_id,
        project.state_version,
      );
      void waitingApply.catch(() => undefined);
      await waitUntilBackendIsLockWaiting(database(), applyWaitingPid);

      const freshApply = await applyValidatedProjectDelta(
        clientA,
        project.project_id,
        winnerClaim.run_id,
        project.state_version,
      );
      await clientA.query("commit");

      if (!waitingApply) throw new Error("apply replay session was not started");
      const replayApply = await waitingApply;
      await clientB.query("commit");

      expect(freshApply.replayed).toBe(false);
      expect(replayApply.replayed).toBe(true);
      expect(replayApply.event_id).toBe(freshApply.event_id);
      expect(replayApply.state_version).toBe(freshApply.state_version);
      expect(freshApply.project_id).toBe(project.project_id);

      const state = await withAuth(database(), () =>
        database().query<{ state_version: number }>(
          `select state_version::int from public.projects where id = $1`,
          [project.project_id],
        ),
      );
      expect(state.rows[0]?.state_version).toBe(2);

      const generationCount = await withAuth(database(), () =>
        database().query<{ count: number }>(
          `
          select count(*)::int as count
          from public.generation_runs
          where project_id = $1 and operation_kind = 'project_delta'
          `,
          [project.project_id],
        ),
      );
      expect(generationCount.rows[0]?.count).toBe(1);

      const applicationCount = await withAuth(database(), () =>
        database().query<{ count: number }>(
          `
          select count(*)::int as count
          from public.project_delta_applications
          where project_id = $1 and generation_run_id = $2
          `,
          [project.project_id, winnerClaim.run_id],
        ),
      );
      expect(applicationCount.rows[0]?.count).toBe(1);

      const events = await projectEventSequence(database(), project.project_id);
      expect(events).toEqual([1, 2]);
      const deltaEvents = await withAuth(database(), () =>
        database().query<{ event_id: string; sequence_number: number; actor_id: string | null }>(
          `
          select id as event_id, sequence_number::int, actor_id
          from public.project_events
          where project_id = $1 and event_type = 'project.delta_proposed'
          `,
          [project.project_id],
        ),
      );
      expect(deltaEvents.rows).toHaveLength(1);
      expect(deltaEvents.rows[0]?.event_id).toBe(freshApply.event_id);
      expect(deltaEvents.rows[0]?.sequence_number).toBe(2);
      expect(deltaEvents.rows[0]?.actor_id).toBe(ownerId);
    } finally {
      await clientA.query("rollback").catch(() => undefined);
      await clientB.query("rollback").catch(() => undefined);
      await clientA.end();
      await clientB.end();
    }
  }, 30_000);
});
