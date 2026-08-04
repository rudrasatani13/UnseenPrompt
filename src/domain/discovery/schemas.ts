import { z } from "zod";

import type {
  ComposerDraftCommandEnvelopeV1,
  ComposerDraftCommandV1,
  ComposerDraftCreateInputV1,
  ComposerDraftV1,
  DiscoveryAnswerV1,
  DiscoveryAssessmentV1,
  DiscoveryCommandEnvelopeV1,
  DiscoveryCommandV1,
  DiscoveryQuestionV1,
  DiscoverySessionV1,
  DiscoverySnapshotV1,
  DiscoverySuggestedAnswerV1,
} from "./contracts";
import type {
  DiscoveryActiveQuestionContextV1,
  DiscoveryAssessmentSelectorV1,
  DiscoveryConfirmedTurnV1,
  DiscoveryContextInputV1,
  DiscoveryPreferenceRecordV1,
} from "./context";
import {
  COMPOSER_DRAFT_COMMAND_SCHEMA,
  COMPOSER_DRAFT_INPUT_SCHEMA,
  COMPOSER_DRAFT_STATUSES,
  DISCOVERY_ANSWER_SOURCES,
  DISCOVERY_ANSWER_STATUSES,
  DISCOVERY_COMMAND_SCHEMA,
  DISCOVERY_ERROR_CODES,
  DISCOVERY_QUESTION_STATUSES,
  DISCOVERY_SCHEMA_VERSION,
  DISCOVERY_POLICY_VERSION,
  DISCOVERY_SESSION_STATUSES,
  DiscoveryDomainError,
  PROJECT_MODES,
} from "./contracts";
import { isWellFormedUnicodeStringV1, questionFingerprintV1 } from "./fingerprint";

/** The database and route boundaries count bytes, never JavaScript UTF-16 code units. */
export const MAX_IDEMPOTENCY_KEY_UTF8_BYTES = 255 as const;
export const MAX_INITIAL_REQUEST_UTF8_BYTES = 16_384 as const;
export const MAX_PROJECT_TITLE_UTF8_BYTES = 240 as const;
export const MAX_DISCOVERY_ANSWER_UTF8_BYTES = 16_384 as const;
export const MAX_DISCOVERY_QUESTION_UTF8_BYTES = 500 as const;
export const MAX_DISCOVERY_RATIONALE_UTF8_BYTES = 1_000 as const;
export const MAX_DISCOVERY_LANGUAGE_UTF8_BYTES = 64 as const;
export const MAX_DISCOVERY_FACT_KEY_UTF8_BYTES = 160 as const;
export const MAX_DISCOVERY_SUGGESTED_ANSWERS = 8 as const;
export const MAX_DISCOVERY_TURNS = 12 as const;
export const MAX_DISCOVERY_ASSESSMENTS = 64 as const;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Reject prototype-shaped keys before Zod can normalise them as object metadata. */
export function containsPrototypeKey(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    let arrayPrototype: object | null;
    try {
      arrayPrototype = Object.getPrototypeOf(value);
    } catch {
      return true;
    }
    if (arrayPrototype !== Array.prototype) return true;
    return value.some((entry) => containsPrototypeKey(entry, seen));
  }

  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return true;
  }
  if (prototype !== Object.prototype && prototype !== null) return true;

  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return true;
    if (containsPrototypeKey((value as Record<string, unknown>)[key], seen)) return true;
  }
  return false;
}

function boundedText(maximum: number, { empty = false, preserve = false } = {}) {
  const schema = (preserve ? z.string() : z.string().trim())
    .refine((value) => isWellFormedUnicodeStringV1(value), {
      message: "must contain valid Unicode scalar values",
    })
    .refine((value) => utf8ByteLength(value) <= maximum, {
      message: `must be at most ${maximum} UTF-8 bytes`,
    });
  return empty
    ? schema
    : schema.refine((value) => value.trim().length > 0, {
        message: "must not be blank",
      });
}

const boundedUserText = (maximum: number) => boundedText(maximum, { preserve: true });

