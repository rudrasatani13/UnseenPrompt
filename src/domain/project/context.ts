import { z } from "zod";

import type { EffectiveField, EffectivePreferences } from "@/domain/account/effective-preferences";
import type {
  CodingStyle,
  DeploymentPreference,
  PreferredStack,
  PreferredStackBehavior,
  SkillLevel,
} from "@/domain/account/contracts";

import {
  ENTITY_STATUSES,
  MILESTONE_STATUSES,
  PROJECT_CONTEXT_SCHEMA,
  PROJECT_MODES,
  PROJECT_SCHEMA_VERSION,
  PROJECT_STAGES,
  PROJECT_TOOLS,
  SUMMARY_STATUSES,
  ProjectDomainError,
  type ProjectDecisionV1,
  type ProjectJsonValue,
  type ProjectMilestoneV1,
  type ProjectRequirementV1,
  type ProjectSummaryV1,
  type RecentEvidenceDescriptorV1,
  type ProjectMode,
  type ProjectStage,
  type ProjectTool,
  type MilestoneStatus,
} from "./contracts";
import { serializeCanonicalJsonV1 } from "./commands";

/** Code-owned provider-neutral context limits. Callers can only lower these values. */
export const DEFAULT_CONTEXT_MAX_UTF8_BYTES = 65_536 as const;
export const DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS = 16_384 as const;
export const MAX_CONTEXT_RECENT_EVIDENCE = 20 as const;
export const CONTEXT_TOKEN_ESTIMATOR = "utf8_bytes_divided_by_4_ceiling_v1" as const;

export const CONTEXT_PREFERENCE_FIELDS = [
  "skillLevel",
  "preferredStackBehavior",
  "preferredStack",
  "codingStyle",
  "deploymentPreference",
] as const;
export type ContextPreferenceField = (typeof CONTEXT_PREFERENCE_FIELDS)[number];

/** Canonical case/line-ending key used for provider-neutral context ordering. */
export function canonicalContextSortKeyV1(value: string): string {
  return value.replace(/\r\n?/g, "\n").normalize("NFC").toLowerCase();
}

/** Summary kinds use one key for duplicate detection and deterministic ordering. */
export function canonicalSummaryKindKeyV1(value: string): string {
  return canonicalContextSortKeyV1(value);
}

/** UUID text is case-insensitive even though the wire representation is textual. */
export function canonicalUuidKeyV1(value: string): string {
  return value.toLowerCase();
}

/** Decision keys retain the command-boundary trim rule and context line-ending normalization. */
export function canonicalDecisionKeyV1(value: string): string {
  return canonicalContextSortKeyV1(value).trim();
}

export interface ProjectContextInputV1 {
  /** Used only to prove every canonical child row belongs to this snapshot. */
  readonly projectId: string;
  readonly mode: ProjectMode;
  readonly stage: ProjectStage;
  readonly stateVersion: number;
  readonly selectedTool: ProjectTool | null;
  readonly blockerSummary: string | null;
  readonly requirements: readonly ProjectRequirementV1[];
  readonly decisions: readonly ProjectDecisionV1[];
  readonly activeMilestone: ProjectMilestoneV1 | null;
  readonly effectivePreferences: EffectivePreferences | null;
  readonly summaries: readonly ProjectSummaryV1[];
  /** Phase 6 receives trusted descriptors; later loaders must enforce project ownership upstream. */
  readonly recentEvidence: readonly RecentEvidenceDescriptorV1[];
}

export interface ContextBudgetV1 {
  readonly maxUtf8Bytes: number;
  readonly maxEstimatedTokens: number;
}

export interface ContextBudgetInputV1 {
  readonly maxUtf8Bytes?: number | undefined;
  readonly maxEstimatedTokens?: number | undefined;
}

export interface ContextRequirementRecordV1 {
  readonly id: string;
  readonly category: string;
  readonly statement: string;
  readonly rationale: string | null;
  readonly confirmedAt: string;
}

export interface ContextDecisionRecordV1 {
  readonly id: string;
  readonly decisionKey: string;
  readonly decision: string;
  readonly rationale: string | null;
  readonly confirmedAt: string;
}

export interface ContextMilestoneRecordV1 {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly description: string | null;
  readonly suggestedStatus: MilestoneStatus;
  readonly confirmedStatus: MilestoneStatus | null;
  readonly confirmationEventId: string | null;
  readonly blockedReason: string | null;
}

export interface ContextPreferenceRecordV1<T = unknown> {
  readonly value: T;
  readonly source: "global" | "project";
}

export type ContextPreferencesV1 = Partial<{
  readonly skillLevel: ContextPreferenceRecordV1<SkillLevel>;
  readonly preferredStackBehavior: ContextPreferenceRecordV1<PreferredStackBehavior>;
  readonly preferredStack: ContextPreferenceRecordV1<PreferredStack>;
  readonly codingStyle: ContextPreferenceRecordV1<CodingStyle>;
  readonly deploymentPreference: ContextPreferenceRecordV1<DeploymentPreference | null>;
}>;

