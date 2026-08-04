import { z } from "zod";

import {
  PROJECT_COMMAND_SCHEMA,
  PROJECT_MODES,
  PROJECT_SCHEMA_VERSION,
  PROJECT_STAGES,
  ProjectDomainError,
  type ProjectCommandEnvelopeV1,
  type ProjectCommandV1,
  type ProjectJsonValue,
} from "./contracts";

const MAX_IDEMPOTENCY_KEY_BYTES = 255;
const MAX_BLOCKER_BYTES = 32_768;
const MAX_REQUIREMENT_CATEGORY_BYTES = 255;
const MAX_REQUIREMENT_STATEMENT_BYTES = 16_384;
const MAX_RATIONALE_BYTES = 32_768;
const MAX_DECISION_BYTES = 16_384;
const MAX_SUMMARY_KIND_BYTES = 255;
const MAX_SUMMARY_TEXT_BYTES = 65_536;
const MAX_STRUCTURED_FACTS_BYTES = 65_536;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Normalize a user decision key exactly once at the domain boundary. Unicode normalization is
 * applied before lower-casing; the resulting key is intentionally ASCII-only.
 */
export function normalizeDecisionKeyV1(value: string): string {
  const normalized = value.trim().normalize("NFC").toLowerCase();
  if (
    normalized.length === 0 ||
    byteLength(normalized) > MAX_IDEMPOTENCY_KEY_BYTES ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(normalized)
  ) {
    throw new ProjectDomainError("validation_failed");
  }
  return normalized;
}

export function tryNormalizeDecisionKeyV1(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return normalizeDecisionKeyV1(value);
  } catch {
    return null;
  }
}

export const decisionKeySchema = z.string().transform((value) => normalizeDecisionKeyV1(value));

function boundedText(maximum: number, { empty = false } = {}) {
  const schema = z
    .string()
    .trim()
    .refine((value) => byteLength(value) <= maximum, {
      message: `must be at most ${maximum} UTF-8 bytes`,
    });
  return empty ? schema : schema.min(1);
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
    if (key === "__proto__" || key === "constructor" || key === "prototype") return false;
    if (!isJsonValue((value as Record<string, unknown>)[key], seen, depth + 1)) return false;
  }
  seen.delete(value);
  return true;
}

const structuredFactsSchema = z.custom<ProjectJsonValue>(
  (value) => {
    if (
      !isJsonValue(value) ||
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return false;
    }
    try {
      return byteLength(JSON.stringify(value)) <= MAX_STRUCTURED_FACTS_BYTES;
    } catch {
      return false;
    }
  },
  { message: "must be a bounded JSON object" },
);

const uuidSchema = z.uuid();
const versionSchema = z.number().int().safe().min(1);
const rationaleSchema = boundedText(MAX_RATIONALE_BYTES).nullable().optional();

const transitionStageCommandSchema = z.strictObject({
  type: z.literal("transition_stage"),
  to: z.enum(PROJECT_STAGES),
});
const blockProjectCommandSchema = z.strictObject({
  type: z.literal("block_project"),
  blockerSummary: boundedText(MAX_BLOCKER_BYTES),
});
const unblockProjectCommandSchema = z.strictObject({
  type: z.literal("unblock_project"),
});
const archiveProjectCommandSchema = z.strictObject({
  type: z.literal("archive_project"),
});
const restoreProjectCommandSchema = z.strictObject({
  type: z.literal("restore_project"),
});
const changeModeCommandSchema = z.strictObject({
  type: z.literal("change_mode"),
  mode: z.enum(PROJECT_MODES),
});
const setActiveMilestoneCommandSchema = z.strictObject({
  type: z.literal("set_active_milestone"),
  milestoneId: uuidSchema.nullable(),
});
const confirmRequirementCommandSchema = z.strictObject({
  type: z.literal("confirm_requirement"),
  requirementId: uuidSchema,
  category: boundedText(MAX_REQUIREMENT_CATEGORY_BYTES),
});
const rejectRequirementCommandSchema = z.strictObject({
  type: z.literal("reject_requirement"),
  requirementId: uuidSchema,
});
const supersedeRequirementCommandSchema = z.strictObject({
  type: z.literal("supersede_requirement"),
  predecessorId: uuidSchema,
  category: boundedText(MAX_REQUIREMENT_CATEGORY_BYTES),
  statement: boundedText(MAX_REQUIREMENT_STATEMENT_BYTES),
  rationale: rationaleSchema,
});
const confirmDecisionCommandSchema = z.strictObject({
  type: z.literal("confirm_decision"),
  decisionId: uuidSchema,
  decisionKey: decisionKeySchema,
});
const rejectDecisionCommandSchema = z.strictObject({
  type: z.literal("reject_decision"),
  decisionId: uuidSchema,
});
const supersedeDecisionCommandSchema = z.strictObject({
  type: z.literal("supersede_decision"),
  predecessorId: uuidSchema,
  decisionKey: decisionKeySchema.optional(),
  decision: boundedText(MAX_DECISION_BYTES),
  rationale: rationaleSchema,
});
const confirmMilestoneStatusCommandSchema = z
  .strictObject({
    type: z.literal("confirm_milestone_status"),
    milestoneId: uuidSchema,
    status: z.enum(["pending", "in_progress", "completed", "needs_verification", "blocked"]),
    blockedReason: boundedText(MAX_BLOCKER_BYTES).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "blocked") {
      if (value.blockedReason === undefined || value.blockedReason === null) {
        context.addIssue({ code: "custom", path: ["blockedReason"], message: "required" });
      }
      return;
    }
    if (value.blockedReason !== undefined && value.blockedReason !== null) {
      context.addIssue({
        code: "custom",
        path: ["blockedReason"],
        message: "only valid for blocked",
      });
    }
  });
