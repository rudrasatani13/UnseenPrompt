import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveEffectivePreferences,
  type EffectivePreferences,
  type ProjectPreferenceOverride,
} from "@/domain/account/effective-preferences";
import type { Preferences } from "@/domain/account/contracts";
import { preferencesSchema } from "@/domain/account/onboarding";
import {
  canonicalContextSortKeyV1,
  canonicalSummaryKindKeyV1,
  canonicalUuidKeyV1,
} from "@/domain/project/context";
import {
  PROJECT_ERROR_CODES,
  PROJECT_MODES,
  PROJECT_STAGES,
  PROJECT_TOOLS,
  ENTITY_STATUSES,
  MILESTONE_STATUSES,
  SUMMARY_STATUSES,
  ProjectDomainError,
  type ProjectCommitResultV1,
  type ProjectCommandEnvelopeV1,
  type ProjectCommandV1,
  type ProjectDecisionV1,
  type ProjectJsonValue,
  type ProjectMilestoneV1,
  type ProjectProjectionV1,
  type ProjectRequirementV1,
  type ProjectStateSnapshotV1,
  type ProjectSummaryV1,
} from "@/domain/project/contracts";
import {
  canonicalizeProjectCommandV1,
  parseProjectCommandV1,
  serializeCanonicalJsonV1,
} from "@/domain/project/commands";
import type { Database } from "@/lib/supabase/database.types";

import type { ApplyValidatedDeltaV1, ProjectStateRepository } from "./project-state-repository";

const UUID = z.uuid();
const POSITIVE_INTEGER = z.number().int().safe().positive();
const DATE_TIME = z.string().datetime({ offset: true });
const MODE = z.enum(PROJECT_MODES);
const STAGE = z.enum(PROJECT_STAGES);
const NORMAL_STAGE = z.enum([
  "discovery",
  "brief_confirmation",
  "ready_for_prompt",
  "prompt_active",
  "awaiting_return",
  "result_review",
  "iteration",
  "completed",
] as const);
const ARCHIVED_FROM_STAGE = z
  .enum([
    "discovery",
    "brief_confirmation",
    "ready_for_prompt",
    "prompt_active",
    "awaiting_return",
    "result_review",
    "iteration",
    "completed",
    "blocked",
  ] as const)
  .nullable();
const TOOL = z.enum(PROJECT_TOOLS).nullable();
const ENTITY_STATUS = z.enum(ENTITY_STATUSES);
const MILESTONE_STATUS = z.enum(MILESTONE_STATUSES);
const SUMMARY_STATUS = z.enum(SUMMARY_STATUSES);

const boundedText = (maximum: number, allowEmpty = false) =>
  z
    .string()
    .refine((value) => new TextEncoder().encode(value).byteLength <= maximum)
    .refine((value) => allowEmpty || value.trim().length > 0);

const jsonObject = z.custom<ProjectJsonValue>((value) => {
  if (!isJsonValue(value) || typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    return new TextEncoder().encode(serializeCanonicalJsonV1(value)).byteLength <= 65_536;
  } catch {
    return false;
  }
});

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
  if (prototype !== Object.prototype && prototype !== null) {
    seen.delete(value);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      seen.delete(value);
      return false;
    }
    if (!isJsonValue((value as Record<string, unknown>)[key], seen, depth + 1)) {
      seen.delete(value);
      return false;
    }
  }
  seen.delete(value);
  return true;
}