export interface ContextSummaryRecordV1 {
  readonly id: string;
  readonly summaryKind: string;
  readonly version: number;
  readonly basedOnEventSequence: number;
  readonly summaryText: string;
  readonly structuredFacts: ProjectJsonValue;
}

export interface ContextEvidenceRecordV1 {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  readonly occurredAt: string;
  readonly evidenceLabel: string | null;
}

export interface ProjectContextDocumentV1 {
  readonly mode: ProjectMode;
  readonly stage: ProjectStage;
  readonly stateVersion: number;
  readonly selectedTool: ProjectTool | null;
  readonly requirements: readonly ContextRequirementRecordV1[];
  readonly decisions: readonly ContextDecisionRecordV1[];
  readonly activeMilestone: ContextMilestoneRecordV1 | null;
  readonly preferences: ContextPreferencesV1 | null;
  readonly summaries: readonly ContextSummaryRecordV1[];
  readonly recentEvidence: readonly ContextEvidenceRecordV1[];
  readonly blockerSummary: string | null;
}

export type ContextOmissionReason =
  "budget_exceeded" | "not_current" | "future_state_version" | "evidence_cap";

export interface ContextOmissionV1 {
  readonly section: "preference" | "summary" | "evidence";
  readonly selector: string;
  readonly reason: ContextOmissionReason;
  readonly id?: string;
  readonly kind?: string;
  readonly field?: ContextPreferenceField;
}

export interface ContextSummaryBoundaryV1 {
  readonly inputCount: number;
  readonly currentCount: number;
  readonly eligibleCount: number;
  readonly maxBasedOnEventSequence: number;
}

export interface ContextEvidenceBoundaryV1 {
  readonly inputCount: number;
  readonly cappedCount: number;
  readonly cap: typeof MAX_CONTEXT_RECENT_EVIDENCE;
}

export interface CompiledProjectContextV1 {
  readonly schema: typeof PROJECT_CONTEXT_SCHEMA;
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  readonly context: string;
  readonly utf8Bytes: number;
  readonly estimatedTokens: number;
  readonly estimator: typeof CONTEXT_TOKEN_ESTIMATOR;
  readonly projectStateVersion: number;
  readonly included: {
    readonly requirementIds: readonly string[];
    readonly decisionIds: readonly string[];
    readonly activeMilestoneId: string | null;
    readonly preferenceFields: readonly ContextPreferenceField[];
    readonly summaryIds: readonly string[];
    readonly evidenceIds: readonly string[];
  };
  readonly omittedOptional: readonly ContextOmissionV1[];
  readonly summaryBoundary: ContextSummaryBoundaryV1;
  readonly evidenceBoundary: ContextEvidenceBoundaryV1;
  readonly limits: ContextBudgetV1;
}

export interface ContextBudgetFailureDetailsV1 extends ContextBudgetV1 {
  readonly requiredUtf8Bytes: number;
  readonly requiredEstimatedTokens: number;
}

/**
 * Context compilation failures retain only safe numeric details. They never carry project text,
 * provider output, or database errors.
 */
export class ContextCompilationError extends ProjectDomainError {
  readonly details: ContextBudgetFailureDetailsV1 | null;

  constructor(
    code: "context_budget_invalid" | "confirmed_invariants_exceed_budget",
    details: ContextBudgetFailureDetailsV1 | null = null,
  ) {
    super(code);
    this.name = "ContextCompilationError";
    this.details = details;
  }
}

const uuidSchema = z.uuid();
const dateTimeSchema = z.string().datetime({ offset: true });
const jsonString = (maximum: number, allowEmpty = true) =>
  z
    .string()
    .refine((value) => new TextEncoder().encode(value).byteLength <= maximum, {
      message: `must be at most ${maximum} UTF-8 bytes`,
    })
    .refine((value) => allowEmpty || value.trim().length > 0, { message: "must be non-empty" });

function containsPrototypeKey(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => containsPrototypeKey(entry, seen));
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return true;
    if (containsPrototypeKey((value as Record<string, unknown>)[key], seen)) return true;
  }
  return false;
}

function isJsonValue(
  value: unknown,
  seen = new Set<object>(),
  depth = 0,
): value is ProjectJsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    const valid = value.every((entry) => isJsonValue(entry, seen, depth + 1));
    seen.delete(value);
    return valid;
  }
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return false;
  }
  if (prototype !== Object.prototype && prototype !== null) return false;
  for (const key of Object.keys(value)) {
    if (!isJsonValue((value as Record<string, unknown>)[key], seen, depth + 1)) {
      seen.delete(value);
      return false;
    }
  }
  seen.delete(value);
  try {
    return new TextEncoder().encode(serializeCanonicalJsonV1(value)).byteLength <= 65_536;
  } catch {
    return false;
  }
}

