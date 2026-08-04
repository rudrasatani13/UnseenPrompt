import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  COMPOSER_DRAFT_COMMAND_SCHEMA,
  COMPOSER_DRAFT_INPUT_SCHEMA,
  DISCOVERY_ERROR_CODES,
  DISCOVERY_SCHEMA_VERSION,
  DiscoveryDomainError,
  type ComposerDraftCommandV1,
  type ComposerDraftCreateInputV1,
  type DiscoveryCommandV1,
} from "@/domain/discovery/contracts";
import {
  canonicalizeComposerDraftCommandV1,
  canonicalizeDiscoveryCommandV1,
  discoverySnapshotSchema,
  MAX_INITIAL_REQUEST_UTF8_BYTES,
  parseComposerDraftCommandV1,
  parseComposerDraftCreateInputV1,
  parseDiscoveryCommandV1,
  serializeCanonicalJsonV1,
  utf8ByteLength,
} from "@/domain/discovery/schemas";
import {
  canonicalDiscoveryFingerprintKeyV1,
  canonicalDiscoveryUuidKeyV1,
} from "@/domain/discovery/context";
import { isWellFormedUnicodeStringV1 } from "@/domain/discovery/fingerprint";
import { questionFingerprintV1 } from "@/domain/discovery/policy";
import { intentDetectionSchema } from "@/domain/model/schemas";
import type { Database } from "@/lib/supabase/database.types";

import type {
  ApplyComposerIntentInputV1,
  ComposerDraftCommandReceiptV1,
  ComposerDraftCreateReceiptV1,
  DiscoveryAssessmentReceiptV1,
  DiscoveryCommandReceiptV1,
  DiscoveryCompletionReceiptV1,
  DiscoveryQuestionReceiptV1,
  DiscoveryRepository,
} from "./discovery-repository";

/**
 * `database.types.ts` predates the Phase 7 migration. Keep this local overload contract exact and
 * cast a generated client at the adapter boundary instead of widening the generated types.
 */
export interface DiscoveryRpcClient {
  rpc(
    functionName: "create_composer_draft_v1",
    args: CreateComposerDraftRpcArgs,
  ): PromiseLike<DiscoveryRpcResult>;
  rpc(
    functionName: "execute_composer_draft_command_v1",
    args: ExecuteComposerDraftCommandRpcArgs,
  ): PromiseLike<DiscoveryRpcResult>;
  rpc(
    functionName: "get_discovery_snapshot_v1",
    args: GetDiscoverySnapshotRpcArgs,
  ): PromiseLike<DiscoveryRpcResult>;
  rpc(
    functionName: "apply_discovery_assessment_v1",
    args: ApplyDiscoveryAssessmentRpcArgs,
  ): PromiseLike<DiscoveryRpcResult>;
  rpc(
    functionName: "apply_discovery_question_v1",
    args: ApplyDiscoveryQuestionRpcArgs,
  ): PromiseLike<DiscoveryRpcResult>;
  rpc(
    functionName: "execute_discovery_command_v1",
    args: ExecuteDiscoveryCommandRpcArgs,
  ): PromiseLike<DiscoveryRpcResult>;
  rpc(
    functionName: "complete_discovery_v1",
    args: CompleteDiscoveryRpcArgs,
  ): PromiseLike<DiscoveryRpcResult>;
}

export interface CreateComposerDraftRpcArgs {
  readonly p_idempotency_key: string;
  readonly p_request_fingerprint: string;
  readonly p_initial_request_text: string;
}

interface InternalComposerDraftCommandV1 {
  readonly type: "apply_intent";
  readonly generationRunId: string;
}

export interface ExecuteComposerDraftCommandRpcArgs {
  readonly p_draft_id: string;
  readonly p_expected_version: number;
  readonly p_idempotency_key: string;
  readonly p_request_fingerprint: string;
  readonly p_command: ComposerDraftCommandV1 | InternalComposerDraftCommandV1;
}

export interface GetDiscoverySnapshotRpcArgs {
  readonly p_project_id: string;
}

export interface ApplyDiscoveryAssessmentRpcArgs {
  readonly p_project_id: string;
  readonly p_generation_run_id: string;
  readonly p_expected_state_version: number;
  readonly p_idempotency_key: string;
  readonly p_request_fingerprint: string;
}