const projectionRowSchema = z
  .strictObject({
    id: UUID,
    mode: MODE,
    stage: STAGE,
    state_version: POSITIVE_INTEGER,
    selected_tool: TOOL,
    active_milestone_id: UUID.nullable(),
    blocker_summary: boundedText(32_768).nullable(),
    blocked_from_stage: NORMAL_STAGE.nullable(),
    archived_from_stage: ARCHIVED_FROM_STAGE,
    archived_at: DATE_TIME.nullable(),
  })
  .superRefine((row, context) => {
    const issue = (path: string[]) =>
      context.addIssue({ code: "custom", path, message: "invalid resume state" });
    if (row.stage === "blocked") {
      if (row.blocker_summary === null) issue(["blocker_summary"]);
      if (row.blocked_from_stage === null) issue(["blocked_from_stage"]);
      if (row.archived_from_stage !== null) issue(["archived_from_stage"]);
      if (row.archived_at !== null) issue(["archived_at"]);
    } else if (row.stage === "archived") {
      if (row.archived_from_stage === null) issue(["archived_from_stage"]);
      if (row.archived_at === null) issue(["archived_at"]);
      if (row.archived_from_stage === "blocked") {
        if (row.blocker_summary === null) issue(["blocker_summary"]);
        if (row.blocked_from_stage === null) issue(["blocked_from_stage"]);
      } else {
        if (row.blocker_summary !== null) issue(["blocker_summary"]);
        if (row.blocked_from_stage !== null) issue(["blocked_from_stage"]);
      }
    } else {
      if (row.blocker_summary !== null) issue(["blocker_summary"]);
      if (row.blocked_from_stage !== null) issue(["blocked_from_stage"]);
      if (row.archived_from_stage !== null) issue(["archived_from_stage"]);
      if (row.archived_at !== null) issue(["archived_at"]);
    }
  });

const requirementRowSchema = z
  .strictObject({
    id: UUID,
    project_id: UUID,
    category: boundedText(255),
    statement: boundedText(16_384),
    rationale: boundedText(32_768).nullable(),
    status: ENTITY_STATUS,
    source_event_id: UUID.nullable(),
    supersedes_requirement_id: UUID.nullable(),
    confirmed_at: DATE_TIME.nullable(),
    created_at: DATE_TIME,
    updated_at: DATE_TIME,
  })
  .superRefine((row, context) => {
    if ((row.status === "confirmed") !== (row.confirmed_at !== null)) {
      context.addIssue({ code: "custom", path: ["confirmed_at"], message: "invalid confirmation" });
    }
    if (row.status === "confirmed" && row.source_event_id === null) {
      context.addIssue({ code: "custom", path: ["source_event_id"], message: "required" });
    }
    if (row.supersedes_requirement_id === row.id) {
      context.addIssue({
        code: "custom",
        path: ["supersedes_requirement_id"],
        message: "self lineage",
      });
    }
  });

const decisionRowSchema = z
  .strictObject({
    id: UUID,
    project_id: UUID,
    decision_key: boundedText(255),
    decision: boundedText(16_384),
    rationale: boundedText(32_768).nullable(),
    status: ENTITY_STATUS,
    source_event_id: UUID.nullable(),
    supersedes_decision_id: UUID.nullable(),
    confirmed_at: DATE_TIME.nullable(),
    created_at: DATE_TIME,
    updated_at: DATE_TIME,
  })
  .superRefine((row, context) => {
    if ((row.status === "confirmed") !== (row.confirmed_at !== null)) {
      context.addIssue({ code: "custom", path: ["confirmed_at"], message: "invalid confirmation" });
    }
    if (row.status === "confirmed" && row.source_event_id === null) {
      context.addIssue({ code: "custom", path: ["source_event_id"], message: "required" });
    }
    if (row.supersedes_decision_id === row.id) {
      context.addIssue({
        code: "custom",
        path: ["supersedes_decision_id"],
        message: "self lineage",
      });
    }
  });

const milestoneRowSchema = z
  .strictObject({
    id: UUID,
    project_id: UUID,
    position: POSITIVE_INTEGER,
    title: boundedText(240),
    description: boundedText(32_768).nullable(),
    suggested_status: MILESTONE_STATUS,
    confirmed_status: MILESTONE_STATUS.nullable(),
    confirmation_event_id: UUID.nullable(),
    blocked_reason: boundedText(32_768).nullable(),
    created_at: DATE_TIME,
    updated_at: DATE_TIME,
  })
  .superRefine((row, context) => {
    if (row.confirmed_status === "blocked") {
      if (row.blocked_reason === null) {
        context.addIssue({ code: "custom", path: ["blocked_reason"], message: "required" });
      }
    } else if (row.blocked_reason !== null) {
      context.addIssue({
        code: "custom",
        path: ["blocked_reason"],
        message: "only valid when blocked",
      });
    }
    if ((row.confirmed_status !== null) !== (row.confirmation_event_id !== null)) {
      context.addIssue({
        code: "custom",
        path: ["confirmation_event_id"],
        message: "invalid confirmation",
      });
    }
  });

