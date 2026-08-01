import { describe, expect, it } from "vitest";

import type { Preferences, Profile } from "@/domain/account/contracts";
import { assembleAccountExportV1, type AccountExportSource } from "@/domain/account/export";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GENERATED_AT = "2026-08-01T12:00:00.000Z";

const profile: Profile = {
  id: USER_ID,
  displayName: "Ada",
  locale: "en",
  timeZone: "UTC",
  onboardingCompletedAt: GENERATED_AT,
  deletionRequestedAt: null,
};
const preferences: Preferences = {
  skillLevel: "advanced",
  preferredStackBehavior: "ask",
  preferredStack: {},
  codingStyle: { testing: "test_first" },
  deploymentPreference: "cloudflare",
};

function source(): AccountExportSource {
  return {
    profiles: [profile, { ...profile, id: OTHER_ID, displayName: "Other user" }],
    preferences: [
      { ownerId: USER_ID, value: preferences },
      { ownerId: OTHER_ID, value: { ...preferences, skillLevel: "beginner" } },
    ],
    projects: [
      {
        id: PROJECT_ID,
        ownerId: USER_ID,
        title: "Owned project",
        mode: "new_build",
        stage: "discovery",
        stateVersion: 1,
        selectedTool: null,
        activeMilestoneId: null,
        blockerSummary: null,
        archivedAt: null,
        deletedAt: null,
        lastActivityAt: GENERATED_AT,
        createdAt: GENERATED_AT,
        updatedAt: GENERATED_AT,
      },
      {
        id: OTHER_PROJECT_ID,
        ownerId: OTHER_ID,
        title: "Other project",
        mode: "bug",
        stage: "discovery",
        stateVersion: 1,
        selectedTool: null,
        activeMilestoneId: null,
        blockerSummary: null,
        archivedAt: null,
        deletedAt: null,
        lastActivityAt: GENERATED_AT,
        createdAt: GENERATED_AT,
        updatedAt: GENERATED_AT,
      },
    ],
    requirements: [
      {
        id: "requirement-owned",
        projectId: PROJECT_ID,
        category: "functional",
        statement: "Owned requirement",
        status: "proposed",
        rationale: null,
        sourceEventId: null,
        supersedesRequirementId: null,
        confirmedAt: null,
        createdAt: GENERATED_AT,
        updatedAt: GENERATED_AT,
      },
      {
        id: "requirement-other",
        projectId: OTHER_PROJECT_ID,
        category: "functional",
        statement: "Other requirement",
        status: "proposed",
        rationale: null,
        sourceEventId: null,
        supersedesRequirementId: null,
        confirmedAt: null,
        createdAt: GENERATED_AT,
        updatedAt: GENERATED_AT,
      },
    ],
    decisions: [],
    milestones: [],
    projectEvents: [],
    promptVersions: [],
    projectPreferenceOverrides: [],
  };
}

describe("assembleAccountExportV1", () => {
  it("emits the durable schema marker and only caller-owned rows", () => {
    const result = assembleAccountExportV1(USER_ID, GENERATED_AT, source());

    expect(result.schema).toBe("unseenprompt.account-export");
    expect(result.schemaVersion).toBe(1);
    expect(result.profile.id).toBe(USER_ID);
    expect(result.preferences).toEqual(preferences);
    expect(result.projects.map((item) => item.id)).toEqual([PROJECT_ID]);
    expect(result.requirements.map((item) => item.id)).toEqual(["requirement-owned"]);
    expect(JSON.stringify(result)).not.toContain(OTHER_ID);
    expect(JSON.stringify(result)).not.toContain("Other requirement");
  });

  it("filters every project-owned collection even if its input contains another user", () => {
    const raw = source();
    const otherChild = { ...raw.requirements[0]!, projectId: OTHER_PROJECT_ID };
    const result = assembleAccountExportV1(USER_ID, GENERATED_AT, {
      ...raw,
      decisions: [
        {
          id: "other-decision",
          projectId: OTHER_PROJECT_ID,
          decisionKey: "stack",
          decision: "Other",
          status: "proposed",
          rationale: null,
          sourceEventId: null,
          supersedesDecisionId: null,
          confirmedAt: null,
          createdAt: GENERATED_AT,
          updatedAt: GENERATED_AT,
        },
      ],
      milestones: [
        {
          id: "other-milestone",
          projectId: OTHER_PROJECT_ID,
          position: 1,
          title: "Other",
          description: null,
          suggestedStatus: "pending",
          confirmedStatus: null,
          blockedReason: null,
          confirmationEventId: null,
          createdAt: GENERATED_AT,
          updatedAt: GENERATED_AT,
        },
      ],
      requirements: [...raw.requirements, otherChild],
      projectEvents: [
        {
          id: "other-event",
          projectId: OTHER_PROJECT_ID,
          sequenceNumber: 1,
          eventType: "project.created",
          actorType: "user",
          actorId: OTHER_ID,
          payload: {},
          correlationId: "other",
          idempotencyRecordId: null,
          createdAt: GENERATED_AT,
        },
      ],
      promptVersions: [
        {
          id: "other-prompt",
          projectId: OTHER_PROJECT_ID,
          generationRunId: null,
          tool: "codex",
          version: 1,
          source: "generated",
          projectStateVersion: 1,
          actionSpecification: {},
          promptText: "private other prompt",
          acceptanceCriteria: {},
          supersedesPromptVersionId: null,
          contentHash: "hash",
          createdAt: GENERATED_AT,
        },
      ],
      projectPreferenceOverrides: [
        {
          id: "other-override",
          projectId: OTHER_PROJECT_ID,
          skillLevel: "beginner",
          preferredStackBehavior: null,
          preferredStack: null,
          codingStyle: null,
          deploymentPreference: null,
          createdAt: GENERATED_AT,
          updatedAt: GENERATED_AT,
        },
      ],
    });

    expect(result.decisions).toEqual([]);
    expect(result.milestones).toEqual([]);
    expect(result.projectEvents).toEqual([]);
    expect(result.promptVersions).toEqual([]);
    expect(result.projectPreferenceOverrides).toEqual([]);
  });

  it("fails closed when the caller profile is absent", () => {
    expect(() =>
      assembleAccountExportV1(USER_ID, GENERATED_AT, { ...source(), profiles: [] }),
    ).toThrow("account_export:profile_not_found");
  });

  it("contains no artifact, storage, URL, provider-metadata, or secret fields", () => {
    const serialized = JSON.stringify(assembleAccountExportV1(USER_ID, GENERATED_AT, source()));

    for (const forbidden of [
      "artifact",
      "objectPath",
      "signedUrl",
      "raw_user_meta_data",
      "serviceRole",
      "secret",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
