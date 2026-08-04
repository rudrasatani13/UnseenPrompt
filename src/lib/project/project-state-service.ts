import "server-only";

import { z } from "zod";

import type {
  ModelCallKind,
  ModelErrorCode,
  ModelExecutionMetadata,
  ModelGatewayRequest,
  ModelOutputSchema,
  ReviewPolicy,
} from "@/domain/model/contracts";
import { MODEL_OUTPUT_SCHEMA_REGISTRY } from "@/domain/model/schemas";
import {
  type CompiledProjectContextV1,
  contextBudgetSchema,
  type ContextBudgetInputV1,
  type ProjectContextInputV1,
} from "@/domain/project/context";
import { compileProjectContextV1 } from "@/domain/project/context-compiler";
import {
  ProjectDomainError,
  type ProjectCommitResultV1,
  type ProjectCommandEnvelopeV1,
  type ProjectCommandV1,
  type ProjectStateSnapshotV1,
} from "@/domain/project/contracts";
import { MAX_GATEWAY_INPUT_BYTES, type ModelGateway } from "@/lib/model/gateway";
import { isModelGatewayError } from "@/lib/model/errors";

import type { ProjectStateRepository } from "./project-state-repository";

/** The largest system instruction accepted by this application boundary. */
export const MAX_PROJECT_DELTA_SYSTEM_INSTRUCTION_BYTES = MAX_GATEWAY_INPUT_BYTES;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function canonicalLengthDelimited(parts: readonly string[]): Uint8Array {
  return new TextEncoder().encode(parts.map((part) => `${byteLength(part)}:${part}`).join("|"));
}

async function logicalProjectDeltaFingerprint(
  projectId: string,
  systemInstruction: string,
  reviewPolicy: ReviewPolicy,
  compilerMetadata: CompiledProjectContextV1,
  schema: ModelOutputSchema<import("@/domain/model/contracts").ProjectDeltaV1, "project_delta">,
): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) throw persistenceFailure();
  let digest: ArrayBuffer;
  try {
    digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      canonicalLengthDelimited([
        projectId,
        "project_delta",
        schema.id,
        schema.versionedId,
        schema.schemaVersion,
        systemInstruction,
        reviewPolicy,
        String(compilerMetadata.limits.maxUtf8Bytes),
        String(compilerMetadata.limits.maxEstimatedTokens),
      ]) as unknown as BufferSource,
    );
  } catch {
    throw persistenceFailure();
  }
  const bytes = new Uint8Array(digest);
  if (bytes.byteLength !== 32) throw persistenceFailure();
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function boundedNonEmptyText(maximumBytes: number) {
  return z
    .string()
    .refine((value) => value.trim().length > 0)
    .refine((value) => byteLength(value) <= maximumBytes);
}

const projectDeltaInputSchema = z.strictObject({
  projectId: z.uuid(),
  idempotencyKey: boundedNonEmptyText(255).refine((value) => value === value.trim()),
  systemInstruction: boundedNonEmptyText(MAX_PROJECT_DELTA_SYSTEM_INSTRUCTION_BYTES),
  reviewPolicy: z.enum(["none", "best_effort", "required"]),
  contextBudget: contextBudgetSchema.optional(),
  signal: z
    .custom<AbortSignal>(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        typeof (value as { readonly aborted?: unknown }).aborted === "boolean",
    )
    .optional(),
  deadlineMs: z.number().int().safe().positive().optional(),
});

const metadataTextSchema = z
  .string()
  .refine((value) => value.length > 0)
  .refine((value) => byteLength(value) <= 160)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const providerSchema = metadataTextSchema;
const safeNonNegativeIntegerSchema = z.number().int().safe().nonnegative();
const safePositiveIntegerSchema = safeNonNegativeIntegerSchema.positive();
const nullableSafeNonNegativeIntegerSchema = safeNonNegativeIntegerSchema.nullable();
const usageSchema = z.strictObject({
  inputTokens: nullableSafeNonNegativeIntegerSchema,
  outputTokens: nullableSafeNonNegativeIntegerSchema,
  totalTokens: nullableSafeNonNegativeIntegerSchema,
});
const modelErrorCodes = [
  "aborted",
  "deadline_exceeded",
  "attempt_timeout",
  "authentication_failed",
  "permission_denied",
  "billing_or_quota_exhausted",
  "rate_limited",
  "provider_unavailable",
  "invalid_provider_request",
  "model_not_found",
  "content_refused",
  "output_truncated",
  "invalid_output",
  "configuration_error",
  "idempotency_conflict",
  "idempotency_in_progress",
  "idempotency_replay_unavailable",
  "persistence_failed",
  "provider_error",
] as const satisfies readonly ModelErrorCode[];
const modelCallKindSchema = z.enum([
  "primary",
  "transport_retry",
  "repair",
  "fallback",
  "reviewer",
] as const satisfies readonly ModelCallKind[]);
const modelCallMetadataSchema = z.strictObject({
  provider: providerSchema,
  model: metadataTextSchema,
  resolvedModel: metadataTextSchema.nullable(),
  kind: modelCallKindSchema,
  latencyMs: safeNonNegativeIntegerSchema,
  usage: usageSchema,
  estimatedCostMicros: nullableSafeNonNegativeIntegerSchema,
  outcome: z.union([z.literal("success"), z.enum(modelErrorCodes)]),
  validationResult: z.enum(["not_attempted", "passed", "repaired", "reviewed", "failed"]),
  requestId: metadataTextSchema.nullable(),
});
const modelExecutionMetadataSchema = z.strictObject({
  generationRunId: z.uuid(),
  projectStateVersion: safePositiveIntegerSchema,
  correlationId: z.uuid(),
  provider: providerSchema,
  model: metadataTextSchema,
  resolvedModel: metadataTextSchema.nullable(),
  latencyMs: safeNonNegativeIntegerSchema,
  usage: usageSchema,
  estimatedCostMicros: nullableSafeNonNegativeIntegerSchema,
  retryCount: safeNonNegativeIntegerSchema,
  validationResult: z.enum(["passed", "repaired", "reviewed"]),
  calls: z.array(modelCallMetadataSchema).max(32),
  errorCode: z.null(),
  replayed: z.boolean(),
});
const projectCommitResultSchema = z.strictObject({
  projectId: z.uuid(),
  eventId: z.uuid(),
  stateVersion: z.number().int().safe().positive(),
  replayed: z.boolean(),
});