const summaryRowSchema = z.strictObject({
  id: UUID,
  project_id: UUID,
  summary_kind: boundedText(255),
  version: POSITIVE_INTEGER,
  based_on_event_sequence: POSITIVE_INTEGER,
  summary_text: boundedText(65_536),
  structured_facts: jsonObject,
  status: SUMMARY_STATUS,
  created_at: DATE_TIME,
});

const preferenceRowSchema = z.strictObject({
  skill_level: z.unknown(),
  preferred_stack_behavior: z.unknown(),
  preferred_stack: z.unknown(),
  coding_style: z.unknown(),
  deployment_preference: z.unknown(),
});

const preferredStackSchema = z.strictObject({
  frontend: boundedText(255).optional(),
  backend: boundedText(255).optional(),
  database: boundedText(255).optional(),
  hosting: boundedText(255).optional(),
});
const codingStyleSchema = z.strictObject({
  comments: z.enum(["minimal", "standard", "detailed"]).optional(),
  testing: z.enum(["test_first", "tests_after", "minimal"]).optional(),
  paradigm: z.enum(["functional", "object_oriented", "mixed"]).optional(),
});
const overrideRowSchema = z.strictObject({
  skill_level: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
  preferred_stack_behavior: z.enum(["recommend", "prefer_saved", "ask"]).nullable(),
  preferred_stack: preferredStackSchema.nullable(),
  coding_style: codingStyleSchema.nullable(),
  deployment_preference: z.enum(["cloudflare", "vercel", "traditional_server"]).nullable(),
});

/**
 * The snapshot RPC is the sole read boundary. Its root is deliberately strict so a changed SQL
 * contract cannot silently widen the context compiler input. Evidence remains an explicit empty
 * section until the evidence pipeline is implemented.
 */
const projectStateSnapshotRpcSchema = z.strictObject({
  projection: projectionRowSchema,
  requirements: z.array(requirementRowSchema),
  decisions: z.array(decisionRowSchema),
  milestones: z.array(milestoneRowSchema),
  summaries: z.array(summaryRowSchema),
  preferences: preferenceRowSchema.nullable(),
  project_preference_override: overrideRowSchema.nullable(),
  recent_evidence: z.array(z.unknown()).length(0),
});

const projectCommandResultSchema = z.strictObject({
  project_id: UUID,
  event_id: UUID,
  state_version: POSITIVE_INTEGER,
  replayed: z.boolean(),
});

const rpcEnvelopeSchema = z.object({ data: z.unknown(), error: z.unknown() }).strip();
const projectIdSchema = UUID;
const applyInputSchema = z.strictObject({
  projectId: UUID,
  generationRunId: UUID,
  expectedStateVersion: POSITIVE_INTEGER,
});

export interface ExecuteProjectCommandRpcArgs {
  readonly p_project_id: string;
  readonly p_expected_state_version: number;
  readonly p_idempotency_key: string;
  readonly p_request_fingerprint: string;
  readonly p_command: ProjectCommandV1;
}

export interface ApplyValidatedProjectDeltaRpcArgs {
  readonly p_project_id: string;
  readonly p_generation_run_id: string;
  readonly p_expected_state_version: number;
}

export interface GetProjectStateSnapshotRpcArgs {
  readonly p_project_id: string;
}

export interface ProjectStateRpcResult {
  readonly data: unknown;
  readonly error: unknown;
}

export interface ProjectStateRpcClient {
  rpc(
    functionName: "get_project_state_snapshot_v1",
    args: GetProjectStateSnapshotRpcArgs,
  ): PromiseLike<ProjectStateRpcResult>;
  rpc(
    functionName: "execute_project_command_v1",
    args: ExecuteProjectCommandRpcArgs,
  ): PromiseLike<ProjectStateRpcResult>;
  rpc(
    functionName: "apply_validated_project_delta_v1",
    args: ApplyValidatedProjectDeltaRpcArgs,
  ): PromiseLike<ProjectStateRpcResult>;
}
export type ProjectStateSupabaseClient = ProjectStateRpcClient;