const uuidSchema = z.uuid();
const versionSchema = z.number().int().safe().min(1);
const confidenceSchema = z.number().finite().min(0).max(1);
const dateTimeSchema = z.string().datetime({ offset: true });
const projectModeSchema = z.enum(PROJECT_MODES);
const statusErrorSchema = z.enum(DISCOVERY_ERROR_CODES);

const draftStatusSchema = z.enum(COMPOSER_DRAFT_STATUSES);
const sessionStatusSchema = z.enum(DISCOVERY_SESSION_STATUSES);
const questionStatusSchema = z.enum(DISCOVERY_QUESTION_STATUSES);
const answerStatusSchema = z.enum(DISCOVERY_ANSWER_STATUSES);
const answerSourceSchema = z.enum(DISCOVERY_ANSWER_SOURCES);

const prototypeSafe = <T>(schema: z.ZodType<T>): z.ZodType<T> =>
  z.preprocess((value) => (containsPrototypeKey(value) ? undefined : value), schema);

const nullableErrorCodeSchema = statusErrorSchema.nullable();
const nullableText = (maximum: number) => boundedText(maximum, { empty: true }).nullable();

const trustText = (maximum: number) => boundedText(maximum);

const suggestedAnswerSchema: z.ZodType<DiscoverySuggestedAnswerV1> = z.strictObject({
  label: boundedText(MAX_PROJECT_TITLE_UTF8_BYTES),
  value: boundedText(MAX_DISCOVERY_ANSWER_UTF8_BYTES),
});

export const composerDraftSchema: z.ZodType<ComposerDraftV1> = prototypeSafe(
  z
    .strictObject({
      id: uuidSchema,
      ownerId: uuidSchema,
      version: versionSchema,
      initialRequestText: boundedUserText(MAX_INITIAL_REQUEST_UTF8_BYTES),
      status: draftStatusSchema,
      detectedMode: projectModeSchema.nullable(),
      confidence: confidenceSchema.nullable(),
      rationale: nullableText(MAX_DISCOVERY_RATIONALE_UTF8_BYTES),
      detectedLanguage: nullableText(MAX_DISCOVERY_LANGUAGE_UTF8_BYTES),
      intentGenerationRunId: uuidSchema.nullable(),
      confirmedMode: projectModeSchema.nullable(),
      confirmedTitle: nullableText(MAX_PROJECT_TITLE_UTF8_BYTES),
      projectId: uuidSchema.nullable(),
      lastErrorCode: nullableErrorCodeSchema,
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema,
      promotedAt: dateTimeSchema.nullable(),
      abandonedAt: dateTimeSchema.nullable(),
    })
    .superRefine((value, context) => {
      const intentFields = [
        value.detectedMode,
        value.confidence,
        value.rationale,
        value.detectedLanguage,
        value.intentGenerationRunId,
      ];
      const hasAnyIntent = intentFields.some((field) => field !== null);
      const hasAllIntent = intentFields.every(
        (field) => field !== null && String(field).trim() !== "",
      );
      if (hasAnyIntent !== hasAllIntent) {
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "intent fields must be all null or complete",
        });
      }
      if (
        (value.confirmedMode === null) !== (value.confirmedTitle === null) ||
        (value.projectId === null) !== (value.promotedAt === null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "promotion fields must be paired",
        });
      }
      if (value.status === "routing" || value.status === "retry_required") {
        if (
          hasAnyIntent ||
          value.confirmedMode !== null ||
          value.confirmedTitle !== null ||
          value.projectId !== null ||
          value.promotedAt !== null ||
          value.abandonedAt !== null
        ) {
          context.addIssue({
            code: "custom",
            path: ["status"],
            message: "pre-detection draft fields are invalid",
          });
        }
      }
      if (value.status === "retry_required" && value.lastErrorCode === null) {
        context.addIssue({
          code: "custom",
          path: ["lastErrorCode"],
          message: "retry state requires an error code",
        });
      }
      if (value.status === "awaiting_confirmation") {
        if (
          !hasAllIntent ||
          value.confirmedMode !== null ||
          value.confirmedTitle !== null ||
          value.projectId !== null ||
          value.promotedAt !== null ||
          value.abandonedAt !== null
        ) {
          context.addIssue({
            code: "custom",
            path: ["status"],
            message: "confirmation state fields are invalid",
          });
        }
      }
      if (
        value.status === "promoted" &&
        (!hasAllIntent ||
          value.confirmedMode === null ||
          value.confirmedTitle === null ||
          value.confirmedTitle.trim().length === 0 ||
          value.projectId === null ||
          value.promotedAt === null ||
          value.abandonedAt !== null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "promoted state fields are invalid",
        });
      }
      if (
        value.status === "abandoned" &&
        (value.projectId !== null || value.promotedAt !== null || value.abandonedAt === null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "abandoned state fields are invalid",
        });
      }
    }),
);