export interface ApplyDiscoveryQuestionRpcArgs {
  readonly p_project_id: string;
  readonly p_generation_run_id: string;
  readonly p_expected_state_version: number;
  readonly p_idempotency_key: string;
  readonly p_request_fingerprint: string;
}

export interface ExecuteDiscoveryCommandRpcArgs {
  readonly p_project_id: string;
  readonly p_expected_state_version: number;
  readonly p_idempotency_key: string;
  readonly p_request_fingerprint: string;
  readonly p_command: DiscoveryCommandV1;
}

export interface CompleteDiscoveryRpcArgs {
  readonly p_project_id: string;
  readonly p_generation_run_id: string;
  readonly p_expected_state_version: number;
  readonly p_idempotency_key: string;
  readonly p_request_fingerprint: string;
}

export interface DiscoveryRpcResult {
  readonly data: unknown;
  readonly error: unknown;
  /** Native PostgREST transport metadata returned by @supabase/supabase-js. */
  readonly count?: number | null;
  readonly status?: number;
  readonly statusText?: string;
  readonly success?: boolean;
}

const UUID = z.uuid();
const VERSION = z.number().int().safe().positive();
const ID_KEY = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => value.trim() === value);
/*
 * Supabase's PostgREST client returns data/error plus transport metadata (count, status,
 * statusText, and success). Keep this boundary explicit: accept only the known metadata fields
 * and strip them before the domain parsers inspect the RPC payload. Unknown response keys are not
 * part of the adapter contract and are deliberately discarded rather than trusted.
 */
const RPC_RESULT = z
  .object({
    data: z.unknown(),
    error: z.unknown(),
    count: z.number().int().nullable().optional(),
    status: z.number().int().optional(),
    statusText: z.string().optional(),
    success: z.boolean().optional(),
  })
  .strip()
  .transform(({ data, error }) => ({ data, error }));
const DRAFT_ERROR_CODES = z.enum([
  "provider_unavailable",
  "persistence_failed",
  "invalid_output",
  "provider_error",
  "aborted",
  "deadline_exceeded",
  "attempt_timeout",
  "authentication_failed",
  "permission_denied",
  "billing_or_quota_exhausted",
  "rate_limited",
  "invalid_provider_request",
  "model_not_found",
  "content_refused",
  "output_truncated",
  "configuration_error",
] as const);
const createReceiptSchema = z.union([
  z.strictObject({
    draftId: UUID,
    version: VERSION,
    status: z.literal("routing"),
    replayed: z.boolean(),
  }),
  z.strictObject({
    draftId: UUID,
    version: VERSION,
    status: z.literal("retry_required"),
    initialRequestText: z
      .string()
      .refine(isWellFormedUnicodeStringV1)
      .refine((value) => utf8ByteLength(value) <= MAX_INITIAL_REQUEST_UTF8_BYTES)
      .refine((value) => value.trim().length > 0),
    lastErrorCode: DRAFT_ERROR_CODES,
    replayed: z.boolean(),
  }),
  z.strictObject({
    draftId: UUID,
    version: VERSION,
    status: z.literal("awaiting_confirmation"),
    intent: intentDetectionSchema,
    replayed: z.boolean(),
  }),
]);

const draftCommandReceiptSchema = z.strictObject({
  draftId: UUID,
  version: VERSION,
  status: z.enum([
    "routing",
    "awaiting_confirmation",
    "retry_required",
    "promoted",
    "abandoned",
  ] as const),
  projectId: UUID.nullable(),
  replayed: z.boolean(),
});

const retryDraftCommandReceiptSchema = z.strictObject({
  draftId: UUID,
  version: VERSION,
  status: z.enum([
    "routing",
    "awaiting_confirmation",
    "retry_required",
    "promoted",
    "abandoned",
  ] as const),
  projectId: UUID.nullable(),
  initialRequestText: z
    .string()
    .refine(isWellFormedUnicodeStringV1)
    .refine((value) => utf8ByteLength(value) <= MAX_INITIAL_REQUEST_UTF8_BYTES)
    .refine((value) => value.trim().length > 0),
  replayed: z.boolean(),
});