const SAFE_ERROR_CODES = new Set<string>(PROJECT_ERROR_CODES);

function persistenceFailure(): ProjectDomainError {
  return new ProjectDomainError("persistence_failed");
}

function exactErrorField(value: unknown, field: "code" | "message"): string | null {
  if (typeof value === "string") return field === "message" ? value : null;
  if (typeof value !== "object" || value === null || value instanceof Error) return null;
  const candidate = value as { readonly code?: unknown; readonly message?: unknown };
  return typeof candidate[field] === "string" ? candidate[field] : null;
}

function mapRpcError(value: unknown): ProjectDomainError {
  const message = exactErrorField(value, "message");
  const code = exactErrorField(value, "code");
  const stable = (message !== null && SAFE_ERROR_CODES.has(message) ? message : code) ?? null;
  return stable !== null && SAFE_ERROR_CODES.has(stable)
    ? new ProjectDomainError(stable as (typeof PROJECT_ERROR_CODES)[number])
    : persistenceFailure();
}

function parseRpcResult(value: unknown): ProjectStateRpcResult {
  const parsed = rpcEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw persistenceFailure();
  return parsed.data;
}

function parseCommitResult(value: unknown, expectedProjectId?: string): ProjectCommitResultV1 {
  const parsed = projectCommandResultSchema.safeParse(value);
  if (
    !parsed.success ||
    (expectedProjectId !== undefined &&
      canonicalUuidKeyV1(parsed.data?.project_id) !== canonicalUuidKeyV1(expectedProjectId))
  ) {
    throw persistenceFailure();
  }
  return {
    projectId: parsed.data.project_id,
    eventId: parsed.data.event_id,
    stateVersion: parsed.data.state_version,
    replayed: parsed.data.replayed,
  };
}