export const discoverySessionSchema: z.ZodType<DiscoverySessionV1> = prototypeSafe(
  z
    .strictObject({
      id: uuidSchema,
      projectId: uuidSchema,
      sourceDraftId: uuidSchema,
      status: sessionStatusSchema,
      policyVersion: z.literal(DISCOVERY_POLICY_VERSION),
      activeQuestionId: uuidSchema.nullable(),
      latestAssessmentId: uuidSchema.nullable(),
      confirmedTurnCount: z.number().int().safe().min(1).max(MAX_DISCOVERY_TURNS),
      blockCode: z.literal("discovery_turn_limit_reached").nullable(),
      startedAt: dateTimeSchema,
      completedAt: dateTimeSchema.nullable(),
      abandonedAt: dateTimeSchema.nullable(),
    })
    .superRefine((value, context) => {
      const lifecycleValid =
        ((value.status === "active" || value.status === "sufficient") &&
          value.completedAt === null &&
          value.abandonedAt === null &&
          value.blockCode === null) ||
        (value.status === "completed" &&
          value.completedAt !== null &&
          value.abandonedAt === null &&
          value.blockCode === null) ||
        (value.status === "abandoned" &&
          value.abandonedAt !== null &&
          value.completedAt === null &&
          value.blockCode === null) ||
        (value.status === "blocked" &&
          value.blockCode === "discovery_turn_limit_reached" &&
          value.completedAt === null &&
          value.abandonedAt === null);
      if (!lifecycleValid) {
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "session lifecycle fields are invalid",
        });
      }
    }),
);

const missingFactKeysSchema = z
  .array(boundedText(MAX_DISCOVERY_FACT_KEY_UTF8_BYTES))
  .max(32)
  .superRefine((keys, context) => {
    const seen = new Set<string>();
    for (const [index, key] of keys.entries()) {
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
        context.addIssue({ code: "custom", path: [index], message: "invalid fact key" });
      }
      if (seen.has(key)) {
        context.addIssue({ code: "custom", path: [index], message: "duplicate fact key" });
      }
      seen.add(key);
    }
  });

export const discoveryAssessmentSchema: z.ZodType<DiscoveryAssessmentV1> = prototypeSafe(
  z
    .strictObject({
      id: uuidSchema,
      projectId: uuidSchema,
      sessionId: uuidSchema,
      generationRunId: uuidSchema,
      basisStateVersion: versionSchema,
      isSufficient: z.boolean(),
      confidence: confidenceSchema,
      missingFactKeys: missingFactKeysSchema,
      rationale: boundedText(MAX_DISCOVERY_RATIONALE_UTF8_BYTES),
      policyPassed: z.boolean(),
      policyFailureCode: nullableErrorCodeSchema,
      createdAt: dateTimeSchema,
    })
    .superRefine((value, context) => {
      if (value.policyPassed !== (value.policyFailureCode === null)) {
        context.addIssue({
          code: "custom",
          path: ["policyFailureCode"],
          message: "policy result is inconsistent",
        });
      }
    }),
);

const questionFingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "must be a SHA-256 hexadecimal fingerprint");
const questionTextSchema = boundedText(MAX_DISCOVERY_QUESTION_UTF8_BYTES).refine(
  (value) => [...value].filter((character) => character === "?").length === 1,
  "must contain exactly one question mark",
);

function assertQuestionFingerprintMatchesText(
  value: { readonly questionText: string; readonly questionFingerprint: string },
  context: z.RefinementCtx,
): void {
  if (questionFingerprintV1(value.questionText) !== value.questionFingerprint) {
    context.addIssue({
      code: "custom",
      path: ["questionFingerprint"],
      message: "must match the canonical question-text fingerprint",
    });
  }
}