const promotedDraftCommandReceiptSchema = z.union([
  z.strictObject({
    draftId: UUID,
    version: VERSION,
    status: z.literal("promoted"),
    projectId: UUID,
    sessionId: UUID,
    stateVersion: VERSION,
    eventId: UUID,
    replayed: z.literal(false),
  }),
  // The SQL replay path intentionally returns the compact original draft receipt before looking
  // at the current project/session state. The original promotion event is recoverable from the
  z.strictObject({
    draftId: UUID,
    version: VERSION,
    status: z.literal("promoted"),
    projectId: UUID,
    replayed: z.literal(true),
  }),
]);

const assessmentReceiptSchema = z.union([
  z.strictObject({
    assessmentId: UUID,
    status: z.enum(["active", "sufficient", "blocked"] as const),
    stateVersion: VERSION,
    policyPassed: z.boolean(),
    eventId: UUID,
    replayed: z.literal(false),
  }),
  z.strictObject({
    assessmentId: UUID,
    status: z.enum(["active", "sufficient", "blocked"] as const),
    stateVersion: VERSION,
    replayed: z.literal(true),
  }),
]);

const questionReceiptSchema = z.union([
  z.strictObject({
    questionId: UUID,
    stateVersion: VERSION,
    eventId: UUID,
    replayed: z.literal(false),
  }),
  z.strictObject({
    questionId: UUID,
    stateVersion: VERSION,
    replayed: z.literal(true),
  }),
]);

const discoveryCommandReceiptSchema = z.strictObject({
  projectId: UUID,
  stateVersion: VERSION,
  eventId: UUID.nullable(),
  answerId: UUID.optional(),
  replayed: z.boolean(),
});

const completionReceiptSchema = z.strictObject({
  projectId: UUID,
  stateVersion: VERSION,
  eventId: UUID,
  replayed: z.boolean(),
});

const internalIntentInputSchema = z.strictObject({
  draftId: UUID,
  expectedVersion: VERSION,
  idempotencyKey: ID_KEY,
  generationRunId: UUID,
});

const applyAssessmentInputSchema = z.strictObject({
  projectId: UUID,
  generationRunId: UUID,
  expectedStateVersion: VERSION,
  idempotencyKey: ID_KEY,
});

const applyQuestionInputSchema = z.strictObject({
  projectId: UUID,
  generationRunId: UUID,
  targetFactKey: z
    .string()
    .min(1)
    .max(160)
    .refine((value) => value.trim() === value),
  expectedStateVersion: VERSION,
  idempotencyKey: ID_KEY,
});

const completeInputSchema = z.strictObject({
  projectId: UUID,
  generationRunId: UUID,
  expectedStateVersion: VERSION,
  idempotencyKey: ID_KEY,
});

const SAFE_DISCOVERY_ERRORS = new Set<string>(DISCOVERY_ERROR_CODES);
const SAFE_SQL_ERROR_MAP = new Map<string, (typeof DISCOVERY_ERROR_CODES)[number]>([
  ["authentication_required", "auth_required"],
  ["project_not_found_or_not_owned", "project_not_found"],
  ["invalid_generation_subject", "validation_failed"],
  ["invalid_subject_version", "validation_failed"],
  ["invalid_idempotency_key", "validation_failed"],
  ["invalid_request_fingerprint", "validation_failed"],
  ["invalid_input_schema_version", "validation_failed"],
  ["invalid_operation_kind", "validation_failed"],
  ["invalid_output_schema_version", "validation_failed"],
  ["invalid_generation_output", "persistence_failed"],
  ["proposal_not_applied", "proposal_incomplete"],
  ["persistence_error", "persistence_failed"],
]);

function persistenceFailure(): DiscoveryDomainError {
  return new DiscoveryDomainError("persistence_failed");
}

function validationFailure(): DiscoveryDomainError {
  return new DiscoveryDomainError("validation_failed");
}

function safeErrorString(value: unknown, key: "message" | "code"): string | null {
  if (typeof value === "string") return key === "message" ? value : null;
  if (typeof value !== "object" || value === null || value instanceof Error) return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate[key] === "string" ? candidate[key] : null;
}

function mapRpcError(value: unknown): DiscoveryDomainError {
  const message = safeErrorString(value, "message");
  const code = safeErrorString(value, "code");
  for (const candidate of [message, code]) {
    if (candidate === null) continue;
    if (SAFE_DISCOVERY_ERRORS.has(candidate)) {
      return new DiscoveryDomainError(candidate as (typeof DISCOVERY_ERROR_CODES)[number]);
    }
    const mapped = SAFE_SQL_ERROR_MAP.get(candidate);
    if (mapped !== undefined) return new DiscoveryDomainError(mapped);
  }
  return persistenceFailure();
}