function sortKey(value: string): string {
  return canonicalContextSortKeyV1(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function timestamp(value: string | null): number {
  if (value === null) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareRequirements(left: ProjectRequirementV1, right: ProjectRequirementV1): number {
  return (
    compareStrings(sortKey(left.category), sortKey(right.category)) ||
    timestamp(left.confirmedAt) - timestamp(right.confirmedAt) ||
    compareStrings(sortKey(left.id), sortKey(right.id))
  );
}

function compareDecisions(left: ProjectDecisionV1, right: ProjectDecisionV1): number {
  return (
    compareStrings(sortKey(left.decisionKey), sortKey(right.decisionKey)) ||
    timestamp(left.confirmedAt) - timestamp(right.confirmedAt) ||
    compareStrings(sortKey(left.id), sortKey(right.id))
  );
}

function compareMilestones(left: ProjectMilestoneV1, right: ProjectMilestoneV1): number {
  return left.position - right.position || compareStrings(sortKey(left.id), sortKey(right.id));
}

function compareSummaries(left: ProjectSummaryV1, right: ProjectSummaryV1): number {
  return (
    compareStrings(
      canonicalSummaryKindKeyV1(left.summaryKind),
      canonicalSummaryKindKeyV1(right.summaryKind),
    ) ||
    right.version - left.version ||
    compareStrings(sortKey(left.id), sortKey(right.id))
  );
}

function mapProjection(row: z.infer<typeof projectionRowSchema>): ProjectProjectionV1 {
  if (row.stage === "archived" && row.archived_at === null) throw persistenceFailure();
  if (row.stage !== "archived" && row.archived_at !== null) throw persistenceFailure();
  if (row.stage === "blocked" && row.blocked_from_stage === null) throw persistenceFailure();
  if (
    row.stage !== "blocked" &&
    !(row.stage === "archived" && row.archived_from_stage === "blocked") &&
    row.blocked_from_stage !== null
  ) {
    throw persistenceFailure();
  }
  if (row.stage === "archived" && row.archived_from_stage === null) throw persistenceFailure();
  if (row.stage !== "archived" && row.archived_from_stage !== null) throw persistenceFailure();
  if (row.stage === "archived" && row.archived_from_stage === "blocked") {
    if (row.blocked_from_stage === null || row.blocker_summary === null) throw persistenceFailure();
  }
  if (row.stage === "blocked" && row.blocker_summary === null) throw persistenceFailure();
  if (row.stage !== "blocked" && row.stage !== "archived" && row.blocker_summary !== null) {
    throw persistenceFailure();
  }
  return {
    id: row.id,
    mode: row.mode,
    stage: row.stage,
    stateVersion: row.state_version,
    selectedTool: row.selected_tool,
    activeMilestoneId: row.active_milestone_id,
    blockerSummary: row.blocker_summary,
    blockedFromStage: row.blocked_from_stage,
    archivedFromStage: row.archived_from_stage,
    archivedAt: row.archived_at,
  };
}

function mapRequirement(
  row: z.infer<typeof requirementRowSchema>,
  projectId: string,
): ProjectRequirementV1 {
  if (canonicalUuidKeyV1(row.project_id) !== canonicalUuidKeyV1(projectId)) {
    throw persistenceFailure();
  }
  if ((row.status === "confirmed") !== (row.confirmed_at !== null)) throw persistenceFailure();
  return {
    id: row.id,
    projectId: row.project_id,
    category: row.category,
    statement: row.statement,
    rationale: row.rationale,
    status: row.status,
    sourceEventId: row.source_event_id,
    supersedesRequirementId: row.supersedes_requirement_id,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDecision(row: z.infer<typeof decisionRowSchema>, projectId: string): ProjectDecisionV1 {
  if (canonicalUuidKeyV1(row.project_id) !== canonicalUuidKeyV1(projectId)) {
    throw persistenceFailure();
  }
  if ((row.status === "confirmed") !== (row.confirmed_at !== null)) throw persistenceFailure();
  return {
    id: row.id,
    projectId: row.project_id,
    decisionKey: row.decision_key,
    decision: row.decision,
    rationale: row.rationale,
    status: row.status,
    sourceEventId: row.source_event_id,
    supersedesDecisionId: row.supersedes_decision_id,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMilestone(
  row: z.infer<typeof milestoneRowSchema>,
  projectId: string,
): ProjectMilestoneV1 {
  if (canonicalUuidKeyV1(row.project_id) !== canonicalUuidKeyV1(projectId)) {
    throw persistenceFailure();
  }
  return {
    id: row.id,
    projectId: row.project_id,
    position: row.position,
    title: row.title,
    description: row.description,
    suggestedStatus: row.suggested_status,
    confirmedStatus: row.confirmed_status,
    confirmationEventId: row.confirmation_event_id,
    blockedReason: row.blocked_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSummary(row: z.infer<typeof summaryRowSchema>, projectId: string): ProjectSummaryV1 {
  if (canonicalUuidKeyV1(row.project_id) !== canonicalUuidKeyV1(projectId)) {
    throw persistenceFailure();
  }
  return {
    id: row.id,
    projectId: row.project_id,
    summaryKind: row.summary_kind,
    version: row.version,
    basedOnEventSequence: row.based_on_event_sequence,
    summaryText: row.summary_text,
    structuredFacts: row.structured_facts,
    status: row.status,
    createdAt: row.created_at,
  };
}

function parsePreferences(row: z.infer<typeof preferenceRowSchema>): Preferences {
  const parsed = preferencesSchema.safeParse({
    skillLevel: row.skill_level,
    preferredStackBehavior: row.preferred_stack_behavior,
    preferredStack: row.preferred_stack,
    codingStyle: row.coding_style,
    deploymentPreference: row.deployment_preference,
  });
  if (!parsed.success) throw persistenceFailure();
  return parsed.data;
}

function parseOverride(row: z.infer<typeof overrideRowSchema>): ProjectPreferenceOverride {
  const preferredStack =
    row.preferred_stack === null
      ? null
      : (Object.fromEntries(
          Object.entries(row.preferred_stack).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ) as ProjectPreferenceOverride["preferredStack"]);
  const codingStyle =
    row.coding_style === null
      ? null
      : (Object.fromEntries(
          Object.entries(row.coding_style).filter((entry) => typeof entry[1] === "string"),
        ) as ProjectPreferenceOverride["codingStyle"]);
  return {
    skillLevel: row.skill_level,
    preferredStackBehavior: row.preferred_stack_behavior,
    preferredStack,
    codingStyle,
    deploymentPreference: row.deployment_preference,
  };
}

function compareProjectId(projectId: string): void {
  if (!projectIdSchema.safeParse(projectId).success)
    throw new ProjectDomainError("validation_failed");
}

function assertUniqueIds<T extends { readonly id: string }>(rows: readonly T[]): void {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = canonicalUuidKeyV1(row.id);
    if (ids.has(id)) throw persistenceFailure();
    ids.add(id);
  }
}

function assertUniqueCurrentSummaryKinds(rows: readonly ProjectSummaryV1[]): void {
  const kinds = new Set<string>();
  for (const row of rows) {
    if (row.status !== "current") continue;
    const kind = canonicalSummaryKindKeyV1(row.summaryKind);
    if (kinds.has(kind)) throw persistenceFailure();
    kinds.add(kind);
  }
}

function assertRequirementLineage(rows: readonly ProjectRequirementV1[]): void {
  const byId = new Map(rows.map((row) => [canonicalUuidKeyV1(row.id), row]));
  const predecessors = new Set<string>();
  for (const row of rows) {
    const predecessorId = row.supersedesRequirementId;
    if (predecessorId === null) continue;
    const predecessorKey = canonicalUuidKeyV1(predecessorId);
    if (predecessors.has(predecessorKey) || !byId.has(predecessorKey)) throw persistenceFailure();
    predecessors.add(predecessorKey);

    const seen = new Set<string>([canonicalUuidKeyV1(row.id)]);
    let current = byId.get(predecessorKey);
    if (current === undefined) throw persistenceFailure();
    while (current.supersedesRequirementId !== null) {
      const nextKey = canonicalUuidKeyV1(current.supersedesRequirementId);
      if (seen.has(nextKey)) throw persistenceFailure();
      seen.add(nextKey);
      current = byId.get(nextKey);
      if (current === undefined) throw persistenceFailure();
    }
  }
}

function assertDecisionLineage(rows: readonly ProjectDecisionV1[]): void {
  const byId = new Map(rows.map((row) => [canonicalUuidKeyV1(row.id), row]));
  const predecessors = new Set<string>();
  const activeKeys = new Set<string>();
  for (const row of rows) {
    const predecessorId = row.supersedesDecisionId;
    if (predecessorId !== null) {
      const predecessorKey = canonicalUuidKeyV1(predecessorId);
      if (predecessors.has(predecessorKey) || !byId.has(predecessorKey)) throw persistenceFailure();
      predecessors.add(predecessorKey);
      const seen = new Set<string>([canonicalUuidKeyV1(row.id)]);
      let current = byId.get(predecessorKey);
      if (current === undefined) throw persistenceFailure();
      while (current.supersedesDecisionId !== null) {
        const nextKey = canonicalUuidKeyV1(current.supersedesDecisionId);
        if (seen.has(nextKey)) throw persistenceFailure();
        seen.add(nextKey);
        current = byId.get(nextKey);
        if (current === undefined) throw persistenceFailure();
      }
    }
    if (row.status === "confirmed") {
      const key = canonicalContextSortKeyV1(row.decisionKey).trim();
      if (activeKeys.has(key)) throw persistenceFailure();
      activeKeys.add(key);
    }
  }
}

function assertMilestonePositions(rows: readonly ProjectMilestoneV1[]): void {
  const positions = new Set<number>();
  for (const row of rows) {
    if (positions.has(row.position)) throw persistenceFailure();
    positions.add(row.position);
  }
}

async function commandFingerprint(value: ProjectCommandEnvelopeV1): Promise<string> {
  const canonical = canonicalizeProjectCommandV1(value);
  if (globalThis.crypto?.subtle === undefined) throw persistenceFailure();
  let digest: ArrayBuffer;
  try {
    digest = await globalThis.crypto.subtle.digest("SHA-256", canonical as unknown as BufferSource);
  } catch {
    throw persistenceFailure();
  }
  const bytes = new Uint8Array(digest);
  if (bytes.byteLength !== 32) throw persistenceFailure();
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Owner-scoped Supabase adapter for the Phase 6 project-state RPC/read boundary. */
export function createSupabaseProjectStateRepository(
  client: ProjectStateSupabaseClient | SupabaseClient<Database>,
): ProjectStateRepository {
  const boundary = client as unknown as ProjectStateSupabaseClient;

  return {
    async getSnapshot(projectId): Promise<ProjectStateSnapshotV1> {
      compareProjectId(projectId);

      let response: unknown;
      try {
        response = await boundary.rpc("get_project_state_snapshot_v1", {
          p_project_id: projectId,
        });
      } catch {
        throw persistenceFailure();
      }
      const result = parseRpcResult(response);
      if (result.error !== null) throw mapRpcError(result.error);
      const parsed = projectStateSnapshotRpcSchema.safeParse(result.data);
      if (!parsed.success) throw persistenceFailure();

      const {
        projection: projectionRow,
        requirements: requirementRows,
        decisions: decisionRows,
        milestones: milestoneRows,
        summaries: summaryRows,
        preferences: preferenceRow,
        project_preference_override: overrideRow,
      } = parsed.data;
      if (canonicalUuidKeyV1(projectionRow.id) !== canonicalUuidKeyV1(projectId)) {
        throw persistenceFailure();
      }

      const requirements = requirementRows
        .map((row) => mapRequirement(row, projectId))
        .sort(compareRequirements);
      const decisions = decisionRows
        .map((row) => mapDecision(row, projectId))
        .sort(compareDecisions);
      const milestones = milestoneRows
        .map((row) => mapMilestone(row, projectId))
        .sort(compareMilestones);
      const summaries = summaryRows.map((row) => mapSummary(row, projectId)).sort(compareSummaries);
      const projection = mapProjection(projectionRow);
      assertUniqueIds(requirements);
      assertUniqueIds(decisions);
      assertUniqueIds(milestones);
      assertUniqueIds(summaries);
      assertUniqueCurrentSummaryKinds(summaries);
      assertMilestonePositions(milestones);
      assertRequirementLineage(requirements);
      assertDecisionLineage(decisions);
      if (
        projection.activeMilestoneId !== null &&
        !milestones.some(
          (milestone) =>
            canonicalUuidKeyV1(milestone.id) === canonicalUuidKeyV1(projection.activeMilestoneId!),
        )
      ) {
        throw persistenceFailure();
      }

      let effectivePreferences: EffectivePreferences | null = null;
      if (preferenceRow !== null) {
        const globalPreferences = parsePreferences(preferenceRow);
        const override = overrideRow === null ? null : parseOverride(overrideRow);
        effectivePreferences = resolveEffectivePreferences(globalPreferences, override);
      }

      const snapshot = {
        projection,
        requirements,
        decisions,
        milestones,
        summaries,
        recentEvidence: [],
      };
      return effectivePreferences === null ? snapshot : { ...snapshot, effectivePreferences };
    },

    async execute(command): Promise<ProjectCommitResultV1> {
      const parsed = parseProjectCommandV1(command);
      const fingerprint = await commandFingerprint(parsed);
      let response: unknown;
      try {
        response = await boundary.rpc("execute_project_command_v1", {
          p_project_id: parsed.projectId,
          p_expected_state_version: parsed.expectedStateVersion,
          p_idempotency_key: parsed.idempotencyKey,
          p_request_fingerprint: fingerprint,
          p_command: parsed.command,
        });
      } catch {
        throw persistenceFailure();
      }
      const result = parseRpcResult(response);
      if (result.error !== null) throw mapRpcError(result.error);
      return parseCommitResult(result.data, parsed.projectId);
    },

    async applyValidatedDelta(input: ApplyValidatedDeltaV1): Promise<ProjectCommitResultV1> {
      const parsed = applyInputSchema.safeParse(input);
      if (!parsed.success) throw new ProjectDomainError("validation_failed");
      let response: unknown;
      try {
        response = await boundary.rpc("apply_validated_project_delta_v1", {
          p_project_id: parsed.data.projectId,
          p_generation_run_id: parsed.data.generationRunId,
          p_expected_state_version: parsed.data.expectedStateVersion,
        });
      } catch {
        throw persistenceFailure();
      }
      const result = parseRpcResult(response);
      if (result.error !== null) throw mapRpcError(result.error);
      return parseCommitResult(result.data, parsed.data.projectId);
    },
  };
}