export const discoveryQuestionSchema: z.ZodType<DiscoveryQuestionV1> = prototypeSafe(
  z
    .strictObject({
      id: uuidSchema,
      projectId: uuidSchema,
      sessionId: uuidSchema,
      generationRunId: uuidSchema,
      position: z.number().int().safe().min(1).max(MAX_DISCOVERY_TURNS),
      targetFactKey: boundedText(MAX_DISCOVERY_FACT_KEY_UTF8_BYTES).refine(
        (value) => /^[a-z][a-z0-9_]*$/.test(value),
        "must be an ASCII fact key",
      ),
      basisStateVersion: versionSchema,
      questionText: questionTextSchema,
      rationale: boundedText(MAX_DISCOVERY_RATIONALE_UTF8_BYTES),
      suggestedAnswers: z
        .array(suggestedAnswerSchema)
        .max(MAX_DISCOVERY_SUGGESTED_ANSWERS)
        .superRefine((answers, context) => {
          const values = new Set<string>();
          for (const [index, answer] of answers.entries()) {
            if (values.has(answer.value)) {
              context.addIssue({
                code: "custom",
                path: [index, "value"],
                message: "duplicate suggested answer",
              });
            }
            values.add(answer.value);
          }
        }),
      allowsFreeText: z.boolean(),
      questionFingerprint: questionFingerprintSchema,
      status: questionStatusSchema,
      createdAt: dateTimeSchema,
      answeredAt: dateTimeSchema.nullable(),
      supersededAt: dateTimeSchema.nullable(),
    })
    .superRefine((value, context) => {
      if (value.status === "active" && (value.answeredAt !== null || value.supersededAt !== null)) {
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "active timestamps invalid",
        });
      }
      if (value.status === "answered" && value.answeredAt === null) {
        context.addIssue({
          code: "custom",
          path: ["answeredAt"],
          message: "required when answered",
        });
      }
      if (value.status === "superseded" && value.supersededAt === null) {
        context.addIssue({
          code: "custom",
          path: ["supersededAt"],
          message: "required when superseded",
        });
      }
      assertQuestionFingerprintMatchesText(value, context);
    }),
);

export const discoveryAnswerSchema: z.ZodType<DiscoveryAnswerV1> = prototypeSafe(
  z
    .strictObject({
      id: uuidSchema,
      projectId: uuidSchema,
      sessionId: uuidSchema,
      questionId: uuidSchema,
      source: answerSourceSchema,
      answerText: boundedUserText(MAX_DISCOVERY_ANSWER_UTF8_BYTES),
      status: answerStatusSchema,
      supersedesAnswerId: uuidSchema.nullable(),
      confirmationEventId: uuidSchema,
      createdAt: dateTimeSchema,
      supersededAt: dateTimeSchema.nullable(),
    })
    .superRefine((value, context) => {
      if (value.status === "confirmed" && value.supersededAt !== null) {
        context.addIssue({
          code: "custom",
          path: ["supersededAt"],
          message: "invalid for confirmed",
        });
      }
      if (value.status === "superseded" && value.supersededAt === null) {
        context.addIssue({
          code: "custom",
          path: ["supersededAt"],
          message: "required when superseded",
        });
      }
      if (value.supersedesAnswerId === value.id) {
        context.addIssue({
          code: "custom",
          path: ["supersedesAnswerId"],
          message: "self reference",
        });
      }
    }),
);

const retryIntentCommandSchema = z.strictObject({ type: z.literal("retry_intent") });
const confirmAndPromoteCommandSchema = z.strictObject({
  type: z.literal("confirm_and_promote"),
  confirmedMode: projectModeSchema,
  confirmedTitle: boundedText(MAX_PROJECT_TITLE_UTF8_BYTES),
});
const abandonDraftCommandSchema = z.strictObject({ type: z.literal("abandon_draft") });