function parseRpcResult(value: unknown): DiscoveryRpcResult {
  const parsed = RPC_RESULT.safeParse(value);
  if (!parsed.success) throw persistenceFailure();
  return parsed.data;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) throw persistenceFailure();
  let digest: ArrayBuffer;
  try {
    digest = await subtle.digest("SHA-256", bytes as unknown as BufferSource);
  } catch {
    throw persistenceFailure();
  }
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function canonicalJsonFingerprint(value: unknown): Promise<string> {
  let serialized: string;
  try {
    serialized = serializeCanonicalJsonV1(value);
  } catch {
    throw validationFailure();
  }
  return sha256Hex(new TextEncoder().encode(serialized));
}

async function createFingerprint(input: ComposerDraftCreateInputV1): Promise<string> {
  return canonicalJsonFingerprint({
    schema: COMPOSER_DRAFT_INPUT_SCHEMA,
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    initialRequestText: input.initialRequestText,
    idempotencyKey: input.idempotencyKey,
  });
}

async function applyIntentFingerprint(input: ApplyComposerIntentInputV1): Promise<string> {
  return canonicalJsonFingerprint({
    schema: COMPOSER_DRAFT_COMMAND_SCHEMA,
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    command: { type: "apply_intent", generationRunId: input.generationRunId },
  });
}

async function persistenceFingerprint(
  operation: string,
  input: Record<string, unknown>,
): Promise<string> {
  return canonicalJsonFingerprint({ operation, ...input });
}

function canonicalUuid(value: string): string {
  return canonicalDiscoveryUuidKeyV1(value);
}

function assertSameId(left: string, right: string): void {
  if (canonicalUuid(left) !== canonicalUuid(right)) throw persistenceFailure();
}

function assertDistinctIds(values: readonly string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = canonicalUuid(value);
    if (seen.has(key)) throw persistenceFailure();
    seen.add(key);
  }
}

