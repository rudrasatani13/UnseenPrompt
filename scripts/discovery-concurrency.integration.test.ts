import { createHash, randomUUID } from "node:crypto";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

/**
 * Minimal two-session Phase 7 race. It is intentionally skipped unless an explicitly isolated
 * loopback database is supplied; the suite must never connect to shared staging or production.
 */
const connectionString = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
const canRun = (() => {
  if (!connectionString) return false;
  try {
    const parsed = new URL(connectionString);
    return (
      ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname.replace(/^\[|\]$/gu, "")) &&
      parsed.port === "54322" &&
      parsed.pathname === "/postgres" &&
      ["postgres:", "postgresql:"].includes(parsed.protocol)
    );
  } catch {
    return false;
  }
})();

const describeDatabase = canRun ? describe : describe.skip;
const ownerId = randomUUID();
const requestText = "Build a small private reading list for a family.​";
const idempotencyKey = `phase7-draft-race-${randomUUID()}`;
const requestFingerprint = createHash("sha256")
  .update(
    JSON.stringify({
      schema: "unseenprompt.composer-draft-input",
      schemaVersion: 1,
      initialRequestText: requestText,
      idempotencyKey,
    }),
  )
  .digest("hex");

async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5_000 });
  await client.connect();
  return client;
}

async function setAuth(client: pg.Client): Promise<void> {
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ownerId]);
  await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`);
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: ownerId, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}

async function createDraft(client: pg.Client): Promise<{
  readonly draftId: string;
  readonly version: number;
  readonly status: string;
  readonly replayed: boolean;
}> {
  await client.query("begin");
  await setAuth(client);
  try {
    const result = await client.query<{
      result: { draftId: string; version: number; status: string; replayed: boolean };
    }>(`select public.create_composer_draft_v1($1, $2, $3) as result`, [
      idempotencyKey,
      requestFingerprint,
      requestText,
    ]);
    await client.query("commit");
    const value = result.rows[0]?.result;
    if (!value) throw new Error("create_composer_draft_v1 returned no receipt");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

describeDatabase("Phase 7 discovery concurrency", () => {
  let bootstrap: pg.Client;

  beforeAll(async () => {
    bootstrap = await connect();
    await bootstrap.query("begin");
    await bootstrap.query(
      `insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
        $2, null, timezone('utc', now()), '{"provider":"email","providers":["email"]}', '{}',
        timezone('utc', now()), timezone('utc', now()), '', '', '', ''
      ) on conflict (id) do nothing`,
      [ownerId, `phase7-race-${ownerId}@users.invalid`],
    );
    await bootstrap.query(
      `insert into public.profiles (id, display_name)
       values ($1, 'Phase 7 Race IT User')
       on conflict (id) do nothing`,
      [ownerId],
    );
    await bootstrap.query("commit");
  }, 15_000);

  afterAll(async () => {
    if (!bootstrap) return;
    await bootstrap.query("begin");
    await bootstrap.query(`delete from public.composer_drafts where owner_id = $1`, [ownerId]);
    await bootstrap.query(`delete from public.idempotency_records where owner_id = $1`, [ownerId]);
    await bootstrap.query(`delete from public.profiles where id = $1`, [ownerId]);
    await bootstrap.query(`delete from auth.users where id = $1`, [ownerId]);
    await bootstrap.query("commit");
    await bootstrap.end();
  });

  test("two sessions create one owner-scoped draft with one replay", async () => {
    const clientA = await connect();
    const clientB = await connect();
    try {
      const [first, second] = await Promise.all([createDraft(clientA), createDraft(clientB)]);
      expect(first.draftId).toBe(second.draftId);
      expect(first.version).toBe(1);
      expect(second.version).toBe(1);
      expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
      const count = await bootstrap.query<{ count: number }>(
        `select count(*)::int as count from public.composer_drafts where owner_id = $1 and id = $2`,
        [ownerId, first.draftId],
      );
      expect(count.rows[0]?.count).toBe(1);
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });
});