export const composerDraftCommandSchema = z.discriminatedUnion("type", [
  retryIntentCommandSchema,
  confirmAndPromoteCommandSchema,
  abandonDraftCommandSchema,
]) as unknown as z.ZodType<ComposerDraftCommandV1>;

const draftCommandEnvelopeShape = z.strictObject({
  schema: z.literal(COMPOSER_DRAFT_COMMAND_SCHEMA),
  schemaVersion: z.literal(DISCOVERY_SCHEMA_VERSION),
  draftId: uuidSchema,
  expectedVersion: versionSchema,
  idempotencyKey: boundedText(MAX_IDEMPOTENCY_KEY_UTF8_BYTES),
  command: composerDraftCommandSchema,
});

export const composerDraftCommandEnvelopeSchema: z.ZodType<ComposerDraftCommandEnvelopeV1> =
  prototypeSafe(draftCommandEnvelopeShape);

const advanceDiscoveryCommandSchema = z.strictObject({ type: z.literal("advance_discovery") });
const confirmAnswerCommandSchema = z.strictObject({
  type: z.literal("confirm_answer"),
  questionId: uuidSchema,
  source: answerSourceSchema,
  answerText: boundedUserText(MAX_DISCOVERY_ANSWER_UTF8_BYTES),
});
const reviseAnswerCommandSchema = z.strictObject({
  type: z.literal("revise_answer"),
  questionId: uuidSchema,
  predecessorAnswerId: uuidSchema,
  source: answerSourceSchema,
  answerText: boundedUserText(MAX_DISCOVERY_ANSWER_UTF8_BYTES),
});
const abandonDiscoveryCommandSchema = z.strictObject({ type: z.literal("abandon_discovery") });
const resumeDiscoveryCommandSchema = z.strictObject({ type: z.literal("resume_discovery") });

export const discoveryCommandSchema = z.discriminatedUnion("type", [
  advanceDiscoveryCommandSchema,
  confirmAnswerCommandSchema,
  reviseAnswerCommandSchema,
  abandonDiscoveryCommandSchema,
  resumeDiscoveryCommandSchema,
]) as unknown as z.ZodType<DiscoveryCommandV1>;

const discoveryCommandEnvelopeShape = z.strictObject({
  schema: z.literal(DISCOVERY_COMMAND_SCHEMA),
  schemaVersion: z.literal(DISCOVERY_SCHEMA_VERSION),
  projectId: uuidSchema,
  expectedStateVersion: versionSchema,
  idempotencyKey: boundedText(MAX_IDEMPOTENCY_KEY_UTF8_BYTES),
  command: discoveryCommandSchema,
});

export const discoveryCommandEnvelopeSchema: z.ZodType<DiscoveryCommandEnvelopeV1> = prototypeSafe(
  discoveryCommandEnvelopeShape,
);

export const composerDraftCreateInputSchema: z.ZodType<ComposerDraftCreateInputV1> = prototypeSafe(
  z.strictObject({
    schema: z.literal(COMPOSER_DRAFT_INPUT_SCHEMA),
    schemaVersion: z.literal(DISCOVERY_SCHEMA_VERSION),
    initialRequestText: boundedUserText(MAX_INITIAL_REQUEST_UTF8_BYTES),
    idempotencyKey: boundedText(MAX_IDEMPOTENCY_KEY_UTF8_BYTES),
  }),
);

export const discoverySnapshotSchema: z.ZodType<DiscoverySnapshotV1> = prototypeSafe(
  z.strictObject({
    projectId: uuidSchema,
    mode: projectModeSchema,
    stage: z.literal("discovery"),
    stateVersion: versionSchema,
    session: discoverySessionSchema,
    initialRequestText: boundedUserText(MAX_INITIAL_REQUEST_UTF8_BYTES),
    confirmedQuestions: z.array(discoveryQuestionSchema).max(MAX_DISCOVERY_TURNS),
    confirmedAnswers: z.array(discoveryAnswerSchema).max(MAX_DISCOVERY_TURNS),
    assessments: z.array(discoveryAssessmentSchema).max(MAX_DISCOVERY_ASSESSMENTS),
    activeQuestion: discoveryQuestionSchema.nullable(),
  }),
);