function assertSnapshotRelationships(snapshot: z.infer<typeof discoverySnapshotSchema>): void {
  const { projectId, session, confirmedQuestions, confirmedAnswers, assessments, activeQuestion } =
    snapshot;
  assertSameId(session.projectId, projectId);

  const allQuestionIds = confirmedQuestions.map((question) => question.id);
  if (confirmedQuestions.some((question) => question.status === "active")) {
    throw persistenceFailure();
  }
  if (activeQuestion !== null && activeQuestion.status !== "active") throw persistenceFailure();
  assertDistinctIds([
    projectId,
    session.id,
    session.sourceDraftId,
    ...allQuestionIds,
    ...confirmedAnswers.map((answer) => answer.id),
    ...assessments.map((assessment) => assessment.id),
  ]);

  for (const question of confirmedQuestions) {
    assertSameId(question.projectId, projectId);
    assertSameId(question.sessionId, session.id);
    if (question.status === "active") throw persistenceFailure();
    if (question.basisStateVersion > snapshot.stateVersion) throw persistenceFailure();
  }
  if (activeQuestion !== null) {
    assertSameId(activeQuestion.projectId, projectId);
    assertSameId(activeQuestion.sessionId, session.id);
    if (activeQuestion.position !== session.confirmedTurnCount) throw persistenceFailure();
    if (session.activeQuestionId === null) throw persistenceFailure();
    assertSameId(session.activeQuestionId, activeQuestion.id);
    if (allQuestionIds.some((id) => canonicalUuid(id) === canonicalUuid(activeQuestion.id))) {
      throw persistenceFailure();
    }
    if (activeQuestion.basisStateVersion > snapshot.stateVersion) throw persistenceFailure();
  } else if (session.activeQuestionId !== null) {
    throw persistenceFailure();
  }
  // Abandoning discovery intentionally preserves the active question so resume can show the
  // saved question without generating another one. Terminal/sufficient states still cannot carry
  // an active question (the explicit guard below keeps that invariant readable).
  if (activeQuestion !== null && session.status !== "active" && session.status !== "abandoned") {
    throw persistenceFailure();
  }
  if (
    (session.status === "sufficient" || session.status === "completed") &&
    activeQuestion !== null
  ) {
    throw persistenceFailure();
  }

  const assessmentById = new Map(
    assessments.map((assessment) => [canonicalUuid(assessment.id), assessment]),
  );
  assertDistinctIds(assessments.map((assessment) => assessment.generationRunId));
  for (const assessment of assessments) {
    assertSameId(assessment.projectId, projectId);
    assertSameId(assessment.sessionId, session.id);
    if (assessment.basisStateVersion > snapshot.stateVersion) throw persistenceFailure();
  }
  if (session.latestAssessmentId !== null) {
    const latest = assessmentById.get(canonicalUuid(session.latestAssessmentId));
    if (latest === undefined) throw persistenceFailure();
    assertSameId(latest.projectId, projectId);
    assertSameId(latest.sessionId, session.id);
  }

  const questionsById = new Map(
    [...confirmedQuestions, ...(activeQuestion === null ? [] : [activeQuestion])].map(
      (question) => [canonicalUuid(question.id), question],
    ),
  );
  const questionFingerprints = new Set<string>();
  const positions = new Set<number>();
  assertDistinctIds([...questionsById.values()].map((question) => question.generationRunId));
  for (const question of questionsById.values()) {
    const fingerprint = canonicalDiscoveryFingerprintKeyV1(question.questionFingerprint);
    if (questionFingerprints.has(fingerprint)) throw persistenceFailure();
    questionFingerprints.add(fingerprint);
    if (positions.has(question.position)) throw persistenceFailure();
    positions.add(question.position);
    if (questionFingerprintV1(question.questionText) !== fingerprint) throw persistenceFailure();
  }

  const answersById = new Map<string, (typeof confirmedAnswers)[number]>();
  for (const answer of confirmedAnswers) {
    const answerKey = canonicalUuid(answer.id);
    if (answersById.has(answerKey)) throw persistenceFailure();
    answersById.set(answerKey, answer);
  }
  const successorByPredecessor = new Set<string>();
  const currentAnswerByQuestion = new Map<string, string>();
  for (const answer of confirmedAnswers) {
    assertSameId(answer.projectId, projectId);
    assertSameId(answer.sessionId, session.id);
    const question = questionsById.get(canonicalUuid(answer.questionId));
    if (question === undefined || question.status === "active") throw persistenceFailure();
    if (answer.status === "confirmed") {
      if (question.status !== "answered") throw persistenceFailure();
      const questionKey = canonicalUuid(question.id);
      if (currentAnswerByQuestion.has(questionKey)) throw persistenceFailure();
      currentAnswerByQuestion.set(questionKey, canonicalUuid(answer.id));
    }
    if (
      (answer.source === "suggested" &&
        !question.suggestedAnswers.some((suggestion) => suggestion.value === answer.answerText)) ||
      (answer.source === "free_text" && !question.allowsFreeText)
    ) {
      throw persistenceFailure();
    }
    if (answer.supersedesAnswerId !== null) {
      const predecessorKey = canonicalUuid(answer.supersedesAnswerId);
      if (
        predecessorKey === canonicalUuid(answer.id) ||
        successorByPredecessor.has(predecessorKey)
      ) {
        throw persistenceFailure();
      }
      successorByPredecessor.add(predecessorKey);
      const predecessor = answersById.get(predecessorKey);
      if (predecessor === undefined) throw persistenceFailure();
      assertSameId(predecessor.projectId, projectId);
      assertSameId(predecessor.sessionId, session.id);
      assertSameId(predecessor.questionId, answer.questionId);
      if (predecessor.status !== "superseded") throw persistenceFailure();
    }
    if (answer.status === "confirmed" && answer.supersededAt !== null) throw persistenceFailure();
    if (answer.status === "superseded" && answer.supersededAt === null) throw persistenceFailure();
  }
  for (const answer of confirmedAnswers) {
    let predecessor = answer.supersedesAnswerId;
    const seen = new Set<string>([canonicalUuid(answer.id)]);
    while (predecessor !== null) {
      const key = canonicalUuid(predecessor);
      if (seen.has(key)) throw persistenceFailure();
      seen.add(key);
      const row = answersById.get(key);
      if (row === undefined) throw persistenceFailure();
      predecessor = row.supersedesAnswerId;
    }
  }
  for (const question of confirmedQuestions) {
    if (
      question.status === "answered" &&
      !currentAnswerByQuestion.has(canonicalUuid(question.id))
    ) {
      throw persistenceFailure();
    }
  }
}