const replaceSummaryCommandSchema = z.strictObject({
  type: z.literal("replace_summary"),
  summaryKind: boundedText(MAX_SUMMARY_KIND_BYTES),
  summaryText: boundedText(MAX_SUMMARY_TEXT_BYTES),
  structuredFacts: structuredFactsSchema.optional(),
});

export const projectCommandSchema = z.discriminatedUnion("type", [
  transitionStageCommandSchema,
  blockProjectCommandSchema,
  unblockProjectCommandSchema,
  archiveProjectCommandSchema,
  restoreProjectCommandSchema,
  changeModeCommandSchema,
  setActiveMilestoneCommandSchema,
  confirmRequirementCommandSchema,
  rejectRequirementCommandSchema,
  supersedeRequirementCommandSchema,
  confirmDecisionCommandSchema,
  rejectDecisionCommandSchema,
  supersedeDecisionCommandSchema,
  confirmMilestoneStatusCommandSchema,
  replaceSummaryCommandSchema,
]) as unknown as z.ZodType<ProjectCommandV1>;

/** Reject prototype-shaped keys before Zod can treat them as object metadata. */
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

const projectCommandEnvelopeShape = z.strictObject({
  schema: z.literal(PROJECT_COMMAND_SCHEMA),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  projectId: uuidSchema,
  expectedStateVersion: versionSchema,
  idempotencyKey: boundedText(MAX_IDEMPOTENCY_KEY_BYTES),
  command: projectCommandSchema,
});

/** Runtime schema for the complete owner-scoped user command envelope. */
export const projectCommandEnvelopeSchema: z.ZodType<ProjectCommandEnvelopeV1> = z.preprocess(
  (value) => (containsPrototypeKey(value) ? undefined : value),
  projectCommandEnvelopeShape,
);

export function parseProjectCommandV1(value: unknown): ProjectCommandEnvelopeV1 {
  const parsed = projectCommandEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new ProjectDomainError("validation_failed");
  return parsed.data;
}

export function safeParseProjectCommandV1(
  value: unknown,
):
  | { readonly success: true; readonly data: ProjectCommandEnvelopeV1 }
  | { readonly success: false; readonly error: z.ZodError } {
  return projectCommandEnvelopeSchema.safeParse(value);
}

/**
 * Canonical JSON is deliberately implemented in the domain so every caller hashes the same
 * bytes. Object keys sort by JavaScript's UTF-16 code-unit ordering; array order is preserved.
 */
export function serializeCanonicalJsonV1(value: unknown): string {
  const ancestors = new Set<object>();

  const visit = (candidate: unknown): string => {
    if (candidate === null) return "null";
    if (typeof candidate === "string") return JSON.stringify(candidate);
    if (typeof candidate === "boolean") return candidate ? "true" : "false";
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw new ProjectDomainError("validation_failed");
      const rendered = JSON.stringify(candidate);
      if (rendered === undefined) throw new ProjectDomainError("validation_failed");
      return rendered;
    }
    if (typeof candidate !== "object") throw new ProjectDomainError("validation_failed");
    if (ancestors.has(candidate)) throw new ProjectDomainError("validation_failed");
    ancestors.add(candidate);

    let rendered: string;
    if (Array.isArray(candidate)) {
      rendered = `[${candidate.map((entry) => visit(entry)).join(",")}]`;
    } else {
      let prototype: object | null;
      try {
        prototype = Object.getPrototypeOf(candidate);
      } catch {
        throw new ProjectDomainError("validation_failed");
      }
      if (prototype !== Object.prototype && prototype !== null) {
        throw new ProjectDomainError("validation_failed");
      }
      const keys = Object.keys(candidate).sort();
      rendered = `{${keys
        .map((key) => {
          if (key === "__proto__" || key === "constructor" || key === "prototype") {
            throw new ProjectDomainError("validation_failed");
          }
          return `${JSON.stringify(key)}:${visit((candidate as Record<string, unknown>)[key])}`;
        })
        .join(",")}}`;
    }
    ancestors.delete(candidate);
    return rendered;
  };

  return visit(value);
}

export function canonicalJsonBytesV1(value: unknown): Uint8Array {
  return new TextEncoder().encode(serializeCanonicalJsonV1(value));
}

/** Canonical bytes for the already validated command envelope; no hashing/runtime dependency here. */
export function canonicalizeProjectCommandV1(value: ProjectCommandEnvelopeV1): Uint8Array {
  return canonicalJsonBytesV1(parseProjectCommandV1(value));
}

export function canonicalizeProjectCommandTextV1(value: ProjectCommandEnvelopeV1): string {
  return new TextDecoder().decode(canonicalizeProjectCommandV1(value));
}

export const commandSchemas = Object.freeze({
  transitionStage: transitionStageCommandSchema,
  blockProject: blockProjectCommandSchema,
  unblockProject: unblockProjectCommandSchema,
  archiveProject: archiveProjectCommandSchema,
  restoreProject: restoreProjectCommandSchema,
  changeMode: changeModeCommandSchema,
  setActiveMilestone: setActiveMilestoneCommandSchema,
  confirmRequirement: confirmRequirementCommandSchema,
  rejectRequirement: rejectRequirementCommandSchema,
  supersedeRequirement: supersedeRequirementCommandSchema,
  confirmDecision: confirmDecisionCommandSchema,
  rejectDecision: rejectDecisionCommandSchema,
  supersedeDecision: supersedeDecisionCommandSchema,
  confirmMilestoneStatus: confirmMilestoneStatusCommandSchema,
  replaceSummary: replaceSummaryCommandSchema,
});