const discoveryPreferenceSchema: z.ZodType<DiscoveryPreferenceRecordV1> = z.strictObject({
  field: z.enum(["language", "skillLevel", "explanationDepth"]),
  value: trustText(MAX_DISCOVERY_ANSWER_UTF8_BYTES),
  source: z.enum(["global", "project", "system"]),
});

const discoveryConfirmedTurnSchema: z.ZodType<DiscoveryConfirmedTurnV1> = z
  .strictObject({
    questionId: uuidSchema,
    position: z.number().int().safe().min(1).max(MAX_DISCOVERY_TURNS),
    targetFactKey: boundedText(MAX_DISCOVERY_FACT_KEY_UTF8_BYTES).refine(
      (value) => /^[a-z][a-z0-9_]*$/.test(value),
      "must be an ASCII fact key",
    ),
    questionText: questionTextSchema,
    rationale: boundedText(MAX_DISCOVERY_RATIONALE_UTF8_BYTES),
    questionFingerprint: questionFingerprintSchema,
    answerId: uuidSchema,
    answerText: boundedUserText(MAX_DISCOVERY_ANSWER_UTF8_BYTES),
    answerSource: answerSourceSchema,
    answeredAt: dateTimeSchema,
  })
  .superRefine(assertQuestionFingerprintMatchesText);

const discoveryActiveQuestionSchema: z.ZodType<DiscoveryActiveQuestionContextV1> = z
  .strictObject({
    questionId: uuidSchema,
    position: z.number().int().safe().min(1).max(MAX_DISCOVERY_TURNS),
    targetFactKey: boundedText(MAX_DISCOVERY_FACT_KEY_UTF8_BYTES).refine(
      (value) => /^[a-z][a-z0-9_]*$/.test(value),
      "must be an ASCII fact key",
    ),
    questionText: questionTextSchema,
    rationale: boundedText(MAX_DISCOVERY_RATIONALE_UTF8_BYTES),
    questionFingerprint: questionFingerprintSchema,
    suggestedAnswers: z.array(suggestedAnswerSchema).max(MAX_DISCOVERY_SUGGESTED_ANSWERS),
    allowsFreeText: z.boolean(),
  })
  .superRefine(assertQuestionFingerprintMatchesText);

const discoveryAssessmentSelectorSchema: z.ZodType<DiscoveryAssessmentSelectorV1> = z.strictObject({
  assessmentId: uuidSchema,
  basisStateVersion: versionSchema,
  isSufficient: z.boolean(),
  confidence: confidenceSchema,
  missingFactKeys: missingFactKeysSchema,
  rationale: boundedText(MAX_DISCOVERY_RATIONALE_UTF8_BYTES),
  createdAt: dateTimeSchema,
});

export const discoveryContextInputSchema: z.ZodType<DiscoveryContextInputV1> = prototypeSafe(
  z.strictObject({
    projectId: uuidSchema,
    mode: projectModeSchema,
    stage: z.literal("discovery"),
    stateVersion: versionSchema,
    policyVersion: z.literal(DISCOVERY_POLICY_VERSION),
    initialRequestText: boundedUserText(MAX_INITIAL_REQUEST_UTF8_BYTES),
    confirmedTurns: z.array(discoveryConfirmedTurnSchema).max(MAX_DISCOVERY_TURNS),
    activeQuestion: discoveryActiveQuestionSchema.nullable(),
    requiredFactKeys: z
      .array(boundedText(MAX_DISCOVERY_FACT_KEY_UTF8_BYTES))
      .max(32)
      .superRefine((keys, context) => {
        const seen = new Set<string>();
        keys.forEach((key, index) => {
          if (!/^[a-z][a-z0-9_]*$/.test(key)) {
            context.addIssue({ code: "custom", path: [index], message: "invalid fact key" });
          }
          if (seen.has(key)) {
            context.addIssue({ code: "custom", path: [index], message: "duplicate fact key" });
          }
          seen.add(key);
        });
      }),
    confirmedQuestionFingerprints: z.array(questionFingerprintSchema).max(MAX_DISCOVERY_TURNS),
    preferences: z.array(discoveryPreferenceSchema).max(3).nullable().optional(),
    priorAssessments: z
      .array(discoveryAssessmentSelectorSchema)
      .max(MAX_DISCOVERY_ASSESSMENTS)
      .optional(),
  }),
);