function parseCreateReceipt(value: unknown): ComposerDraftCreateReceiptV1 {
  const parsed = createReceiptSchema.safeParse(value);
  if (!parsed.success) throw persistenceFailure();
  return parsed.data;
}

function parseDraftReceipt(
  value: unknown,
  commandType: "retry_intent" | "confirm_and_promote" | "abandon_draft" | "apply_intent",
): ComposerDraftCommandReceiptV1 {
  const schema =
    commandType === "retry_intent"
      ? retryDraftCommandReceiptSchema
      : commandType === "confirm_and_promote"
        ? promotedDraftCommandReceiptSchema
        : draftCommandReceiptSchema;
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw persistenceFailure();
  return parsed.data;
}

function parseAssessmentReceipt(value: unknown): DiscoveryAssessmentReceiptV1 {
  const parsed = assessmentReceiptSchema.safeParse(value);
  if (!parsed.success) throw persistenceFailure();
  return parsed.data;
}

function parseQuestionReceipt(value: unknown): DiscoveryQuestionReceiptV1 {
  const parsed = questionReceiptSchema.safeParse(value);
  if (!parsed.success) throw persistenceFailure();
  return parsed.data;
}

function parseDiscoveryCommandReceipt(value: unknown): DiscoveryCommandReceiptV1 {
  const parsed = discoveryCommandReceiptSchema.safeParse(value);
  if (!parsed.success) throw persistenceFailure();
  return parsed.data;
}

function parseCompletionReceipt(value: unknown): DiscoveryCompletionReceiptV1 {
  const parsed = completionReceiptSchema.safeParse(value);
  if (!parsed.success) throw persistenceFailure();
  return parsed.data;
}

async function callRpc(
  boundary: DiscoveryRpcClient,
  functionName:
    | "create_composer_draft_v1"
    | "execute_composer_draft_command_v1"
    | "get_discovery_snapshot_v1"
    | "apply_discovery_assessment_v1"
    | "apply_discovery_question_v1"
    | "execute_discovery_command_v1"
    | "complete_discovery_v1",
  args:
    | CreateComposerDraftRpcArgs
    | ExecuteComposerDraftCommandRpcArgs
    | GetDiscoverySnapshotRpcArgs
    | ApplyDiscoveryAssessmentRpcArgs
    | ApplyDiscoveryQuestionRpcArgs
    | ExecuteDiscoveryCommandRpcArgs
    | CompleteDiscoveryRpcArgs,
): Promise<unknown> {
  let response: unknown;
  try {
    response = await boundary.rpc(functionName as never, args as never);
  } catch {
    throw persistenceFailure();
  }
  const result = parseRpcResult(response);
  if (result.error !== null) throw mapRpcError(result.error);
  return result.data;
}

