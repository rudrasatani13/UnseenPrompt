import { z } from "zod";

import {
  ENTITY_STATUSES,
  MILESTONE_STATUSES,
  PROJECT_EVENT_TYPES,
  PROJECT_MODES,
  PROJECT_SCHEMA_VERSION,
  ProjectDomainError,
  type ProjectEventType,
  type ProjectUserActorV1,
} from "./contracts";

const uuidSchema = z.uuid();
const eventSchemaVersion = z.literal(PROJECT_SCHEMA_VERSION);
const projectEntityStatusSchema = z.enum(ENTITY_STATUSES);
const milestoneStatusSchema = z.enum(MILESTONE_STATUSES);
const projectModeSchema = z.enum(PROJECT_MODES);
const normalProjectStageSchema = z.enum([
  "discovery",
  "brief_confirmation",
  "ready_for_prompt",
  "prompt_active",
  "awaiting_return",
  "result_review",
  "iteration",
  "completed",
]);
const nonArchivedStageSchema = z.enum([
  "discovery",
  "brief_confirmation",
  "ready_for_prompt",
  "prompt_active",
  "awaiting_return",
  "result_review",
  "blocked",
  "iteration",
  "completed",
]);
const boundedEventKind = z.string().trim().min(1).max(255);

const stagePayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  from: normalProjectStageSchema,
  to: normalProjectStageSchema,
});
const modePayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  from: projectModeSchema,
  to: projectModeSchema,
});
const deltaPayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  generationRunId: uuidSchema,
  createdRequirementIds: z.array(uuidSchema).max(32),
  updatedRequirementIds: z.array(uuidSchema).max(32),
  createdDecisionIds: z.array(uuidSchema).max(32),
  updatedDecisionIds: z.array(uuidSchema).max(32),
  createdMilestoneIds: z.array(uuidSchema).max(32),
  updatedMilestoneIds: z.array(uuidSchema).max(32),
});
const entityPayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  entityId: uuidSchema,
  predecessorId: uuidSchema.optional(),
  beforeStatus: projectEntityStatusSchema,
  afterStatus: projectEntityStatusSchema,
});
const activatePayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  previousMilestoneId: uuidSchema.nullable(),
  milestoneId: uuidSchema,
});
const deactivatePayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  previousMilestoneId: uuidSchema,
  milestoneId: z.null(),
});
const milestoneStatusPayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  previousMilestoneId: uuidSchema.nullable(),
  milestoneId: uuidSchema,
  beforeStatus: milestoneStatusSchema.nullable(),
  afterStatus: milestoneStatusSchema,
});
const summaryPayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  summaryId: uuidSchema,
  summaryKind: boundedEventKind,
  version: z.number().int().safe().min(1),
});

const blockedPayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  from: normalProjectStageSchema.exclude(["completed"]),
  to: z.literal("blocked"),
});
const unblockedPayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  from: z.literal("blocked"),
  to: normalProjectStageSchema,
});
const completedPayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  from: z.enum(["result_review", "iteration"]),
  to: z.literal("completed"),
});
const archivedPayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  from: nonArchivedStageSchema,
  to: z.literal("archived"),
});
const restoredPayload = z.strictObject({
  schemaVersion: eventSchemaVersion,
  from: z.literal("archived"),
  to: nonArchivedStageSchema,
});

export const projectEventPayloadSchemas = Object.freeze({
  "project.mode_changed": modePayload,
  "project.stage_transitioned": stagePayload,
  "project.blocked": blockedPayload,
  "project.unblocked": unblockedPayload,
  "project.completed": completedPayload,
  "project.archived": archivedPayload,
  "project.restored": restoredPayload,
  "project.delta_proposed": deltaPayload,
  "requirement.confirmed": entityPayload,
  "requirement.rejected": entityPayload,
  "requirement.superseded": entityPayload,
  "decision.confirmed": entityPayload,
  "decision.rejected": entityPayload,
  "decision.superseded": entityPayload,
  "milestone.activated": activatePayload,
  "milestone.deactivated": deactivatePayload,
  "milestone.status_confirmed": milestoneStatusPayload,
  "project.summary_replaced": summaryPayload,
});

