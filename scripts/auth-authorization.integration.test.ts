import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

interface OnboardingAnswers {
  readonly displayName: string | null;
  readonly skillLevel: "beginner" | "intermediate" | "advanced";
  readonly preferredStackBehavior: "recommend" | "prefer_saved" | "ask";
  readonly preferredStack: Record<string, string>;
  readonly codingStyle: Record<string, string>;
  readonly deploymentPreference: "cloudflare" | "vercel" | "traditional_server" | null;
  readonly locale: string;
  readonly timeZone: string;
}

/*
 * This suite deliberately talks to the local Data API instead of mocking it. It is only included
 * by vitest.db.config.mts, and CI exports the isolated stack's short-lived credentials immediately
 * before running it. Do not add fallback credentials here: a missing CI mapping must fail closed.
 */
function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for the Supabase authorization integration suite`);
  }

  return value;
}

const supabaseUrl = requiredEnvironment("SUPABASE_AUTH_TEST_URL");
const publishableKey = requiredEnvironment("SUPABASE_AUTH_TEST_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnvironment("SUPABASE_AUTH_TEST_SERVICE_ROLE_KEY");

function createTestClient(key = publishableKey) {
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function assertProviderSuccess(error: { message: string } | null, operation: string): void {
  if (error) {
    // Provider details can contain deployment-specific state; do not include them in CI output.
    throw new Error(`Supabase operation failed: ${operation}`);
  }
}

function assertDenied(result: { data: unknown; error: { message: string } | null }): void {
  const isInvisible = Array.isArray(result.data) && result.data.length === 0;
  expect(Boolean(result.error) || isInvisible).toBe(true);
}

const admin = createTestClient(serviceRoleKey);
const testRun = randomUUID();
const userAEmail = `auth-it-a-${testRun}@users.invalid`;
const userBEmail = `auth-it-b-${testRun}@users.invalid`;

let userAId = "";
let userBId = "";
let clientA: ReturnType<typeof createTestClient>;
let clientB: ReturnType<typeof createTestClient>;
let userBProjectId = "";
let userBOverrideId = "";

async function createMagicLinkSession(email: string) {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  assertProviderSuccess(link.error, "generate_magic_link");

  const client = createTestClient();
  const verified = await client.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "email",
  });
  assertProviderSuccess(verified.error, "verify_magic_link");

  return client;
}

async function ensureProfile(client: ReturnType<typeof createTestClient>, userId: string) {
  const result = await client
    .from("profiles")
    .upsert({ id: userId }, { ignoreDuplicates: true, onConflict: "id" });
  assertProviderSuccess(result.error, "ensure_profile");
}

/** Mirrors the endpoint's RLS-scoped, retry-safe write order without importing Next.js server code. */
async function completeOnboarding(
  client: ReturnType<typeof createTestClient>,
  userId: string,
  answers: OnboardingAnswers,
) {
  const preferences = await client.from("preferences").upsert(
    {
      owner_id: userId,
      skill_level: answers.skillLevel,
      preferred_stack_behavior: answers.preferredStackBehavior,
      preferred_stack: answers.preferredStack,
      coding_style: answers.codingStyle,
      deployment_preference: answers.deploymentPreference,
    },
    { onConflict: "owner_id" },
  );
  assertProviderSuccess(preferences.error, "complete_onboarding_preferences");

  const profile = await client
    .from("profiles")
    .update({
      display_name: answers.displayName,
      locale: answers.locale,
      time_zone: answers.timeZone,
    })
    .eq("id", userId);
  assertProviderSuccess(profile.error, "complete_onboarding_profile");

  const completion = await client
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId)
    .is("onboarding_completed_at", null);
  assertProviderSuccess(completion.error, "complete_onboarding_stamp");
}

describe("Supabase account authorization", () => {
  beforeAll(async () => {
    const createdA = await admin.auth.admin.createUser({ email: userAEmail, email_confirm: true });
    assertProviderSuccess(createdA.error, "create_user_a");
    userAId = createdA.data.user.id;

    const createdB = await admin.auth.admin.createUser({ email: userBEmail, email_confirm: true });
    assertProviderSuccess(createdB.error, "create_user_b");
    userBId = createdB.data.user.id;

    clientA = await createMagicLinkSession(userAEmail);
    clientB = await createMagicLinkSession(userBEmail);

    const sessionAUser = await clientA.auth.getUser();
    assertProviderSuccess(sessionAUser.error, "read_magic_link_user_a");
    expect(sessionAUser.data.user?.id).toBe(userAId);

    const sessionBUser = await clientB.auth.getUser();
    assertProviderSuccess(sessionBUser.error, "read_magic_link_user_b");
    expect(sessionBUser.data.user?.id).toBe(userBId);

    await ensureProfile(clientB, userBId);

    const preferenceB = await clientB.from("preferences").insert({
      owner_id: userBId,
      skill_level: "advanced",
      preferred_stack_behavior: "ask",
      preferred_stack: {},
      coding_style: {},
      deployment_preference: null,
    });
    assertProviderSuccess(preferenceB.error, "seed_user_b_preferences");

    const project = await clientB.rpc("create_project", {
      p_idempotency_key: `auth-it-${testRun}`,
      p_mode: "feature",
      p_request_fingerprint: `auth-it-${testRun}`,
      p_selected_tool: null,
      p_title: "Authorization integration project",
    });
    assertProviderSuccess(project.error, "seed_user_b_project");
    userBProjectId = (project.data as { project_id?: string } | null)?.project_id ?? "";
    expect(userBProjectId).not.toBe("");

    const override = await admin
      .from("project_preference_overrides")
      .insert({ project_id: userBProjectId, skill_level: "advanced" })
      .select("id")
      .single();
    assertProviderSuccess(override.error, "seed_user_b_override");
    userBOverrideId = (override.data as { id?: string } | null)?.id ?? "";
    expect(userBOverrideId).not.toBe("");
  }, 30_000);

  afterAll(async () => {
    if (userAId) {
      await admin.auth.admin.deleteUser(userAId);
    }
    if (userBId) {
      await admin.auth.admin.deleteUser(userBId);
    }
  });

  test("magic-link session A can bootstrap and read exactly one own profile", async () => {
    await ensureProfile(clientA, userAId);
    await ensureProfile(clientA, userAId);

    const profile = await clientA.from("profiles").select("id").eq("id", userAId);
    assertProviderSuccess(profile.error, "read_user_a_profile");
    expect(profile.data).toEqual([{ id: userAId }]);
  });

  test("A cannot read, mutate, or insert user B account state", async () => {
    const profile = await clientA.from("profiles").select("id").eq("id", userBId);
    assertProviderSuccess(profile.error, "read_user_b_profile_as_a");
    expect(profile.data).toEqual([]);

    const preferences = await clientA.from("preferences").select("id").eq("owner_id", userBId);
    assertProviderSuccess(preferences.error, "read_user_b_preferences_as_a");
    expect(preferences.data).toEqual([]);

    assertDenied(
      await clientA
        .from("profiles")
        .update({ display_name: "must not persist" })
        .eq("id", userBId)
        .select("id"),
    );
    assertDenied(
      await clientA
        .from("preferences")
        .update({ skill_level: "beginner" })
        .eq("owner_id", userBId)
        .select("id"),
    );

    assertDenied(await clientA.from("profiles").insert({ id: userBId }));
    assertDenied(
      await clientA.from("preferences").insert({
        owner_id: userBId,
        skill_level: "beginner",
        preferred_stack_behavior: "ask",
        preferred_stack: {},
        coding_style: {},
        deployment_preference: null,
      }),
    );
  });

  test("A cannot access or create overrides for B's known project", async () => {
    const read = await clientA
      .from("project_preference_overrides")
      .select("id")
      .eq("id", userBOverrideId);
    assertProviderSuccess(read.error, "read_user_b_override_as_a");
    expect(read.data).toEqual([]);

    assertDenied(
      await clientA
        .from("project_preference_overrides")
        .insert({ project_id: userBProjectId, skill_level: "beginner" }),
    );
  });

  test("anonymous and tampered clients are rejected by the Data API", async () => {
    const anonymous = createTestClient();

    for (const table of ["profiles", "preferences", "project_preference_overrides"] as const) {
      const result = await anonymous.from(table).select("id");
      assertProviderSuccess(result.error, `anonymous_read_${table}`);
      expect(result.data).toEqual([]);
    }

    const invalidBearer = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: "Bearer invalid" } },
    });
    expect((await invalidBearer.from("profiles").select("id")).error).not.toBeNull();

    const wronglySignedJwt = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization:
            "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhIn0.invalid-signature",
        },
      },
    });
    expect((await wronglySignedJwt.from("profiles").select("id")).error).not.toBeNull();
  });

  test("onboarding completes idempotently under A's RLS session", async () => {
    const answers: OnboardingAnswers = {
      displayName: "Authorization A",
      skillLevel: "intermediate",
      preferredStackBehavior: "prefer_saved",
      preferredStack: { frontend: "React" },
      codingStyle: { testing: "tests_after" },
      deploymentPreference: "cloudflare",
      locale: "en",
      timeZone: "UTC",
    };

    await completeOnboarding(clientA, userAId, answers);
    await completeOnboarding(clientA, userAId, answers);

    const profile = await clientA
      .from("profiles")
      .select("display_name, onboarding_completed_at")
      .eq("id", userAId)
      .single();
    assertProviderSuccess(profile.error, "read_completed_onboarding_profile");
    expect(profile.data?.display_name).toBe(answers.displayName);
    expect(profile.data?.onboarding_completed_at).not.toBeNull();

    const preferences = await clientA
      .from("preferences")
      .select("owner_id, skill_level, preferred_stack_behavior")
      .eq("owner_id", userAId);
    assertProviderSuccess(preferences.error, "read_completed_onboarding_preferences");
    expect(preferences.data).toEqual([
      {
        owner_id: userAId,
        preferred_stack_behavior: answers.preferredStackBehavior,
        skill_level: answers.skillLevel,
      },
    ]);
  });
});
