import type { Preferences, Profile } from "@/domain/account/contracts";

export type ExportJson =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: ExportJson | undefined }
  | readonly ExportJson[];

export interface ProjectExport {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly mode: string;
  readonly stage: string;
  readonly stateVersion: number;
  readonly selectedTool: string | null;
  readonly activeMilestoneId: string | null;
  readonly blockerSummary: string | null;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
  readonly lastActivityAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RequirementExport {
  readonly id: string;
  readonly projectId: string;
  readonly category: string;
  readonly statement: string;
  readonly status: string;
  readonly rationale: string | null;
  readonly sourceEventId: string | null;
  readonly supersedesRequirementId: string | null;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DecisionExport {
  readonly id: string;
  readonly projectId: string;
  readonly decisionKey: string;
  readonly decision: string;
  readonly status: string;
  readonly rationale: string | null;
  readonly sourceEventId: string | null;
  readonly supersedesDecisionId: string | null;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MilestoneExport {
  readonly id: string;
  readonly projectId: string;
  readonly position: number;
  readonly title: string;
  readonly description: string | null;
  readonly suggestedStatus: string;
  readonly confirmedStatus: string | null;
  readonly blockedReason: string | null;
  readonly confirmationEventId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectEventExport {
  readonly id: string;
  readonly projectId: string;
  readonly sequenceNumber: number;
  readonly eventType: string;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly payload: ExportJson;
  readonly correlationId: string;
  readonly idempotencyRecordId: string | null;
  readonly createdAt: string;
}

export interface PromptVersionExport {
  readonly id: string;
  readonly projectId: string;
  readonly generationRunId: string | null;
  readonly tool: string;
  readonly version: number;
  readonly source: string;
  readonly projectStateVersion: number;
  readonly actionSpecification: ExportJson;
  readonly promptText: string;
  readonly acceptanceCriteria: ExportJson;
  readonly supersedesPromptVersionId: string | null;
  readonly contentHash: string;
  readonly createdAt: string;
}

export interface ProjectPreferenceOverrideExport {
  readonly id: string;
  readonly projectId: string;
  readonly skillLevel: Preferences["skillLevel"] | null;
  readonly preferredStackBehavior: Preferences["preferredStackBehavior"] | null;
  readonly preferredStack: Preferences["preferredStack"] | null;
  readonly codingStyle: Preferences["codingStyle"] | null;
  readonly deploymentPreference: Preferences["deploymentPreference"];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AccountExportV1 {
  readonly schema: "unseenprompt.account-export";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly profile: Profile;
  readonly preferences: Preferences | null;
  readonly projects: readonly ProjectExport[];
  readonly requirements: readonly RequirementExport[];
  readonly decisions: readonly DecisionExport[];
  readonly milestones: readonly MilestoneExport[];
  readonly projectEvents: readonly ProjectEventExport[];
  readonly promptVersions: readonly PromptVersionExport[];
  readonly projectPreferenceOverrides: readonly ProjectPreferenceOverrideExport[];
}

export interface AccountExportSource {
  readonly profiles: readonly Profile[];
  readonly preferences: readonly { readonly ownerId: string; readonly value: Preferences }[];
  readonly projects: readonly ProjectExport[];
  readonly requirements: readonly RequirementExport[];
  readonly decisions: readonly DecisionExport[];
  readonly milestones: readonly MilestoneExport[];
  readonly projectEvents: readonly ProjectEventExport[];
  readonly promptVersions: readonly PromptVersionExport[];
  readonly projectPreferenceOverrides: readonly ProjectPreferenceOverrideExport[];
}

/**
 * RLS is the primary boundary; these explicit owner/project filters are a second fail-closed layer
 * so an accidentally widened query cannot silently place another account's state in an export.
 */
export function assembleAccountExportV1(
  userId: string,
  generatedAt: string,
  source: AccountExportSource,
): AccountExportV1 {
  const profile = source.profiles.find((candidate) => candidate.id === userId);
  if (!profile) {
    throw new Error("account_export:profile_not_found");
  }

  const preferences =
    source.preferences.find((candidate) => candidate.ownerId === userId)?.value ?? null;
  const projects = source.projects.filter((project) => project.ownerId === userId);
  const ownedProjectIds = new Set(projects.map((project) => project.id));
  const owned = <T extends { readonly projectId: string }>(rows: readonly T[]): readonly T[] =>
    rows.filter((row) => ownedProjectIds.has(row.projectId));

  return {
    schema: "unseenprompt.account-export",
    schemaVersion: 1,
    generatedAt,
    profile,
    preferences,
    projects,
    requirements: owned(source.requirements),
    decisions: owned(source.decisions),
    milestones: owned(source.milestones),
    projectEvents: owned(source.projectEvents),
    promptVersions: owned(source.promptVersions),
    projectPreferenceOverrides: owned(source.projectPreferenceOverrides),
  };
}