export type ProjectEventPayloadV1 =
  | z.infer<typeof modePayload>
  | z.infer<typeof stagePayload>
  | z.infer<typeof blockedPayload>
  | z.infer<typeof unblockedPayload>
  | z.infer<typeof completedPayload>
  | z.infer<typeof archivedPayload>
  | z.infer<typeof restoredPayload>
  | z.infer<typeof deltaPayload>
  | z.infer<typeof entityPayload>
  | z.infer<typeof activatePayload>
  | z.infer<typeof deactivatePayload>
  | z.infer<typeof milestoneStatusPayload>
  | z.infer<typeof summaryPayload>;

export interface ProjectEventV1 {
  readonly id: string;
  readonly projectId: string;
  readonly sequenceNumber: number;
  readonly eventType: ProjectEventType;
  readonly eventSchemaVersion: typeof PROJECT_SCHEMA_VERSION;
  readonly actorType: "user";
  readonly actorId: string;
  readonly idempotencyRecordId: string | null;
  readonly correlationId: string;
  readonly payload: ProjectEventPayloadV1;
  readonly createdAt: string;
}

/** Events returned from the RPC have a closed event type and a strict payload. */
const projectEventBase = {
  id: uuidSchema,
  projectId: uuidSchema,
  sequenceNumber: z.number().int().safe().min(1),
  eventSchemaVersion: eventSchemaVersion,
  actorType: z.literal("user"),
  actorId: uuidSchema,
  idempotencyRecordId: uuidSchema.nullable(),
  correlationId: uuidSchema,
  createdAt: z.string().datetime({ offset: true }),
} as const;

function eventVariant<T extends ProjectEventType>(
  eventType: T,
  payload: z.ZodTypeAny,
): z.ZodTypeAny {
  return z.strictObject({
    ...projectEventBase,
    eventType: z.literal(eventType),
    payload,
  });
}

const eventVariants = [
  eventVariant("project.mode_changed", modePayload),
  eventVariant("project.stage_transitioned", stagePayload),
  eventVariant("project.blocked", blockedPayload),
  eventVariant("project.unblocked", unblockedPayload),
  eventVariant("project.completed", completedPayload),
  eventVariant("project.archived", archivedPayload),
  eventVariant("project.restored", restoredPayload),
  eventVariant("project.delta_proposed", deltaPayload),
  eventVariant("requirement.confirmed", entityPayload),
  eventVariant("requirement.rejected", entityPayload),
  eventVariant("requirement.superseded", entityPayload),
  eventVariant("decision.confirmed", entityPayload),
  eventVariant("decision.rejected", entityPayload),
  eventVariant("decision.superseded", entityPayload),
  eventVariant("milestone.activated", activatePayload),
  eventVariant("milestone.deactivated", deactivatePayload),
  eventVariant("milestone.status_confirmed", milestoneStatusPayload),
  eventVariant("project.summary_replaced", summaryPayload),
] as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]];

export const projectEventSchema: z.ZodType<ProjectEventV1> = z.union(
  eventVariants,
) as z.ZodType<ProjectEventV1>;

export function parseProjectEventV1(value: unknown): ProjectEventV1 {
  const parsed = projectEventSchema.safeParse(value);
  if (!parsed.success) throw new ProjectDomainError("validation_failed");
  return parsed.data;
}

export const projectEventTypeList = Object.freeze([...PROJECT_EVENT_TYPES]);

/** Only authenticated user commands may produce Phase 6 state-changing events. */
export const projectUserActorSchema: z.ZodType<ProjectUserActorV1> = z.strictObject({
  actorType: z.literal("user"),
  actorId: uuidSchema,
});

export function parseProjectUserActorV1(value: unknown): ProjectUserActorV1 {
  const parsed = projectUserActorSchema.safeParse(value);
  if (!parsed.success) throw new ProjectDomainError("confirmation_required");
  return parsed.data;
}

export function isPhase6ProjectEventType(value: unknown): value is ProjectEventType {
  return typeof value === "string" && (PROJECT_EVENT_TYPES as readonly string[]).includes(value);
}