/** Owner-scoped, RPC-only Supabase discovery adapter. */
export function createSupabaseDiscoveryRepository(
  client: DiscoveryRpcClient | SupabaseClient<Database>,
): DiscoveryRepository {
  const boundary = client as unknown as DiscoveryRpcClient;

  return {
    async createComposerDraft(input) {
      const parsed = parseComposerDraftCreateInputV1(input);
      const requestFingerprint = await createFingerprint(parsed);
      const data = await callRpc(boundary, "create_composer_draft_v1", {
        p_idempotency_key: parsed.idempotencyKey,
        p_request_fingerprint: requestFingerprint,
        p_initial_request_text: parsed.initialRequestText,
      });
      return parseCreateReceipt(data);
    },

    async executeComposerDraftCommand(envelope) {
      const parsed = parseComposerDraftCommandV1(envelope);
      const requestFingerprint = await sha256Hex(canonicalizeComposerDraftCommandV1(parsed));
      const data = await callRpc(boundary, "execute_composer_draft_command_v1", {
        p_draft_id: parsed.draftId,
        p_expected_version: parsed.expectedVersion,
        p_idempotency_key: parsed.idempotencyKey,
        p_request_fingerprint: requestFingerprint,
        p_command: parsed.command,
      });
      return parseDraftReceipt(data, parsed.command.type);
    },

    async applyIntent(input) {
      const parsed = internalIntentInputSchema.safeParse(input);
      if (!parsed.success) throw validationFailure();
      const requestFingerprint = await applyIntentFingerprint(parsed.data);
      const data = await callRpc(boundary, "execute_composer_draft_command_v1", {
        p_draft_id: parsed.data.draftId,
        p_expected_version: parsed.data.expectedVersion,
        p_idempotency_key: parsed.data.idempotencyKey,
        p_request_fingerprint: requestFingerprint,
        p_command: { type: "apply_intent", generationRunId: parsed.data.generationRunId },
      });
      return parseDraftReceipt(data, "apply_intent");
    },

    async getSnapshot(projectId) {
      if (!UUID.safeParse(projectId).success) throw validationFailure();
      const data = await callRpc(boundary, "get_discovery_snapshot_v1", {
        p_project_id: projectId,
      });
      const parsedSnapshot = discoverySnapshotSchema.safeParse(data);
      if (!parsedSnapshot.success) throw persistenceFailure();
      const snapshot = parsedSnapshot.data;
      assertSnapshotRelationships(snapshot);
      return snapshot;
    },

    async applyAssessment(input) {
      const parsed = applyAssessmentInputSchema.safeParse(input);
      if (!parsed.success) throw validationFailure();
      const requestFingerprint = await persistenceFingerprint("apply_discovery_assessment_v1", {
        projectId: parsed.data.projectId,
        generationRunId: parsed.data.generationRunId,
        expectedStateVersion: parsed.data.expectedStateVersion,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      const data = await callRpc(boundary, "apply_discovery_assessment_v1", {
        p_project_id: parsed.data.projectId,
        p_generation_run_id: parsed.data.generationRunId,
        p_expected_state_version: parsed.data.expectedStateVersion,
        p_idempotency_key: parsed.data.idempotencyKey,
        p_request_fingerprint: requestFingerprint,
      });
      return parseAssessmentReceipt(data);
    },

    async applyQuestion(input) {
      const parsed = applyQuestionInputSchema.safeParse(input);
      if (!parsed.success) throw validationFailure();
      const requestFingerprint = await persistenceFingerprint("apply_discovery_question_v1", {
        projectId: parsed.data.projectId,
        generationRunId: parsed.data.generationRunId,
        targetFactKey: parsed.data.targetFactKey,
        expectedStateVersion: parsed.data.expectedStateVersion,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      const data = await callRpc(boundary, "apply_discovery_question_v1", {
        p_project_id: parsed.data.projectId,
        p_generation_run_id: parsed.data.generationRunId,
        p_expected_state_version: parsed.data.expectedStateVersion,
        p_idempotency_key: parsed.data.idempotencyKey,
        p_request_fingerprint: requestFingerprint,
      });
      return parseQuestionReceipt(data);
    },

    async executeDiscoveryCommand(envelope) {
      const parsed = parseDiscoveryCommandV1(envelope);
      const requestFingerprint = await sha256Hex(canonicalizeDiscoveryCommandV1(parsed));
      const data = await callRpc(boundary, "execute_discovery_command_v1", {
        p_project_id: parsed.projectId,
        p_expected_state_version: parsed.expectedStateVersion,
        p_idempotency_key: parsed.idempotencyKey,
        p_request_fingerprint: requestFingerprint,
        p_command: parsed.command,
      });
      return parseDiscoveryCommandReceipt(data);
    },

    async completeDiscovery(input) {
      const parsed = completeInputSchema.safeParse(input);
      if (!parsed.success) throw validationFailure();
      const requestFingerprint = await persistenceFingerprint("complete_discovery_v1", {
        projectId: parsed.data.projectId,
        generationRunId: parsed.data.generationRunId,
        expectedStateVersion: parsed.data.expectedStateVersion,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      const data = await callRpc(boundary, "complete_discovery_v1", {
        p_project_id: parsed.data.projectId,
        p_generation_run_id: parsed.data.generationRunId,
        p_expected_state_version: parsed.data.expectedStateVersion,
        p_idempotency_key: parsed.data.idempotencyKey,
        p_request_fingerprint: requestFingerprint,
      });
      return parseCompletionReceipt(data);
    },
  };
}

export { assertSnapshotRelationships };