const rationaleSchema = jsonString(32_768).nullable();
const projectEntityStatusSchema = z.enum(ENTITY_STATUSES);
const milestoneStatusSchema = z.enum(MILESTONE_STATUSES);
const structuredFactsSchema = z.custom<ProjectJsonValue>(
  (value) =>
    isJsonValue(value) &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (() => {
      try {
        return new TextEncoder().encode(serializeCanonicalJsonV1(value)).byteLength <= 65_536;
      } catch {
        return false;
      }
    })(),
  { message: "must be a bounded JSON object" },
);

const requirementSchema: z.ZodType<ProjectRequirementV1> = z
  .strictObject({
    id: uuidSchema,
    projectId: uuidSchema,
    category: jsonString(255, false),
    statement: jsonString(16_384, false),
    rationale: rationaleSchema,
    status: projectEntityStatusSchema,
    sourceEventId: uuidSchema.nullable(),
    supersedesRequirementId: uuidSchema.nullable(),
    confirmedAt: dateTimeSchema.nullable(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .superRefine((value, context) => {
    if (value.status === "confirmed") {
      if (value.confirmedAt === null) {
        context.addIssue({
          code: "custom",
          path: ["confirmedAt"],
          message: "required for confirmed rows",
        });
      }
      if (value.sourceEventId === null) {
        context.addIssue({
          code: "custom",
          path: ["sourceEventId"],
          message: "required for confirmed rows",
        });
      }
    } else if (value.confirmedAt !== null) {
      context.addIssue({
        code: "custom",
        path: ["confirmedAt"],
        message: "only valid for confirmed rows",
      });
    }
  }) as z.ZodType<ProjectRequirementV1>;

const decisionSchema: z.ZodType<ProjectDecisionV1> = z
  .strictObject({
    id: uuidSchema,
    projectId: uuidSchema,
    decisionKey: jsonString(255, false),
    decision: jsonString(16_384, false),
    rationale: rationaleSchema,
    status: projectEntityStatusSchema,
    sourceEventId: uuidSchema.nullable(),
    supersedesDecisionId: uuidSchema.nullable(),
    confirmedAt: dateTimeSchema.nullable(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .superRefine((value, context) => {
    if (value.status === "confirmed") {
      if (value.confirmedAt === null) {
        context.addIssue({
          code: "custom",
          path: ["confirmedAt"],
          message: "required for confirmed rows",
        });
      }
      if (value.sourceEventId === null) {
        context.addIssue({
          code: "custom",
          path: ["sourceEventId"],
          message: "required for confirmed rows",
        });
      }
    } else if (value.confirmedAt !== null) {
      context.addIssue({
        code: "custom",
        path: ["confirmedAt"],
        message: "only valid for confirmed rows",
      });
    }
  }) as z.ZodType<ProjectDecisionV1>;

const milestoneSchema: z.ZodType<ProjectMilestoneV1> = z.strictObject({
  id: uuidSchema,
  projectId: uuidSchema,
  position: z.number().int().safe().positive(),
  title: jsonString(240, false),
  description: jsonString(32_768).nullable(),
  suggestedStatus: milestoneStatusSchema,
  confirmedStatus: milestoneStatusSchema.nullable(),
  confirmationEventId: uuidSchema.nullable(),
  blockedReason: jsonString(32_768).nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

const summarySchema: z.ZodType<ProjectSummaryV1> = z.strictObject({
  id: uuidSchema,
  projectId: uuidSchema,
  summaryKind: jsonString(255, false),
  version: z.number().int().safe().positive(),
  basedOnEventSequence: z.number().int().safe().positive(),
  summaryText: jsonString(65_536, false),
  structuredFacts: structuredFactsSchema,
  status: z.enum(SUMMARY_STATUSES),
  createdAt: dateTimeSchema,
});

const evidenceSchema: z.ZodType<RecentEvidenceDescriptorV1> = z.strictObject({
  id: uuidSchema,
  kind: jsonString(255, false),
  summary: jsonString(65_536, false),
  occurredAt: dateTimeSchema,
  evidenceLabel: jsonString(255).nullable(),
});

const preferredStackSchema = z.strictObject({
  frontend: jsonString(255, false).optional(),
  backend: jsonString(255, false).optional(),
  database: jsonString(255, false).optional(),
  hosting: jsonString(255, false).optional(),
}) as unknown as z.ZodType<PreferredStack>;
const codingStyleSchema = z.strictObject({
  comments: z.enum(["minimal", "standard", "detailed"]).optional(),
  testing: z.enum(["test_first", "tests_after", "minimal"]).optional(),
  paradigm: z.enum(["functional", "object_oriented", "mixed"]).optional(),
}) as unknown as z.ZodType<CodingStyle>;
const effectiveField = <T>(value: z.ZodType<T>): z.ZodType<EffectiveField<T>> =>
  z.strictObject({ value, source: z.enum(["global", "project"]) }) as z.ZodType<EffectiveField<T>>;
const effectivePreferencesSchema: z.ZodType<EffectivePreferences> = z.strictObject({
  skillLevel: effectiveField(z.enum(["beginner", "intermediate", "advanced"])),
  preferredStackBehavior: effectiveField(z.enum(["recommend", "prefer_saved", "ask"])),
  preferredStack: effectiveField(preferredStackSchema),
  codingStyle: effectiveField(codingStyleSchema),
  deploymentPreference: effectiveField(
    z.enum(["cloudflare", "vercel", "traditional_server"]).nullable(),
  ),
});

const contextRequirementRecordSchema: z.ZodType<ContextRequirementRecordV1> = z.strictObject({
  id: uuidSchema,
  category: jsonString(255, false),
  statement: jsonString(16_384, false),
  rationale: rationaleSchema,
  confirmedAt: dateTimeSchema,
});

const contextDecisionRecordSchema: z.ZodType<ContextDecisionRecordV1> = z.strictObject({
  id: uuidSchema,
  decisionKey: jsonString(255, false),
  decision: jsonString(16_384, false),
  rationale: rationaleSchema,
  confirmedAt: dateTimeSchema,
});

const contextMilestoneRecordSchema: z.ZodType<ContextMilestoneRecordV1> = z
  .strictObject({
    id: uuidSchema,
    position: z.number().int().safe().positive(),
    title: jsonString(240, false),
    description: jsonString(32_768).nullable(),
    suggestedStatus: milestoneStatusSchema,
    confirmedStatus: milestoneStatusSchema.nullable(),
    confirmationEventId: uuidSchema.nullable(),
    blockedReason: jsonString(32_768).nullable(),
  })
  .superRefine((value, context) => {
    if ((value.confirmedStatus === null) !== (value.confirmationEventId === null)) {
      context.addIssue({
        code: "custom",
        path: ["confirmationEventId"],
        message: "confirmation status and event must be both present or both absent",
      });
    }
    if (value.confirmedStatus === "blocked") {
      if (value.blockedReason === null) {
        context.addIssue({
          code: "custom",
          path: ["blockedReason"],
          message: "required for blocked milestones",
        });
      }
    } else if (value.blockedReason !== null) {
      context.addIssue({
        code: "custom",
        path: ["blockedReason"],
        message: "only valid for blocked milestones",
      });
    }
  }) as z.ZodType<ContextMilestoneRecordV1>;

const contextSummaryRecordSchema: z.ZodType<ContextSummaryRecordV1> = z.strictObject({
  id: uuidSchema,
  summaryKind: jsonString(255, false),
  version: z.number().int().safe().positive(),
  basedOnEventSequence: z.number().int().safe().positive(),
  summaryText: jsonString(65_536, false),
  structuredFacts: structuredFactsSchema,
});

const contextEvidenceRecordSchema: z.ZodType<ContextEvidenceRecordV1> = z.strictObject({
  id: uuidSchema,
  kind: jsonString(255, false),
  summary: jsonString(65_536, false),
  occurredAt: dateTimeSchema,
  evidenceLabel: jsonString(255).nullable(),
});

const contextPreferencesSchema = z.strictObject({
  skillLevel: effectiveField(z.enum(["beginner", "intermediate", "advanced"])).optional(),
  preferredStackBehavior: effectiveField(z.enum(["recommend", "prefer_saved", "ask"])).optional(),
  preferredStack: effectiveField(preferredStackSchema).optional(),
  codingStyle: effectiveField(codingStyleSchema).optional(),
  deploymentPreference: effectiveField(
    z.enum(["cloudflare", "vercel", "traditional_server"]).nullable(),
  ).optional(),
}) as unknown as z.ZodType<ContextPreferencesV1>;

const contextDocumentSchema = z
  .strictObject({
    mode: z.enum(PROJECT_MODES),
    stage: z.enum(PROJECT_STAGES),
    stateVersion: z.number().int().safe().positive(),
    selectedTool: z.enum(PROJECT_TOOLS).nullable(),
    requirements: z.array(contextRequirementRecordSchema).max(1_024),
    decisions: z.array(contextDecisionRecordSchema).max(1_024),
    activeMilestone: contextMilestoneRecordSchema.nullable(),
    preferences: contextPreferencesSchema.nullable(),
    summaries: z.array(contextSummaryRecordSchema).max(1_024),
    recentEvidence: z.array(contextEvidenceRecordSchema).max(MAX_CONTEXT_RECENT_EVIDENCE),
    blockerSummary: jsonString(32_768, false).nullable(),
  })
  .superRefine((value, context) => {
    if (value.stage === "blocked" && value.blockerSummary === null) {
      context.addIssue({
        code: "custom",
        path: ["blockerSummary"],
        message: "required for blocked stage",
      });
    } else if (
      value.stage !== "blocked" &&
      value.stage !== "archived" &&
      value.blockerSummary !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["blockerSummary"],
        message: "only valid for blocked or archived stage",
      });
    }
  }) as unknown as z.ZodType<ProjectContextDocumentV1>;

interface ContextValidationIssueV1 {
  readonly index: number;
  readonly message: string;
}

function lineageIssues<T extends { readonly id: string }>(
  rows: readonly T[],
  predecessorOf: (row: T) => string | null,
): readonly ContextValidationIssueV1[] {
  const issues: ContextValidationIssueV1[] = [];
  const byId = new Map<string, T>();
  rows.forEach((row) => byId.set(canonicalUuidKeyV1(row.id), row));

  const predecessorOwners = new Set<string>();
  rows.forEach((row, index) => {
    const predecessorId = predecessorOf(row);
    if (predecessorId === null) return;
    const rowId = canonicalUuidKeyV1(row.id);
    const predecessorKey = canonicalUuidKeyV1(predecessorId);
    if (predecessorKey === rowId) {
      issues.push({ index, message: "self lineage" });
      return;
    }
    if (!byId.has(predecessorKey)) {
      issues.push({ index, message: "missing predecessor" });
      return;
    }
    if (predecessorOwners.has(predecessorKey)) {
      issues.push({ index, message: "branching lineage" });
    }
    predecessorOwners.add(predecessorKey);

    const seen = new Set<string>([rowId]);
    let currentKey: string | null = predecessorKey;
    while (currentKey !== null) {
      if (seen.has(currentKey)) {
        issues.push({ index, message: "cyclic lineage" });
        break;
      }
      seen.add(currentKey);
      const current = byId.get(currentKey);
      if (current === undefined) break;
      const next = predecessorOf(current);
      currentKey = next === null ? null : canonicalUuidKeyV1(next);
    }
  });
  return issues;
}

export const projectContextInputSchema: z.ZodType<ProjectContextInputV1> = z.preprocess(
  (value) => (containsPrototypeKey(value) ? undefined : value),
  z
    .strictObject({
      projectId: uuidSchema,
      mode: z.enum(PROJECT_MODES),
      stage: z.enum(PROJECT_STAGES),
      stateVersion: z.number().int().safe().positive(),
      selectedTool: z.enum(PROJECT_TOOLS).nullable(),
      blockerSummary: jsonString(32_768, false).nullable(),
      requirements: z.array(requirementSchema).max(1_024),
      decisions: z.array(decisionSchema).max(1_024),
      activeMilestone: milestoneSchema.nullable(),
      effectivePreferences: effectivePreferencesSchema.nullable(),
      summaries: z.array(summarySchema).max(1_024),
      recentEvidence: z.array(evidenceSchema).max(1_024),
    })
    .superRefine((value, context) => {
      const addIssue = (path: (string | number)[], message: string): void => {
        context.addIssue({ code: "custom", path, message });
      };
      const collections = [
        ["requirements", value.requirements],
        ["decisions", value.decisions],
        ["summaries", value.summaries],
      ] as const;
      for (const [field, rows] of collections) {
        const seen = new Set<string>();
        rows.forEach((row, index) => {
          const id = canonicalUuidKeyV1(row.id);
          if (seen.has(id)) addIssue([field, index, "id"], "duplicate id");
          seen.add(id);
          if (canonicalUuidKeyV1(row.projectId) !== canonicalUuidKeyV1(value.projectId)) {
            addIssue([field, index, "projectId"], "project mismatch");
          }
        });
      }
      for (const issue of lineageIssues(value.requirements, (row) => row.supersedesRequirementId)) {
        addIssue(["requirements", issue.index, "supersedesRequirementId"], issue.message);
      }
      for (const issue of lineageIssues(value.decisions, (row) => row.supersedesDecisionId)) {
        addIssue(["decisions", issue.index, "supersedesDecisionId"], issue.message);
      }
      const activeDecisionKeys = new Set<string>();
      value.decisions.forEach((row, index) => {
        if (row.status !== "confirmed") return;
        const key = canonicalDecisionKeyV1(row.decisionKey);
        if (activeDecisionKeys.has(key)) {
          addIssue(["decisions", index, "decisionKey"], "duplicate confirmed decision key");
        }
        activeDecisionKeys.add(key);
      });
      const evidenceIds = new Set<string>();
      value.recentEvidence.forEach((row, index) => {
        const id = canonicalUuidKeyV1(row.id);
        if (evidenceIds.has(id)) addIssue(["recentEvidence", index, "id"], "duplicate id");
        evidenceIds.add(id);
      });
      const currentSummaryKinds = new Set<string>();
      value.summaries.forEach((row, index) => {
        if (row.status !== "current") return;
        const kind = canonicalSummaryKindKeyV1(row.summaryKind);
        if (currentSummaryKinds.has(kind)) {
          addIssue(["summaries", index, "summaryKind"], "duplicate current summary kind");
        }
        currentSummaryKinds.add(kind);
      });
      if (value.stage === "blocked" && value.blockerSummary === null) {
        addIssue(["blockerSummary"], "required for blocked stage");
      } else if (
        value.stage !== "blocked" &&
        value.stage !== "archived" &&
        value.blockerSummary !== null
      ) {
        addIssue(["blockerSummary"], "only valid for blocked or archived stage");
      }
      if (value.activeMilestone !== null) {
        if (
          canonicalUuidKeyV1(value.activeMilestone.projectId) !==
          canonicalUuidKeyV1(value.projectId)
        ) {
          addIssue(["activeMilestone", "projectId"], "project mismatch");
        }
        if (
          (value.activeMilestone.confirmedStatus === null) !==
          (value.activeMilestone.confirmationEventId === null)
        ) {
          addIssue(
            ["activeMilestone", "confirmationEventId"],
            "confirmation status and event must be both present or both absent",
          );
        }
        if (value.activeMilestone.confirmedStatus === "blocked") {
          if (value.activeMilestone.blockedReason === null) {
            addIssue(["activeMilestone", "blockedReason"], "required for blocked milestones");
          }
        } else if (value.activeMilestone.blockedReason !== null) {
          addIssue(["activeMilestone", "blockedReason"], "only valid for blocked milestones");
        }
      }
    }),
) as z.ZodType<ProjectContextInputV1>;

export function parseProjectContextInputV1(value: unknown): ProjectContextInputV1 {
  const parsed = projectContextInputSchema.safeParse(value);
  if (!parsed.success) throw new ProjectDomainError("validation_failed");
  return parsed.data;
}

export function safeParseProjectContextInputV1(
  value: unknown,
):
  | { readonly success: true; readonly data: ProjectContextInputV1 }
  | { readonly success: false; readonly error: z.ZodError } {
  return projectContextInputSchema.safeParse(value);
}

const budgetField = z.number().int().safe().positive();
export const contextBudgetSchema: z.ZodType<ContextBudgetInputV1> = z.strictObject({
  maxUtf8Bytes: budgetField.optional(),
  maxEstimatedTokens: budgetField.optional(),
});

const omissionSchema = z.strictObject({
  section: z.enum(["preference", "summary", "evidence"]),
  selector: jsonString(512, false),
  reason: z.enum(["budget_exceeded", "not_current", "future_state_version", "evidence_cap"]),
  id: uuidSchema.optional(),
  kind: jsonString(255, false).optional(),
  field: z.enum(CONTEXT_PREFERENCE_FIELDS).optional(),
}) as unknown as z.ZodType<ContextOmissionV1>;

const compiledContextSchema = z.strictObject({
  schema: z.literal(PROJECT_CONTEXT_SCHEMA),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  context: jsonString(4 * DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS, false),
  utf8Bytes: z.number().int().safe().nonnegative(),
  estimatedTokens: z.number().int().safe().nonnegative(),
  estimator: z.literal(CONTEXT_TOKEN_ESTIMATOR),
  projectStateVersion: z.number().int().safe().positive(),
  included: z.strictObject({
    requirementIds: z.array(uuidSchema),
    decisionIds: z.array(uuidSchema),
    activeMilestoneId: uuidSchema.nullable(),
    preferenceFields: z.array(z.enum(CONTEXT_PREFERENCE_FIELDS)),
    summaryIds: z.array(uuidSchema),
    evidenceIds: z.array(uuidSchema),
  }),
  omittedOptional: z.array(omissionSchema),
  summaryBoundary: z.strictObject({
    inputCount: z.number().int().safe().nonnegative(),
    currentCount: z.number().int().safe().nonnegative(),
    eligibleCount: z.number().int().safe().nonnegative(),
    maxBasedOnEventSequence: z.number().int().safe().nonnegative(),
  }),
  evidenceBoundary: z.strictObject({
    inputCount: z.number().int().safe().nonnegative(),
    cappedCount: z.number().int().safe().nonnegative(),
    cap: z.literal(MAX_CONTEXT_RECENT_EVIDENCE),
  }),
  limits: z.strictObject({
    maxUtf8Bytes: budgetField,
    maxEstimatedTokens: budgetField,
  }),
});

export const compiledProjectContextSchema: z.ZodType<CompiledProjectContextV1> =
  compiledContextSchema;

function containsCarriageReturn(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "string") return value.includes("\r");
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    const found = value.some((entry) => containsCarriageReturn(entry, seen));
    seen.delete(value);
    return found;
  }
  for (const key of Object.keys(value)) {
    if (
      key.includes("\r") ||
      containsCarriageReturn((value as Record<string, unknown>)[key], seen)
    ) {
      seen.delete(value);
      return true;
    }
  }
  seen.delete(value);
  return false;
}

function hasUniqueCanonicalUuids(values: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = canonicalUuidKeyV1(value);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function sameCanonicalUuidSequence(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => canonicalUuidKeyV1(value) === canonicalUuidKeyV1(right[index]!))
  );
}

function sameStringSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareContextRequirements(
  left: ContextRequirementRecordV1,
  right: ContextRequirementRecordV1,
): number {
  return (
    compareStrings(
      canonicalContextSortKeyV1(left.category),
      canonicalContextSortKeyV1(right.category),
    ) ||
    timestampValue(left.confirmedAt) - timestampValue(right.confirmedAt) ||
    compareStrings(canonicalUuidKeyV1(left.id), canonicalUuidKeyV1(right.id))
  );
}

function compareContextDecisions(
  left: ContextDecisionRecordV1,
  right: ContextDecisionRecordV1,
): number {
  return (
    compareStrings(
      canonicalContextSortKeyV1(left.decisionKey),
      canonicalContextSortKeyV1(right.decisionKey),
    ) ||
    timestampValue(left.confirmedAt) - timestampValue(right.confirmedAt) ||
    compareStrings(canonicalUuidKeyV1(left.id), canonicalUuidKeyV1(right.id))
  );
}

function compareContextSummaries(
  left: ContextSummaryRecordV1,
  right: ContextSummaryRecordV1,
): number {
  return (
    compareStrings(
      canonicalSummaryKindKeyV1(left.summaryKind),
      canonicalSummaryKindKeyV1(right.summaryKind),
    ) ||
    right.version - left.version ||
    compareStrings(canonicalUuidKeyV1(left.id), canonicalUuidKeyV1(right.id))
  );
}

function compareContextEvidence(
  left: ContextEvidenceRecordV1,
  right: ContextEvidenceRecordV1,
): number {
  return (
    timestampValue(right.occurredAt) - timestampValue(left.occurredAt) ||
    compareStrings(canonicalUuidKeyV1(left.id), canonicalUuidKeyV1(right.id))
  );
}

function isCanonicalOrder<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (compare(values[index - 1]!, values[index]!) > 0) return false;
  }
  return true;
}

function compiledMetadataIsConsistent(
  value: CompiledProjectContextV1,
  document: ProjectContextDocumentV1,
): boolean {
  if (
    value.limits.maxUtf8Bytes > DEFAULT_CONTEXT_MAX_UTF8_BYTES ||
    value.limits.maxEstimatedTokens > DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS ||
    value.projectStateVersion !== document.stateVersion
  ) {
    return false;
  }

  const requirementIds = document.requirements.map((row) => row.id);
  const decisionIds = document.decisions.map((row) => row.id);
  const summaryIds = document.summaries.map((row) => row.id);
  const evidenceIds = document.recentEvidence.map((row) => row.id);
  if (
    !hasUniqueCanonicalUuids(requirementIds) ||
    !hasUniqueCanonicalUuids(decisionIds) ||
    !hasUniqueCanonicalUuids(summaryIds) ||
    !hasUniqueCanonicalUuids(evidenceIds) ||
    !sameCanonicalUuidSequence(value.included.requirementIds, requirementIds) ||
    !sameCanonicalUuidSequence(value.included.decisionIds, decisionIds) ||
    !sameCanonicalUuidSequence(value.included.summaryIds, summaryIds) ||
    !sameCanonicalUuidSequence(value.included.evidenceIds, evidenceIds) ||
    (value.included.activeMilestoneId === null) !== (document.activeMilestone === null)
  ) {
    return false;
  }
  const summaryKinds = document.summaries.map((row) => canonicalSummaryKindKeyV1(row.summaryKind));
  if (
    new Set(summaryKinds).size !== summaryKinds.length ||
    !isCanonicalOrder(document.requirements, compareContextRequirements) ||
    !isCanonicalOrder(document.decisions, compareContextDecisions) ||
    !isCanonicalOrder(document.summaries, compareContextSummaries) ||
    !isCanonicalOrder(document.recentEvidence, compareContextEvidence)
  ) {
    return false;
  }
  if (
    value.included.activeMilestoneId !== null &&
    document.activeMilestone !== null &&
    canonicalUuidKeyV1(value.included.activeMilestoneId) !==
      canonicalUuidKeyV1(document.activeMilestone.id)
  ) {
    return false;
  }
  if (document.summaries.some((row) => row.basedOnEventSequence > document.stateVersion)) {
    return false;
  }

  const documentPreferenceFields =
    document.preferences === null
      ? []
      : CONTEXT_PREFERENCE_FIELDS.filter((field) => Object.hasOwn(document.preferences!, field));
  if (
    !sameStringSequence(value.included.preferenceFields, documentPreferenceFields) ||
    new Set(value.included.preferenceFields).size !== value.included.preferenceFields.length
  ) {
    return false;
  }

  const summaryOmissions = value.omittedOptional.filter((item) => item.section === "summary");
  const summaryOmittedIds = new Set<string>();
  let notCurrentCount = 0;
  let futureCount = 0;
  let summaryBudgetCount = 0;
  for (const item of summaryOmissions) {
    if (
      item.id === undefined ||
      item.kind === undefined ||
      item.field !== undefined ||
      item.selector !== `summary:${item.id}:${item.kind}`
    ) {
      return false;
    }
    const id = canonicalUuidKeyV1(item.id);
    if (summaryOmittedIds.has(id) || summaryIds.some((entry) => canonicalUuidKeyV1(entry) === id)) {
      return false;
    }
    summaryOmittedIds.add(id);
    if (item.reason === "not_current") notCurrentCount += 1;
    else if (item.reason === "future_state_version") futureCount += 1;
    else if (item.reason === "budget_exceeded") summaryBudgetCount += 1;
    else return false;
  }
  const summaryBoundary = value.summaryBoundary;
  if (
    summaryBoundary.inputCount > 1_024 ||
    summaryBoundary.currentCount > summaryBoundary.inputCount ||
    summaryBoundary.eligibleCount > summaryBoundary.currentCount ||
    summaryBoundary.maxBasedOnEventSequence !== document.stateVersion ||
    summaryBoundary.inputCount !== summaryIds.length + summaryOmissions.length ||
    summaryBoundary.currentCount !== summaryIds.length + futureCount + summaryBudgetCount ||
    summaryBoundary.eligibleCount !== summaryIds.length + summaryBudgetCount ||
    notCurrentCount + futureCount + summaryBudgetCount !== summaryOmissions.length
  ) {
    return false;
  }

  const preferenceOmissions = value.omittedOptional.filter((item) => item.section === "preference");
  const omittedPreferenceFields: ContextPreferenceField[] = [];
  for (const item of preferenceOmissions) {
    if (
      item.field === undefined ||
      item.reason !== "budget_exceeded" ||
      item.id !== undefined ||
      item.kind !== undefined ||
      item.selector !== `preference:${item.field}`
    ) {
      return false;
    }
    omittedPreferenceFields.push(item.field);
  }
  const preferenceFieldsPartitioned = sameStringSequence(
    [...value.included.preferenceFields, ...omittedPreferenceFields].sort(),
    [...CONTEXT_PREFERENCE_FIELDS].sort(),
  );
  if (
    new Set(omittedPreferenceFields).size !== omittedPreferenceFields.length ||
    (document.preferences === null
      ? value.included.preferenceFields.length !== 0 || preferenceOmissions.length !== 0
      : !preferenceFieldsPartitioned)
  ) {
    return false;
  }

  const evidenceOmissions = value.omittedOptional.filter((item) => item.section === "evidence");
  const evidenceOmittedIds = new Set<string>();
  let evidenceBudgetCount = 0;
  let evidenceCapCount = 0;
  for (const item of evidenceOmissions) {
    if (
      item.id === undefined ||
      item.kind === undefined ||
      item.field !== undefined ||
      item.selector !== `evidence:${item.id}:${item.kind}`
    ) {
      return false;
    }
    const id = canonicalUuidKeyV1(item.id);
    if (
      evidenceOmittedIds.has(id) ||
      evidenceIds.some((entry) => canonicalUuidKeyV1(entry) === id)
    ) {
      return false;
    }
    evidenceOmittedIds.add(id);
    if (item.reason === "budget_exceeded") evidenceBudgetCount += 1;
    else if (item.reason === "evidence_cap") evidenceCapCount += 1;
    else return false;
  }
  const evidenceBoundary = value.evidenceBoundary;
  if (
    evidenceBoundary.inputCount > 1_024 ||
    evidenceBoundary.cappedCount !==
      Math.min(evidenceBoundary.inputCount, MAX_CONTEXT_RECENT_EVIDENCE) ||
    evidenceBoundary.inputCount !== evidenceIds.length + evidenceOmissions.length ||
    evidenceBoundary.cappedCount !== evidenceIds.length + evidenceBudgetCount ||
    evidenceCapCount !== evidenceBoundary.inputCount - evidenceBoundary.cappedCount
  ) {
    return false;
  }

  if (value.omittedOptional.length > 2_058) return false;
  return true;
}

export function parseCompiledProjectContextV1(value: unknown): CompiledProjectContextV1 {
  const parsed = compiledProjectContextSchema.safeParse(value);
  if (!parsed.success) throw new ProjectDomainError("validation_failed");
  if (containsCarriageReturn(parsed.data)) throw new ProjectDomainError("validation_failed");
  const parsedDocument = (() => {
    let documentValue: unknown;
    try {
      documentValue = JSON.parse(parsed.data.context) as unknown;
    } catch {
      return null;
    }
    const result = contextDocumentSchema.safeParse(documentValue);
    return result.success ? result.data : null;
  })();
  if (parsedDocument === null || !compiledMetadataIsConsistent(parsed.data, parsedDocument)) {
    throw new ProjectDomainError("validation_failed");
  }
  let canonicalContext: string;
  try {
    canonicalContext = serializeCanonicalJsonV1(parsedDocument);
  } catch {
    throw new ProjectDomainError("validation_failed");
  }
  const utf8Bytes = new TextEncoder().encode(canonicalContext).byteLength;
  if (
    canonicalContext !== parsed.data.context ||
    utf8Bytes !== parsed.data.utf8Bytes ||
    Math.ceil(utf8Bytes / 4) !== parsed.data.estimatedTokens ||
    utf8Bytes > parsed.data.limits.maxUtf8Bytes ||
    parsed.data.estimatedTokens > parsed.data.limits.maxEstimatedTokens
  ) {
    throw new ProjectDomainError("validation_failed");
  }
  return parsed.data;
}

/** Re-exported for callers that need the same canonical byte contract as the compiler. */
export { serializeCanonicalJsonV1 };
