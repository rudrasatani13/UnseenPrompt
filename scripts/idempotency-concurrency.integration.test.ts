import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

/**
 * True two-session concurrency against the isolated Supabase Postgres.
 *
 * Fail-closed: this suite is excluded from unit tests and only runs via
 * `pnpm test:db:concurrency`. A missing database is a hard failure so CI cannot
 * green without exercising concurrency.
 *
 * Connection (in priority order):
 * - SUPABASE_DB_URL / DATABASE_URL
 * - local default postgresql://postgres:postgres@127.0.0.1:54322/postgres
 */

const connectionString =
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const ownerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

async function connect(): Promise<pg.Client> {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5_000,
  });
  try {
    await client.connect();
    return client;
  } catch (error) {
    try {
      await client.end();
    } catch {
      // ignore close errors after a failed connect
    }
    throw error;
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

async function withAuth(client: pg.Client, sql: string, params: unknown[] = []) {
  await client.query("begin");
  await setAuth(client);
  try {
    const result = await client.query(sql, params);
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
  if (typeof pid !== "number") {
    throw new Error("failed to resolve pg_backend_pid()");
  }
  return pid;
}

/**
 * Wait until the given backend is blocked on a lock (not granted), proving it is
 * contending with another uncommitted session rather than running freely.
 */
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
        select 1
        from pg_locks
        where pid = $1
          and not granted
      ) as waiting
      `,
      [pid],
    );

    if (locks.rows[0]?.waiting) {
      return;
    }

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
    if (row?.wait_event_type === "Lock") {
      return;
    }

    await delay(25);
  }

  const snapshot = await observer.query(
    `
    select pid, state, wait_event_type, wait_event, left(query, 200) as query
    from pg_stat_activity
    where pid = $1
    `,
    [pid],
  );
  throw new Error(
    `backend ${pid} did not enter a lock wait within ${timeoutMs}ms; last activity=${JSON.stringify(snapshot.rows[0] ?? null)}`,
  );
}

describe("idempotency concurrency (two database sessions)", () => {
  let bootstrap: pg.Client;

  beforeAll(async () => {
    try {
      bootstrap = await connect();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Database unavailable at ${connectionString}. ` +
          `pnpm test:db:concurrency requires a live Supabase Postgres (CI database job). ` +
          `Original error: ${detail}`,
      );
    }

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
        'authenticated', 'authenticated', 'concurrent-it@users.invalid',
        null,
        timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        timezone('utc', now()), timezone('utc', now()), '', '', '', ''
      )
      on conflict (id) do nothing
      `,
      [ownerId],
    );
    await bootstrap.query(
      `
      insert into public.profiles (id, display_name)
      values ($1, 'Concurrent IT User')
      on conflict (id) do nothing
      `,
      [ownerId],
    );
    await bootstrap.query("commit");
  }, 15_000);

  afterAll(async () => {
    if (!bootstrap) {
      return;
    }
    await bootstrap.query("begin");
    await bootstrap.query(`delete from public.projects where owner_id = $1`, [ownerId]);
    await bootstrap.query(`delete from public.idempotency_records where owner_id = $1`, [ownerId]);
    await bootstrap.query(`delete from public.profiles where id = $1`, [ownerId]);
    await bootstrap.query(`delete from auth.users where id = $1`, [ownerId]);
    await bootstrap.query("commit");
    await bootstrap.end();
  });

  test("concurrent identical create_project: one winner, one replay, one project", async () => {
    const key = `concurrent-${randomUUID()}`;
    const fingerprint = `fp-${randomUUID()}`;
    const clientA = await connect();
    const clientB = await connect();

    try {
      const [resultA, resultB] = await Promise.all([
        withAuth(clientA, `select public.create_project($1, $2, $3, $4, null) as result`, [
          key,
          fingerprint,
          "Concurrent IT Project",
          "feature",
        ]),
        withAuth(clientB, `select public.create_project($1, $2, $3, $4, null) as result`, [
          key,
          fingerprint,
          "Concurrent IT Project",
          "feature",
        ]),
      ]);

      const payloadA = resultA.rows[0]?.result as {
        project_id: string;
        state_version: number;
        event_id: string;
        replayed: boolean;
      };
      const payloadB = resultB.rows[0]?.result as {
        project_id: string;
        state_version: number;
        event_id: string;
        replayed: boolean;
      };

      expect(payloadA.project_id).toBe(payloadB.project_id);
      expect(payloadA.event_id).toBe(payloadB.event_id);
      expect(payloadA.state_version).toBe(1);
      expect(payloadB.state_version).toBe(1);
      expect([payloadA.replayed, payloadB.replayed].sort()).toEqual([false, true]);

      const count = await bootstrap.query(
        `select count(*)::int as n from public.projects
         where owner_id = $1 and id = $2`,
        [ownerId, payloadA.project_id],
      );
      expect(count.rows[0]?.n).toBe(1);
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });

  test("concurrent different fingerprints: winner succeeds, loser conflicts", async () => {
    const key = `concurrent-fp-${randomUUID()}`;
    const clientA = await connect();
    const clientB = await connect();

    try {
      // Establish winner first so the second session is deterministic.
      const winner = await withAuth(
        clientA,
        `select public.create_project($1, $2, $3, $4, null) as result`,
        [key, "fp-winner", "FP Project", "bug"],
      );
      expect(winner.rows[0]?.result?.replayed).toBe(false);

      await expect(
        withAuth(clientB, `select public.create_project($1, $2, $3, $4, null) as result`, [
          key,
          "fp-loser",
          "FP Project",
          "bug",
        ]),
      ).rejects.toThrow(/idempotency_fingerprint_conflict/);
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });

  test("blocked successor wins after first claimant rolls back", async () => {
    const key = `concurrent-rollback-${randomUUID()}`;
    const fingerprint = `fp-rollback-${randomUUID()}`;
    const claimant = await connect();
    const successor = await connect();

    try {
      // Claimant holds an uncommitted in-progress row for the key.
      await claimant.query("begin");
      await claimant.query(
        `
        insert into public.idempotency_records (
          owner_id, scope, idempotency_key, request_fingerprint, status
        ) values ($1, 'lifecycle', $2, $3, 'in_progress')
        `,
        [ownerId, key, fingerprint],
      );

      // Successor starts create_project while the claim is still open; it must
      // block on SELECT ... FOR UPDATE of the uncommitted row.
      await successor.query("begin");
      await setAuth(successor);
      const successorPid = await backendPid(successor);

      const successorCreate = successor.query(
        `select public.create_project($1, $2, $3, $4, null) as result`,
        [key, fingerprint, "Recovered Concurrent Project", "test"],
      );

      // Attach a no-op catch so an early failure does not become an unhandled rejection
      // while we are still waiting for the lock observation.
      let successorSettledEarly: unknown;
      void successorCreate.catch((error: unknown) => {
        successorSettledEarly = error;
      });

      await waitUntilBackendIsLockWaiting(bootstrap, successorPid);

      if (successorSettledEarly) {
        throw successorSettledEarly;
      }

      // Release the claim only after the successor is proven to be waiting.
      await claimant.query("rollback");

      const recovered = await successorCreate;
      await successor.query("commit");

      expect(recovered.rows[0]?.result?.replayed).toBe(false);
      expect(recovered.rows[0]?.result?.state_version).toBe(1);
      expect(recovered.rows[0]?.result?.project_id).toBeTruthy();
    } finally {
      try {
        await claimant.query("rollback");
      } catch {
        // already rolled back / closed
      }
      try {
        await successor.query("rollback");
      } catch {
        // already committed / closed
      }
      await claimant.end();
      await successor.end();
    }
  });
});
