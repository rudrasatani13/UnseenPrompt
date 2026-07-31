import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Preferences } from "@/domain/account/contracts";
import type { OnboardingAnswers } from "@/domain/account/onboarding";
import type { Database } from "@/lib/supabase/database.types";

import {
  AccountProviderError,
  createSupabaseAccountRepository,
} from "./supabase-account-repository";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

interface QueryOutcome {
  readonly data: unknown;
  readonly error: unknown;
}

interface RecordedCall {
  table: string;
  operation: "select" | "insert" | "update" | "upsert";
  payload: unknown;
  options: unknown;
  columns: string | null;
  filters: [string, string, unknown][];
}

interface ClientFake {
  readonly client: SupabaseClient<Database>;
  readonly calls: readonly RecordedCall[];
}

/**
 * Stands in for the PostgREST builder: every call is recorded in `from()` order, and each awaited
 * query consumes the next queued outcome.
 */
function createClientFake(outcomes: readonly QueryOutcome[] = []): ClientFake {
  const calls: RecordedCall[] = [];
  let consumed = 0;

  const nextOutcome = (): QueryOutcome => outcomes[consumed++] ?? { data: null, error: null };

  function createBuilder(table: string) {
    const call: RecordedCall = {
      table,
      operation: "select",
      payload: undefined,
      options: undefined,
      columns: null,
      filters: [],
    };
    calls.push(call);

    const builder = {
      select(columns?: string) {
        call.columns = columns ?? null;
        return builder;
      },
      insert(payload: unknown) {
        call.operation = "insert";
        call.payload = payload;
        return builder;
      },
      update(payload: unknown) {
        call.operation = "update";
        call.payload = payload;
        return builder;
      },
      upsert(payload: unknown, options?: unknown) {
        call.operation = "upsert";
        call.payload = payload;
        call.options = options;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.filters.push(["eq", column, value]);
        return builder;
      },
      is(column: string, value: unknown) {
        call.filters.push(["is", column, value]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(nextOutcome());
      },
      then(
        onFulfilled?: (value: QueryOutcome) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(nextOutcome()).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  return {
    client: {
      from: (table: string) => createBuilder(table),
    } as unknown as SupabaseClient<Database>,
    calls,
  };
}

const profileRow = {
  id: USER_ID,
  display_name: "Ada",
  locale: "en",
  time_zone: "UTC",
  onboarding_completed_at: null,
  deletion_requested_at: null,
};

const preferencesRow = {
  skill_level: "beginner",
  preferred_stack_behavior: "recommend",
  preferred_stack: {},
  coding_style: {},
  deployment_preference: null,
};

const answers: OnboardingAnswers = {
  displayName: "Ada",
  skillLevel: "advanced",
  preferredStackBehavior: "prefer_saved",
  preferredStack: { frontend: "Next.js" },
  codingStyle: { testing: "test_first" },
  deploymentPreference: "cloudflare",
  locale: "pt-BR",
  timeZone: "Asia/Kolkata",
};

const preferences: Preferences = {
  skillLevel: "intermediate",
  preferredStackBehavior: "ask",
  preferredStack: {},
  codingStyle: { comments: "minimal" },
  deploymentPreference: null,
};

describe("ensureProfile", () => {
  it("inserts only the id, never updating an existing row", async () => {
    const fake = createClientFake();

    await createSupabaseAccountRepository(fake.client).ensureProfile(USER_ID);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.table).toBe("profiles");
    expect(fake.calls[0]?.operation).toBe("upsert");
    expect(fake.calls[0]?.payload).toEqual({ id: USER_ID });
    expect(fake.calls[0]?.options).toEqual({ onConflict: "id", ignoreDuplicates: true });
  });

  it("reports a provider failure rather than swallowing it", async () => {
    const fake = createClientFake([{ data: null, error: { message: "permission denied" } }]);

    await expect(
      createSupabaseAccountRepository(fake.client).ensureProfile(USER_ID),
    ).rejects.toBeInstanceOf(AccountProviderError);
  });
});

describe("getProfile", () => {
  it("reads only the caller's own row and maps it to the domain shape", async () => {
    const fake = createClientFake([{ data: profileRow, error: null }]);

    const profile = await createSupabaseAccountRepository(fake.client).getProfile(USER_ID);

    expect(fake.calls[0]?.table).toBe("profiles");
    expect(fake.calls[0]?.filters).toEqual([["eq", "id", USER_ID]]);
    expect(profile).toEqual({
      id: USER_ID,
      displayName: "Ada",
      locale: "en",
      timeZone: "UTC",
      onboardingCompletedAt: null,
      deletionRequestedAt: null,
    });
  });

  it("returns null when no row exists", async () => {
    const fake = createClientFake([{ data: null, error: null }]);

    expect(await createSupabaseAccountRepository(fake.client).getProfile(USER_ID)).toBeNull();
  });

  it("uses the id it was passed, not an ambient one", async () => {
    const fake = createClientFake([{ data: { ...profileRow, id: OTHER_ID }, error: null }]);

    await createSupabaseAccountRepository(fake.client).getProfile(OTHER_ID);

    expect(fake.calls[0]?.filters).toEqual([["eq", "id", OTHER_ID]]);
  });
});

describe("updateProfile", () => {
  it("writes only the supplied fields, scoped to the owner", async () => {
    const fake = createClientFake([
      { data: { ...profileRow, display_name: "Grace", locale: "pt-BR" }, error: null },
    ]);

    const profile = await createSupabaseAccountRepository(fake.client).updateProfile(USER_ID, {
      displayName: "Grace",
      locale: "pt-BR",
    });

    expect(fake.calls[0]?.operation).toBe("update");
    expect(fake.calls[0]?.payload).toEqual({ display_name: "Grace", locale: "pt-BR" });
    expect(fake.calls[0]?.filters).toEqual([["eq", "id", USER_ID]]);
    expect(profile.displayName).toBe("Grace");
  });

  it("clears the display name when the patch sets it to null", async () => {
    const fake = createClientFake([{ data: { ...profileRow, display_name: null }, error: null }]);

    await createSupabaseAccountRepository(fake.client).updateProfile(USER_ID, {
      displayName: null,
    });

    expect(fake.calls[0]?.payload).toEqual({ display_name: null });
  });

  it("reads instead of issuing an empty update when the patch changes nothing", async () => {
    const fake = createClientFake([{ data: profileRow, error: null }]);

    await createSupabaseAccountRepository(fake.client).updateProfile(USER_ID, {});

    expect(fake.calls[0]?.operation).toBe("select");
    expect(fake.calls[0]?.filters).toEqual([["eq", "id", USER_ID]]);
  });

  it("fails when the owner has no profile row", async () => {
    const fake = createClientFake([{ data: null, error: null }]);

    await expect(
      createSupabaseAccountRepository(fake.client).updateProfile(USER_ID, { locale: "en" }),
    ).rejects.toBeInstanceOf(AccountProviderError);
  });
});

describe("getPreferences", () => {
  it("reads the owner's row and validates the untyped jsonb columns", async () => {
    const fake = createClientFake([
      {
        data: {
          ...preferencesRow,
          skill_level: "advanced",
          preferred_stack_behavior: "prefer_saved",
          preferred_stack: { backend: "Node.js" },
          coding_style: { paradigm: "functional" },
          deployment_preference: "vercel",
        },
        error: null,
      },
    ]);

    const result = await createSupabaseAccountRepository(fake.client).getPreferences(USER_ID);

    expect(fake.calls[0]?.table).toBe("preferences");
    expect(fake.calls[0]?.filters).toEqual([["eq", "owner_id", USER_ID]]);
    expect(result).toEqual({
      skillLevel: "advanced",
      preferredStackBehavior: "prefer_saved",
      preferredStack: { backend: "Node.js" },
      codingStyle: { paradigm: "functional" },
      deploymentPreference: "vercel",
    });
  });

  it("returns null when the owner has no preferences yet", async () => {
    const fake = createClientFake([{ data: null, error: null }]);

    expect(await createSupabaseAccountRepository(fake.client).getPreferences(USER_ID)).toBeNull();
  });

  it("rejects a stored row that no longer matches the contract", async () => {
    const fake = createClientFake([
      { data: { ...preferencesRow, skill_level: "wizard" }, error: null },
    ]);

    await expect(
      createSupabaseAccountRepository(fake.client).getPreferences(USER_ID),
    ).rejects.toBeInstanceOf(AccountProviderError);
  });
});

describe("completeOnboarding", () => {
  it("upserts preferences before touching the profile", async () => {
    const fake = createClientFake();

    await createSupabaseAccountRepository(fake.client).completeOnboarding(USER_ID, answers);

    expect(fake.calls.map((call) => call.table)).toEqual(["preferences", "profiles", "profiles"]);

    const [preferencesCall, fieldsCall, stampCall] = fake.calls;

    expect(preferencesCall?.operation).toBe("upsert");
    expect(preferencesCall?.payload).toEqual({
      owner_id: USER_ID,
      skill_level: "advanced",
      preferred_stack_behavior: "prefer_saved",
      preferred_stack: { frontend: "Next.js" },
      coding_style: { testing: "test_first" },
      deployment_preference: "cloudflare",
    });
    expect(preferencesCall?.options).toEqual({ onConflict: "owner_id" });

    expect(fieldsCall?.operation).toBe("update");
    expect(fieldsCall?.payload).toEqual({
      display_name: "Ada",
      locale: "pt-BR",
      time_zone: "Asia/Kolkata",
    });
    expect(fieldsCall?.filters).toEqual([["eq", "id", USER_ID]]);

    expect(stampCall?.operation).toBe("update");
    expect(stampCall?.filters).toEqual([
      ["eq", "id", USER_ID],
      ["is", "onboarding_completed_at", null],
    ]);
  });

  it("stamps the completion time as an ISO instant", async () => {
    const fake = createClientFake();

    await createSupabaseAccountRepository(fake.client).completeOnboarding(USER_ID, answers);

    const payload = fake.calls[2]?.payload as { onboarding_completed_at: string };
    expect(Number.isNaN(Date.parse(payload.onboarding_completed_at))).toBe(false);
    expect(payload.onboarding_completed_at).toBe(
      new Date(payload.onboarding_completed_at).toISOString(),
    );
  });

  it("never overwrites an existing completion timestamp on a repeat run", async () => {
    const fake = createClientFake();
    const repository = createSupabaseAccountRepository(fake.client);

    await repository.completeOnboarding(USER_ID, answers);
    await repository.completeOnboarding(USER_ID, answers);

    for (const stampCall of [fake.calls[2], fake.calls[5]]) {
      expect(stampCall?.filters).toContainEqual(["is", "onboarding_completed_at", null]);
    }
  });

  it("stops before the profile writes when the preferences upsert fails", async () => {
    const fake = createClientFake([{ data: null, error: { message: "deadlock detected" } }]);

    await expect(
      createSupabaseAccountRepository(fake.client).completeOnboarding(USER_ID, answers),
    ).rejects.toBeInstanceOf(AccountProviderError);

    expect(fake.calls.map((call) => call.table)).toEqual(["preferences"]);
  });

  it("reports a failed profile write so the caller can retry", async () => {
    const fake = createClientFake([
      { data: null, error: null },
      { data: null, error: { message: "connection reset" } },
    ]);

    await expect(
      createSupabaseAccountRepository(fake.client).completeOnboarding(USER_ID, answers),
    ).rejects.toBeInstanceOf(AccountProviderError);
  });
});

describe("updatePreferences", () => {
  it("upserts on the owner conflict target and returns the stored row", async () => {
    const fake = createClientFake([
      {
        data: {
          skill_level: "intermediate",
          preferred_stack_behavior: "ask",
          preferred_stack: {},
          coding_style: { comments: "minimal" },
          deployment_preference: null,
        },
        error: null,
      },
    ]);

    const stored = await createSupabaseAccountRepository(fake.client).updatePreferences(
      USER_ID,
      preferences,
    );

    expect(fake.calls[0]?.operation).toBe("upsert");
    expect(fake.calls[0]?.options).toEqual({ onConflict: "owner_id" });
    expect(fake.calls[0]?.payload).toEqual({
      owner_id: USER_ID,
      skill_level: "intermediate",
      preferred_stack_behavior: "ask",
      preferred_stack: {},
      coding_style: { comments: "minimal" },
      deployment_preference: null,
    });
    expect(stored).toEqual(preferences);
  });
});

describe("requestDeletion", () => {
  it("stamps the request only while none is pending", async () => {
    const now = new Date("2026-08-01T10:00:00.000Z");
    const fake = createClientFake([
      { data: { deletion_requested_at: now.toISOString() }, error: null },
    ]);

    const effective = await createSupabaseAccountRepository(fake.client).requestDeletion(
      USER_ID,
      now,
    );

    expect(fake.calls[0]?.operation).toBe("update");
    expect(fake.calls[0]?.payload).toEqual({ deletion_requested_at: now.toISOString() });
    expect(fake.calls[0]?.filters).toEqual([
      ["eq", "id", USER_ID],
      ["is", "deletion_requested_at", null],
    ]);
    expect(effective).toBe(now.toISOString());
  });

  it("reports the original timestamp when a request is already pending", async () => {
    const original = "2026-07-20T08:30:00.000Z";
    const fake = createClientFake([
      { data: null, error: null },
      { data: { ...profileRow, deletion_requested_at: original }, error: null },
    ]);

    const effective = await createSupabaseAccountRepository(fake.client).requestDeletion(
      USER_ID,
      new Date("2026-08-01T10:00:00.000Z"),
    );

    expect(effective).toBe(original);
  });

  it("fails when neither the stamp nor an existing request can be found", async () => {
    const fake = createClientFake([
      { data: null, error: null },
      { data: null, error: null },
    ]);

    await expect(
      createSupabaseAccountRepository(fake.client).requestDeletion(USER_ID, new Date()),
    ).rejects.toBeInstanceOf(AccountProviderError);
  });
});

describe("cancelDeletion", () => {
  it("clears the pending request on the owner's row", async () => {
    const fake = createClientFake();

    await createSupabaseAccountRepository(fake.client).cancelDeletion(USER_ID);

    expect(fake.calls[0]?.table).toBe("profiles");
    expect(fake.calls[0]?.operation).toBe("update");
    expect(fake.calls[0]?.payload).toEqual({ deletion_requested_at: null });
    expect(fake.calls[0]?.filters).toEqual([["eq", "id", USER_ID]]);
  });

  it("reports a provider failure", async () => {
    const fake = createClientFake([{ data: null, error: { message: "permission denied" } }]);

    await expect(
      createSupabaseAccountRepository(fake.client).cancelDeletion(USER_ID),
    ).rejects.toBeInstanceOf(AccountProviderError);
  });
});

describe("account repository boundaries", () => {
  it("never reads identity-provider metadata into product state", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(process.cwd(), "src/lib/account/supabase-account-repository.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/user_metadata|raw_user_meta_data|app_metadata/);
    expect(source).not.toMatch(/\.auth\b/);
  });

  it("filters every query by the user id it was given", async () => {
    const otherProfileRow = { ...profileRow, id: OTHER_ID };
    const fake = createClientFake([
      { data: null, error: null },
      { data: otherProfileRow, error: null },
      { data: otherProfileRow, error: null },
      { data: preferencesRow, error: null },
      { data: preferencesRow, error: null },
      { data: { deletion_requested_at: "2026-08-01T10:00:00.000Z" }, error: null },
      { data: null, error: null },
    ]);
    const repository = createSupabaseAccountRepository(fake.client);

    await repository.ensureProfile(OTHER_ID);
    await repository.getProfile(OTHER_ID);
    await repository.updateProfile(OTHER_ID, { locale: "en" });
    await repository.getPreferences(OTHER_ID);
    await repository.updatePreferences(OTHER_ID, preferences);
    await repository.requestDeletion(OTHER_ID, new Date());
    await repository.cancelDeletion(OTHER_ID);

    for (const call of fake.calls) {
      const scoped =
        call.filters.some(([, column, value]) => column === "id" && value === OTHER_ID) ||
        (call.payload as { owner_id?: string } | undefined)?.owner_id === OTHER_ID ||
        (call.payload as { id?: string } | undefined)?.id === OTHER_ID ||
        call.filters.some(([, column, value]) => column === "owner_id" && value === OTHER_ID);

      expect(scoped, `unscoped query on ${call.table}`).toBe(true);
    }
  });
});
