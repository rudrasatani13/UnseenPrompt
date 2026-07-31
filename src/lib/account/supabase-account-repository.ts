import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AccountRepository,
  Preferences,
  Profile,
  ProfilePatch,
} from "@/domain/account/contracts";
import { type OnboardingAnswers, preferencesSchema } from "@/domain/account/onboarding";
import type { Database, Json } from "@/lib/supabase/database.types";

/** Carries no provider text: a failure reason from PostgREST must never reach a response body. */
export class AccountProviderError extends Error {
  readonly category: string;

  constructor(category: string) {
    super(`supabase:${category}`);
    this.name = "AccountProviderError";
    this.category = category;
  }
}

const PROFILE_COLUMNS =
  "id, display_name, locale, time_zone, onboarding_completed_at, deletion_requested_at";
const PREFERENCE_COLUMNS =
  "skill_level, preferred_stack_behavior, preferred_stack, coding_style, deployment_preference";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type PreferencesInsert = Database["public"]["Tables"]["preferences"]["Insert"];
type ProfileSelection = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  | "id"
  | "display_name"
  | "locale"
  | "time_zone"
  | "onboarding_completed_at"
  | "deletion_requested_at"
>;

function toProfile(row: ProfileSelection): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    locale: row.locale,
    timeZone: row.time_zone,
    onboardingCompletedAt: row.onboarding_completed_at,
    deletionRequestedAt: row.deletion_requested_at,
  };
}

/**
 * `skill_level`, `preferred_stack_behavior`, and both jsonb columns are untyped at the PostgREST
 * boundary, so a stored row is re-validated against the domain contract before it is trusted.
 */
function toPreferences(row: {
  skill_level: string;
  preferred_stack_behavior: string;
  preferred_stack: Json;
  coding_style: Json;
  deployment_preference: string | null;
}): Preferences {
  const parsed = preferencesSchema.safeParse({
    skillLevel: row.skill_level,
    preferredStackBehavior: row.preferred_stack_behavior,
    preferredStack: row.preferred_stack,
    codingStyle: row.coding_style,
    deploymentPreference: row.deployment_preference,
  });

  if (!parsed.success) {
    throw new AccountProviderError("unexpected_payload");
  }

  return parsed.data;
}

function toPreferencesInsert(userId: string, next: Preferences): PreferencesInsert {
  return {
    owner_id: userId,
    skill_level: next.skillLevel,
    preferred_stack_behavior: next.preferredStackBehavior,
    preferred_stack: next.preferredStack as Json,
    coding_style: next.codingStyle as Json,
    deployment_preference: next.deploymentPreference,
  };
}

function toProfileUpdate(patch: ProfilePatch): ProfileUpdate {
  return {
    ...(patch.displayName === undefined ? {} : { display_name: patch.displayName }),
    ...(patch.locale === undefined ? {} : { locale: patch.locale }),
    ...(patch.timeZone === undefined ? {} : { time_zone: patch.timeZone }),
  };
}

export function createSupabaseAccountRepository(
  client: SupabaseClient<Database>,
): AccountRepository {
  async function readProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await client
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new AccountProviderError("select_profile");
    }

    return data ? toProfile(data) : null;
  }

  return {
    /*
     * Insert-if-absent only. `ignoreDuplicates` keeps a second sign-in from resetting a profile the
     * owner has already edited, and the row carries nothing but the id: locale and time zone come
     * from database defaults until the owner states a preference.
     */
    async ensureProfile(userId): Promise<void> {
      const { error } = await client
        .from("profiles")
        .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

      if (error) {
        throw new AccountProviderError("upsert_profile");
      }
    },

    getProfile: readProfile,

    async updateProfile(userId, patch): Promise<Profile> {
      const update = toProfileUpdate(patch);

      if (Object.keys(update).length === 0) {
        const current = await readProfile(userId);
        if (!current) {
          throw new AccountProviderError("profile_not_found");
        }

        return current;
      }

      const { data, error } = await client
        .from("profiles")
        .update(update)
        .eq("id", userId)
        .select(PROFILE_COLUMNS)
        .maybeSingle();

      if (error) {
        throw new AccountProviderError("update_profile");
      }

      if (!data) {
        throw new AccountProviderError("profile_not_found");
      }

      return toProfile(data);
    },

    async getPreferences(userId): Promise<Preferences | null> {
      const { data, error } = await client
        .from("preferences")
        .select(PREFERENCE_COLUMNS)
        .eq("owner_id", userId)
        .maybeSingle();

      if (error) {
        throw new AccountProviderError("select_preferences");
      }

      return data ? toPreferences(data) : null;
    },

    /*
     * Fixed write order, deliberately without a cross-table transaction: preferences first, then
     * the profile fields, then the completion stamp. Every prefix of that sequence is a state a
     * repeat call converges from, and the stamp is guarded so a retry never moves a completion
     * time that already exists.
     */
    async completeOnboarding(userId, answers: OnboardingAnswers): Promise<void> {
      const { error: preferencesError } = await client
        .from("preferences")
        .upsert(toPreferencesInsert(userId, answers), { onConflict: "owner_id" });

      if (preferencesError) {
        throw new AccountProviderError("upsert_preferences");
      }

      const { error: fieldsError } = await client
        .from("profiles")
        .update({
          display_name: answers.displayName,
          locale: answers.locale,
          time_zone: answers.timeZone,
        })
        .eq("id", userId);

      if (fieldsError) {
        throw new AccountProviderError("update_profile");
      }

      const { error: stampError } = await client
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", userId)
        .is("onboarding_completed_at", null);

      if (stampError) {
        throw new AccountProviderError("stamp_onboarding");
      }
    },

    async updatePreferences(userId, next): Promise<Preferences> {
      const { data, error } = await client
        .from("preferences")
        .upsert(toPreferencesInsert(userId, next), { onConflict: "owner_id" })
        .select(PREFERENCE_COLUMNS)
        .maybeSingle();

      if (error) {
        throw new AccountProviderError("upsert_preferences");
      }

      if (!data) {
        throw new AccountProviderError("preferences_not_found");
      }

      return toPreferences(data);
    },

    async requestDeletion(userId, now): Promise<string> {
      const { data, error } = await client
        .from("profiles")
        .update({ deletion_requested_at: now.toISOString() })
        .eq("id", userId)
        .is("deletion_requested_at", null)
        .select("deletion_requested_at")
        .maybeSingle();

      if (error) {
        throw new AccountProviderError("update_profile");
      }

      if (data?.deletion_requested_at) {
        return data.deletion_requested_at;
      }

      // The guarded update matched nothing, so either a request is already pending or the row is
      // gone. Only the first is recoverable, and it reports the timestamp the owner already has.
      const current = await readProfile(userId);
      if (!current?.deletionRequestedAt) {
        throw new AccountProviderError("profile_not_found");
      }

      return current.deletionRequestedAt;
    },

    async cancelDeletion(userId): Promise<void> {
      const { error } = await client
        .from("profiles")
        .update({ deletion_requested_at: null })
        .eq("id", userId);

      if (error) {
        throw new AccountProviderError("update_profile");
      }
    },
  };
}
