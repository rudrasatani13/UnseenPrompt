import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AccountRepository,
  Preferences,
  Profile,
  ProfilePatch,
} from "@/domain/account/contracts";
import type { ProjectPreferenceOverride } from "@/domain/account/effective-preferences";
import {
  assembleAccountExportV1,
  type DecisionExport,
  type MilestoneExport,
  type ProjectEventExport,
  type ProjectExport,
  type ProjectPreferenceOverrideExport,
  type PromptVersionExport,
  type RequirementExport,
} from "@/domain/account/export";
import {
  type OnboardingAnswers,
  onboardingAnswersSchema,
  preferencesSchema,
} from "@/domain/account/onboarding";
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

/**
 * A rejected argument, not a failed provider call: nothing was sent to the database and an
 * identical retry cannot succeed, so a caller answers 422 rather than 502. Deliberately not a
 * subclass of `AccountProviderError`, so `instanceof` keeps the two apart.
 */
export class AccountValidationError extends Error {
  readonly category: string;

  constructor(category: string) {
    super(`account:${category}`);
    this.name = "AccountValidationError";
    this.category = category;
  }
}

const PROFILE_COLUMNS =
  "id, display_name, locale, time_zone, onboarding_completed_at, deletion_requested_at";
const PREFERENCE_COLUMNS =
  "skill_level, preferred_stack_behavior, preferred_stack, coding_style, deployment_preference";
const PROJECT_PREFERENCE_OVERRIDE_COLUMNS = PREFERENCE_COLUMNS;
const PROJECT_EXPORT_COLUMNS =
  "id, owner_id, title, mode, stage, state_version, selected_tool, active_milestone_id, blocker_summary, blocked_from_stage, archived_from_stage, archived_at, deleted_at, last_activity_at, created_at, updated_at";
const REQUIREMENT_EXPORT_COLUMNS =
  "id, project_id, category, statement, status, rationale, source_event_id, supersedes_requirement_id, confirmed_at, created_at, updated_at";
const DECISION_EXPORT_COLUMNS =
  "id, project_id, decision_key, decision, status, rationale, source_event_id, supersedes_decision_id, confirmed_at, created_at, updated_at";
const MILESTONE_EXPORT_COLUMNS =
  "id, project_id, position, title, description, suggested_status, confirmed_status, blocked_reason, confirmation_event_id, created_at, updated_at";
const PROJECT_EVENT_EXPORT_COLUMNS =
  "id, project_id, sequence_number, event_schema_version, event_type, actor_type, actor_id, payload, correlation_id, idempotency_record_id, created_at";
const PROMPT_VERSION_EXPORT_COLUMNS =
  "id, project_id, generation_run_id, tool, version, source, project_state_version, action_specification, prompt_text, acceptance_criteria, supersedes_prompt_version_id, content_hash, created_at";
const OVERRIDE_EXPORT_COLUMNS =
  "id, project_id, skill_level, preferred_stack_behavior, preferred_stack, coding_style, deployment_preference, created_at, updated_at";
const EXPORT_PAGE_SIZE = 1_000;

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

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type RequirementRow = Database["public"]["Tables"]["requirements"]["Row"];
type DecisionRow = Database["public"]["Tables"]["decisions"]["Row"];
type MilestoneRow = Database["public"]["Tables"]["milestones"]["Row"];
type ProjectEventRow = Database["public"]["Tables"]["project_events"]["Row"];
type PromptVersionRow = Database["public"]["Tables"]["prompt_versions"]["Row"];
type OverrideRow = Database["public"]["Tables"]["project_preference_overrides"]["Row"];

async function readAllPages<T>(
  category: string,
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + EXPORT_PAGE_SIZE - 1);
    if (error) {
      throw new AccountProviderError(category);
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) {
      return rows;
    }
  }
}