export function parseDiscoveryContextInputV1(value: unknown): DiscoveryContextInputV1 {
  const parsed = discoveryContextInputSchema.safeParse(value);
  if (!parsed.success) throw new DiscoveryDomainError("validation_failed");
  return parsed.data;
}

export function safeParseDiscoveryContextInputV1(value: unknown) {
  return discoveryContextInputSchema.safeParse(value);
}

export function parseComposerDraftCreateInputV1(value: unknown): ComposerDraftCreateInputV1 {
  const parsed = composerDraftCreateInputSchema.safeParse(value);
  if (!parsed.success) throw new DiscoveryDomainError("validation_failed");
  return parsed.data;
}

export function parseComposerDraftCommandV1(value: unknown): ComposerDraftCommandEnvelopeV1 {
  const parsed = composerDraftCommandEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new DiscoveryDomainError("validation_failed");
  return parsed.data;
}

export function safeParseComposerDraftCommandV1(value: unknown) {
  return composerDraftCommandEnvelopeSchema.safeParse(value);
}

export function parseDiscoveryCommandV1(value: unknown): DiscoveryCommandEnvelopeV1 {
  const parsed = discoveryCommandEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new DiscoveryDomainError("validation_failed");
  return parsed.data;
}

export function safeParseDiscoveryCommandV1(value: unknown) {
  return discoveryCommandEnvelopeSchema.safeParse(value);
}

/** Canonical JSON used for idempotency and deterministic context fingerprints. */
export function serializeCanonicalJsonV1(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (candidate: unknown): string => {
    if (candidate === null) return "null";
    if (typeof candidate === "string") return JSON.stringify(candidate);
    if (typeof candidate === "boolean") return candidate ? "true" : "false";
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw new DiscoveryDomainError("validation_failed");
      const rendered = JSON.stringify(candidate);
      if (rendered === undefined) throw new DiscoveryDomainError("validation_failed");
      return rendered;
    }
    if (typeof candidate !== "object" || ancestors.has(candidate))
      throw new DiscoveryDomainError("validation_failed");
    ancestors.add(candidate);
    let rendered: string;
    if (Array.isArray(candidate)) {
      let arrayPrototype: object | null;
      try {
        arrayPrototype = Object.getPrototypeOf(candidate);
      } catch {
        throw new DiscoveryDomainError("validation_failed");
      }
      if (arrayPrototype !== Array.prototype) {
        throw new DiscoveryDomainError("validation_failed");
      }
      for (let index = 0; index < candidate.length; index += 1) {
        if (!Object.hasOwn(candidate, index)) throw new DiscoveryDomainError("validation_failed");
      }
      rendered = `[${candidate.map((entry) => visit(entry)).join(",")}]`;
    } else {
      let prototype: object | null;
      try {
        prototype = Object.getPrototypeOf(candidate);
      } catch {
        throw new DiscoveryDomainError("validation_failed");
      }
      if (prototype !== Object.prototype && prototype !== null)
        throw new DiscoveryDomainError("validation_failed");
      const keys = Object.keys(candidate).sort();
      rendered = `{${keys
        .map((key) => {
          if (key === "__proto__" || key === "constructor" || key === "prototype") {
            throw new DiscoveryDomainError("validation_failed");
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

export function canonicalizeComposerDraftCommandV1(
  value: ComposerDraftCommandEnvelopeV1,
): Uint8Array {
  return new TextEncoder().encode(serializeCanonicalJsonV1(parseComposerDraftCommandV1(value)));
}

export function canonicalizeDiscoveryCommandV1(value: DiscoveryCommandEnvelopeV1): Uint8Array {
  return new TextEncoder().encode(serializeCanonicalJsonV1(parseDiscoveryCommandV1(value)));
}

export type ComposerDraftCreateInput = ComposerDraftCreateInputV1;
export type ComposerDraftCommandEnvelope = ComposerDraftCommandEnvelopeV1;
export type DiscoveryCommandEnvelope = DiscoveryCommandEnvelopeV1;