export interface ProposeAndApplyProjectDeltaInputV1 {
  readonly projectId: string;
  readonly idempotencyKey: string;
  readonly systemInstruction: string;
  readonly reviewPolicy: ReviewPolicy;
  readonly contextBudget?: ContextBudgetInputV1;
  readonly signal?: AbortSignal;
  readonly deadlineMs?: number;
}

export interface ProjectDeltaApplicationResultV1 {
  readonly proposal: import("@/domain/model/contracts").ProjectDeltaV1;
  readonly compilerMetadata: CompiledProjectContextV1 | null;
  readonly modelMetadata: ModelExecutionMetadata;
  readonly applyReceipt: ProjectCommitResultV1;
}

export interface ProjectStateService {
  proposeAndApplyProjectDelta(
    input: ProposeAndApplyProjectDeltaInputV1,
  ): Promise<ProjectDeltaApplicationResultV1>;
  executeCommand(
    envelope: ProjectCommandEnvelopeV1<ProjectCommandV1>,
  ): Promise<ProjectCommitResultV1>;
}

export interface ProjectStateServiceDependencies {
  readonly gateway: ModelGateway;
  readonly repository: ProjectStateRepository;
}

interface UnknownRecord {
  readonly [key: string]: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationFailure(): ProjectDomainError {
  return new ProjectDomainError("validation_failed");
}

function persistenceFailure(): ProjectDomainError {
  return new ProjectDomainError("persistence_failed");
}

function rethrowSafeDependencyError(error: unknown): never {
  if (error instanceof ProjectDomainError || isModelGatewayError(error)) throw error;
  throw persistenceFailure();
}

function parseInput(value: ProposeAndApplyProjectDeltaInputV1): ProposeAndApplyProjectDeltaInputV1 {
  const parsed = projectDeltaInputSchema.safeParse(value);
  if (!parsed.success) throw validationFailure();
  return {
    projectId: parsed.data.projectId,
    idempotencyKey: parsed.data.idempotencyKey,
    systemInstruction: parsed.data.systemInstruction,
    reviewPolicy: parsed.data.reviewPolicy,
    ...(parsed.data.contextBudget === undefined
      ? {}
      : { contextBudget: parsed.data.contextBudget }),
    ...(parsed.data.signal === undefined ? {} : { signal: parsed.data.signal }),
    ...(parsed.data.deadlineMs === undefined ? {} : { deadlineMs: parsed.data.deadlineMs }),
  };
}

function projectContextInputFromSnapshot(
  projectId: string,
  snapshot: ProjectStateSnapshotV1,
): ProjectContextInputV1 {
  if (!isRecord(snapshot) || !isRecord(snapshot.projection)) throw persistenceFailure();

  const projection = snapshot.projection;
  if (projection.id !== projectId || !Array.isArray(snapshot.requirements)) {
    throw persistenceFailure();
  }
  if (!Array.isArray(snapshot.decisions) || !Array.isArray(snapshot.milestones)) {
    throw persistenceFailure();
  }
  if (!Array.isArray(snapshot.summaries)) throw persistenceFailure();

  const activeMilestoneId = projection.activeMilestoneId;
  let activeMilestone = null;
  if (activeMilestoneId !== null) {
    activeMilestone =
      snapshot.milestones.find(
        (milestone) => isRecord(milestone) && milestone.id === activeMilestoneId,
      ) ?? null;
    if (activeMilestone === null) throw persistenceFailure();
  }

  return {
    projectId,
    mode: projection.mode,
    stage: projection.stage,
    stateVersion: projection.stateVersion,
    selectedTool: projection.selectedTool,
    blockerSummary: projection.blockerSummary,
    requirements: snapshot.requirements,
    decisions: snapshot.decisions,
    activeMilestone,
    effectivePreferences: snapshot.effectivePreferences ?? null,
    summaries: snapshot.summaries,
    recentEvidence: snapshot.recentEvidence ?? [],
  };
}

interface ValidatedGatewayResponse {
  readonly proposal: import("@/domain/model/contracts").ProjectDeltaV1;
  readonly metadata: ModelExecutionMetadata;
}

function validateGatewayResponse(value: unknown): ValidatedGatewayResponse {
  if (!isRecord(value) || !isRecord(value.metadata)) throw persistenceFailure();

  const metadata = modelExecutionMetadataSchema.safeParse(value.metadata);
  if (!metadata.success) throw persistenceFailure();
  const parsed = MODEL_OUTPUT_SCHEMA_REGISTRY.project_delta.schema.safeParse(value.data);
  if (!parsed.success) throw persistenceFailure();

  return {
    proposal: parsed.data,
    metadata: metadata.data as ModelExecutionMetadata,
  };
}

function validateApplyReceipt(
  value: unknown,
  projectId: string,
  expectedStateVersion: number,
): ProjectCommitResultV1 {
  const parsed = projectCommitResultSchema.safeParse(value);
  if (!parsed.success) throw persistenceFailure();
  const nextStateVersion = expectedStateVersion + 1;
  if (
    parsed.data.projectId !== projectId ||
    !Number.isSafeInteger(nextStateVersion) ||
    parsed.data.stateVersion !== nextStateVersion
  ) {
    throw persistenceFailure();
  }
  return parsed.data;
}

/** Construct the server-only project proposal/application boundary. */
export function createProjectStateService(
  dependencies: ProjectStateServiceDependencies,
): ProjectStateService {
  const projectDeltaSchema: ModelOutputSchema<
    import("@/domain/model/contracts").ProjectDeltaV1,
    "project_delta"
  > = MODEL_OUTPUT_SCHEMA_REGISTRY.project_delta;

  return {
    async proposeAndApplyProjectDelta(
      rawInput: ProposeAndApplyProjectDeltaInputV1,
    ): Promise<ProjectDeltaApplicationResultV1> {
      const input = parseInput(rawInput);
      let snapshot: ProjectStateSnapshotV1;
      try {
        snapshot = await dependencies.repository.getSnapshot(input.projectId);
      } catch (error: unknown) {
        rethrowSafeDependencyError(error);
      }
      const contextInput = projectContextInputFromSnapshot(input.projectId, snapshot);
      const compilerMetadata = compileProjectContextV1(contextInput, input.contextBudget);
      const logicalIdempotencyFingerprint = await logicalProjectDeltaFingerprint(
        input.projectId,
        input.systemInstruction,
        input.reviewPolicy,
        compilerMetadata,
        projectDeltaSchema,
      );

      const request: ModelGatewayRequest<
        import("@/domain/model/contracts").ProjectDeltaV1,
        "project_delta"
      > = {
        projectId: input.projectId,
        projectStateVersion: snapshot.projection.stateVersion,
        idempotencyKey: input.idempotencyKey,
        operation: "project_delta",
        schema: projectDeltaSchema,
        systemInstruction: input.systemInstruction,
        input: compilerMetadata.context,
        reviewPolicy: input.reviewPolicy,
        logicalIdempotencyFingerprint,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(input.deadlineMs === undefined ? {} : { deadlineMs: input.deadlineMs }),
      };

      let response: unknown;
      try {
        response = await dependencies.gateway.execute(request);
      } catch (error: unknown) {
        rethrowSafeDependencyError(error);
      }
      const validated = validateGatewayResponse(response);
      const sourceStateVersion = validated.metadata.projectStateVersion;
      if (!validated.metadata.replayed && sourceStateVersion !== snapshot.projection.stateVersion) {
        throw persistenceFailure();
      }
      let rawApplyReceipt: ProjectCommitResultV1;
      try {
        rawApplyReceipt = await dependencies.repository.applyValidatedDelta({
          projectId: input.projectId,
          generationRunId: validated.metadata.generationRunId,
          expectedStateVersion: sourceStateVersion,
        });
      } catch (error: unknown) {
        rethrowSafeDependencyError(error);
      }
      const applyReceipt = validateApplyReceipt(
        rawApplyReceipt,
        input.projectId,
        sourceStateVersion,
      );

      return {
        proposal: validated.proposal,
        compilerMetadata:
          validated.metadata.replayed && sourceStateVersion !== snapshot.projection.stateVersion
            ? null
            : compilerMetadata,
        modelMetadata: validated.metadata,
        applyReceipt,
      };
    },

    async executeCommand(
      envelope: ProjectCommandEnvelopeV1<ProjectCommandV1>,
    ): Promise<ProjectCommitResultV1> {
      try {
        const rawReceipt = await dependencies.repository.execute(envelope);
        return validateApplyReceipt(rawReceipt, envelope.projectId, envelope.expectedStateVersion);
      } catch (error: unknown) {
        rethrowSafeDependencyError(error);
      }
    },
  };
}