function toProjectExport(row: ProjectRow): ProjectExport {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    mode: row.mode,
    stage: row.stage,
    stateVersion: row.state_version,
    selectedTool: row.selected_tool,
    activeMilestoneId: row.active_milestone_id,
    blockerSummary: row.blocker_summary,
    blockedFromStage: row.blocked_from_stage,
    archivedFromStage: row.archived_from_stage,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRequirementExport(row: RequirementRow): RequirementExport {
  return {
    id: row.id,
    projectId: row.project_id,
    category: row.category,
    statement: row.statement,
    status: row.status,
    rationale: row.rationale,
    sourceEventId: row.source_event_id,
    supersedesRequirementId: row.supersedes_requirement_id,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDecisionExport(row: DecisionRow): DecisionExport {
  return {
    id: row.id,
    projectId: row.project_id,
    decisionKey: row.decision_key,
    decision: row.decision,
    status: row.status,
    rationale: row.rationale,
    sourceEventId: row.source_event_id,
    supersedesDecisionId: row.supersedes_decision_id,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMilestoneExport(row: MilestoneRow): MilestoneExport {
  return {
    id: row.id,
    projectId: row.project_id,
    position: row.position,
    title: row.title,
    description: row.description,
    suggestedStatus: row.suggested_status,
    confirmedStatus: row.confirmed_status,
    blockedReason: row.blocked_reason,
    confirmationEventId: row.confirmation_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProjectEventExport(row: ProjectEventRow): ProjectEventExport {
  return {
    id: row.id,
    projectId: row.project_id,
    sequenceNumber: row.sequence_number,
    eventSchemaVersion: row.event_schema_version,
    eventType: row.event_type,
    actorType: row.actor_type,
    actorId: row.actor_id,
    payload: row.payload,
    correlationId: row.correlation_id,
    idempotencyRecordId: row.idempotency_record_id,
    createdAt: row.created_at,
  };
}

function toPromptVersionExport(row: PromptVersionRow): PromptVersionExport {
  return {
    id: row.id,
    projectId: row.project_id,
    generationRunId: row.generation_run_id,
    tool: row.tool,
    version: row.version,
    source: row.source,
    projectStateVersion: row.project_state_version,
    actionSpecification: row.action_specification,
    promptText: row.prompt_text,
    acceptanceCriteria: row.acceptance_criteria,
    supersedesPromptVersionId: row.supersedes_prompt_version_id,
    contentHash: row.content_hash,
    createdAt: row.created_at,
  };
}

function toOverrideExport(row: OverrideRow): ProjectPreferenceOverrideExport {
  return {
    id: row.id,
    projectId: row.project_id,
    ...toProjectPreferenceOverride(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

function toProjectPreferenceOverride(row: {
  skill_level: string | null;
  preferred_stack_behavior: string | null;
  preferred_stack: Json | null;
  coding_style: Json | null;
  deployment_preference: string | null;
}): ProjectPreferenceOverride {
  const skillLevel = row.skill_level === null ? null : parseOverrideSkillLevel(row.skill_level);
  const preferredStackBehavior =
    row.preferred_stack_behavior === null
      ? null
      : parseOverridePreferredStackBehavior(row.preferred_stack_behavior);
  const preferredStack =
    row.preferred_stack === null ? null : parseOverridePreferredStack(row.preferred_stack);
  const codingStyle = row.coding_style === null ? null : parseOverrideCodingStyle(row.coding_style);
  const deploymentPreference =
    row.deployment_preference === null
      ? null
      : parseOverrideDeploymentPreference(row.deployment_preference);

  return {
    skillLevel,
    preferredStackBehavior,
    preferredStack,
    codingStyle,
    deploymentPreference,
  };
}

function parseOverrideField<T>(
  candidate: {
    skillLevel: string;
    preferredStackBehavior: string;
    preferredStack: Json;
    codingStyle: Json;
    deploymentPreference: string | null;
  },
  select: (preferences: Preferences) => T,
): T {
  const parsed = preferencesSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new AccountProviderError("unexpected_payload");
  }

  return select(parsed.data);
}

function parseOverrideSkillLevel(value: string): Preferences["skillLevel"] {
  return parseOverrideField(
    {
      skillLevel: value,
      preferredStackBehavior: "recommend",
      preferredStack: {},
      codingStyle: {},
      deploymentPreference: null,
    },
    (preferences) => preferences.skillLevel,
  );
}

function parseOverridePreferredStackBehavior(value: string): Preferences["preferredStackBehavior"] {
  return parseOverrideField(
    {
      skillLevel: "beginner",
      preferredStackBehavior: value,
      preferredStack: {},
      codingStyle: {},
      deploymentPreference: null,
    },
    (preferences) => preferences.preferredStackBehavior,
  );
}

function parseOverridePreferredStack(value: Json): Preferences["preferredStack"] {
  return parseOverrideField(
    {
      skillLevel: "beginner",
      preferredStackBehavior: "prefer_saved",
      preferredStack: value,
      codingStyle: {},
      deploymentPreference: null,
    },
    (preferences) => preferences.preferredStack,
  );
}

function parseOverrideCodingStyle(value: Json): Preferences["codingStyle"] {
  return parseOverrideField(
    {
      skillLevel: "beginner",
      preferredStackBehavior: "recommend",
      preferredStack: {},
      codingStyle: value,
      deploymentPreference: null,
    },
    (preferences) => preferences.codingStyle,
  );
}

function parseOverrideDeploymentPreference(value: string): Preferences["deploymentPreference"] {
  return parseOverrideField(
    {
      skillLevel: "beginner",
      preferredStackBehavior: "recommend",
      preferredStack: {},
      codingStyle: {},
      deploymentPreference: value,
    },
    (preferences) => preferences.deploymentPreference,
  );
}

/*
 * The read path above re-parses every stored row, while the database enforces neither the
 * cross-field rule nor the closed key sets the schema does. A write that skipped the schema could
 * therefore persist a row this repository then refuses to return, so both writers parse their own
 * argument first: the domain types cannot express those rules, and a direct caller is not the
 * endpoint. Parsing also normalises the value, so what lands in the row is what a read expects.
 */
function validatedPreferences(next: Preferences): Preferences {
  const parsed = preferencesSchema.safeParse(next);

  if (!parsed.success) {
    throw new AccountValidationError("preferences");
  }

  return parsed.data;
}

function validatedAnswers(answers: OnboardingAnswers): OnboardingAnswers {
  const parsed = onboardingAnswersSchema.safeParse(answers);

  if (!parsed.success) {
    throw new AccountValidationError("onboarding_answers");
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

  async function readPreferences(userId: string): Promise<Preferences | null> {
    const { data, error } = await client
      .from("preferences")
      .select(PREFERENCE_COLUMNS)
      .eq("owner_id", userId)
      .maybeSingle();

    if (error) {
      throw new AccountProviderError("select_preferences");
    }

    return data ? toPreferences(data) : null;
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

    getPreferences: readPreferences,

    async getProjectPreferenceOverride(projectId): Promise<ProjectPreferenceOverride | null> {
      const { data, error } = await client
        .from("project_preference_overrides")
        .select(PROJECT_PREFERENCE_OVERRIDE_COLUMNS)
        .eq("project_id", projectId)
        .maybeSingle();

      if (error) {
        throw new AccountProviderError("select_project_preference_override");
      }

      return data ? toProjectPreferenceOverride(data) : null;
    },

    /*
     * Fixed write order, deliberately without a cross-table transaction: preferences first, then
     * the profile fields, then the completion stamp. Every prefix of that sequence is a state a
     * repeat call converges from, and the stamp is guarded so a retry never moves a completion
     * time that already exists.
     */
    async completeOnboarding(userId, rawAnswers: OnboardingAnswers): Promise<void> {
      const answers = validatedAnswers(rawAnswers);

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
      const insert = toPreferencesInsert(userId, validatedPreferences(next));

      const { data, error } = await client
        .from("preferences")
        .upsert(insert, { onConflict: "owner_id" })
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

    async buildAccountExport(userId) {
      const [profile, preferences, projectRows] = await Promise.all([
        readProfile(userId),
        readPreferences(userId),
        readAllPages<ProjectRow>("export_projects", (from, to) =>
          client
            .from("projects")
            .select(PROJECT_EXPORT_COLUMNS)
            .eq("owner_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
      ]);

      if (!profile) {
        throw new AccountProviderError("profile_not_found");
      }

      const projectIds = projectRows
        .filter((project) => project.owner_id === userId)
        .map((project) => project.id);

      const empty = <T>(): Promise<T[]> => Promise.resolve([]);
      const [requirements, decisions, milestones, projectEvents, promptVersions, overrides] =
        await Promise.all([
          projectIds.length === 0
            ? empty<RequirementRow>()
            : readAllPages<RequirementRow>("export_requirements", (from, to) =>
                client
                  .from("requirements")
                  .select(REQUIREMENT_EXPORT_COLUMNS)
                  .in("project_id", projectIds)
                  .order("id", { ascending: true })
                  .range(from, to),
              ),
          projectIds.length === 0
            ? empty<DecisionRow>()
            : readAllPages<DecisionRow>("export_decisions", (from, to) =>
                client
                  .from("decisions")
                  .select(DECISION_EXPORT_COLUMNS)
                  .in("project_id", projectIds)
                  .order("id", { ascending: true })
                  .range(from, to),
              ),
          projectIds.length === 0
            ? empty<MilestoneRow>()
            : readAllPages<MilestoneRow>("export_milestones", (from, to) =>
                client
                  .from("milestones")
                  .select(MILESTONE_EXPORT_COLUMNS)
                  .in("project_id", projectIds)
                  .order("id", { ascending: true })
                  .range(from, to),
              ),
          projectIds.length === 0
            ? empty<ProjectEventRow>()
            : readAllPages<ProjectEventRow>("export_project_events", (from, to) =>
                client
                  .from("project_events")
                  .select(PROJECT_EVENT_EXPORT_COLUMNS)
                  .in("project_id", projectIds)
                  .order("id", { ascending: true })
                  .range(from, to),
              ),
          projectIds.length === 0
            ? empty<PromptVersionRow>()
            : readAllPages<PromptVersionRow>("export_prompt_versions", (from, to) =>
                client
                  .from("prompt_versions")
                  .select(PROMPT_VERSION_EXPORT_COLUMNS)
                  .in("project_id", projectIds)
                  .order("id", { ascending: true })
                  .range(from, to),
              ),
          projectIds.length === 0
            ? empty<OverrideRow>()
            : readAllPages<OverrideRow>("export_project_preference_overrides", (from, to) =>
                client
                  .from("project_preference_overrides")
                  .select(OVERRIDE_EXPORT_COLUMNS)
                  .in("project_id", projectIds)
                  .order("id", { ascending: true })
                  .range(from, to),
              ),
        ]);

      return assembleAccountExportV1(userId, new Date().toISOString(), {
        profiles: [profile],
        preferences: preferences ? [{ ownerId: userId, value: preferences }] : [],
        projects: projectRows.map(toProjectExport),
        requirements: requirements.map(toRequirementExport),
        decisions: decisions.map(toDecisionExport),
        milestones: milestones.map(toMilestoneExport),
        projectEvents: projectEvents.map(toProjectEventExport),
        promptVersions: promptVersions.map(toPromptVersionExport),
        projectPreferenceOverrides: overrides.map(toOverrideExport),
      });
    },
  };
}
