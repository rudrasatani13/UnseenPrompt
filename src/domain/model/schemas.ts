import { z } from "zod";

import type {
  ActionSpecificationV1,
  ClarificationAnswerV1,
  ClarificationQuestionV1,
  CompletionSuggestionV1,
  DecisionProposalV1,
  DiscoverySufficiencyV1,
  EvidenceAnalysisV1,
  EvidenceTestResultV1,
  IntentDetectionV1,
  MilestoneProposalV1,
  ModelOperation,
  ModelOutputByOperation,
  ModelOutputSchema,
  ProposalAction,
  ProjectDeltaV1,
  RequirementProposalV1,
  RiskFlagV1,
  RiskFlagsV1,
  StackAlternativeV1,
  StackRecommendationV1,
  StackRecommendationV1Details,
} from "@/domain/model/contracts";
import { projectToProviderJsonSchema } from "@/domain/model/json-schema";

/** These limits are intentionally conservative; model output is user-visible decision evidence. */
export const MODEL_OUTPUT_STRING_MAX = 4_000;
export const MODEL_OUTPUT_SHORT_STRING_MAX = 1_000;
export const MODEL_OUTPUT_IDENTIFIER_MAX = 160;
export const MODEL_OUTPUT_ARRAY_MAX = 32;
export const MODEL_OUTPUT_SUGGESTED_ANSWERS_MAX = 8;
export const MODEL_OUTPUT_ALTERNATIVES_MAX = 8;

const boundedText = (maximum = MODEL_OUTPUT_STRING_MAX) => z.string().trim().min(1).max(maximum);
const emptyOrBoundedText = (maximum = MODEL_OUTPUT_STRING_MAX) => z.string().trim().max(maximum);
const boundedList = <T extends z.ZodType>(item: T, maximum = MODEL_OUTPUT_ARRAY_MAX) =>
  z.array(item).max(maximum);

/** Reject prototype-shaped keys before Zod can normalise them away as object metadata. */
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

function strictOutput<T>(schema: z.ZodType<T>): z.ZodType<T> {
  return z.preprocess((value) => (containsPrototypeKey(value) ? undefined : value), schema);
}

const confidenceSchema = z.number().finite().min(0).max(1);

const intentModeSchema = z.enum([
  "new_build",
  "feature",
  "bug",
  "review",
  "test",
  "deploy",
  "improve",
]);

const detectedLanguageSchema = boundedText(64).refine(
  (value) => value === "undetermined" || /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value),
  { message: "must be a BCP-47-like language label or undetermined" },
);

export const intentDetectionSchema: z.ZodType<IntentDetectionV1> = strictOutput(
  z.strictObject({
    mode: intentModeSchema,
    confidence: confidenceSchema,
    rationale: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
    detectedLanguage: detectedLanguageSchema,
  }),
);

export const discoverySufficiencySchema: z.ZodType<DiscoverySufficiencyV1> = strictOutput(
  z.strictObject({
    isSufficient: z.boolean(),
    confidence: confidenceSchema,
    missingFacts: boundedList(boundedText(MODEL_OUTPUT_IDENTIFIER_MAX)),
    rationale: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
  }),
);

const clarificationAnswerSchema: z.ZodType<ClarificationAnswerV1> = z.strictObject({
  label: boundedText(240),
  value: boundedText(500),
});

const oneQuestionSchema = boundedText(500).refine(
  (value) => [...value].filter((character) => character === "?").length === 1,
  { message: "must contain exactly one question" },
);

export const clarificationQuestionSchema: z.ZodType<ClarificationQuestionV1> = strictOutput(
  z.strictObject({
    question: oneQuestionSchema,
    rationale: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
    suggestedAnswers: boundedList(clarificationAnswerSchema, MODEL_OUTPUT_SUGGESTED_ANSWERS_MAX),
    allowsFreeText: z.boolean(),
  }),
);

const proposalActionSchema = z.enum(["add", "revise", "remove"]);
const proposalReferenceSchema = emptyOrBoundedText(MODEL_OUTPUT_IDENTIFIER_MAX);

function requireProposalReferenceForExistingAction(
  value: { readonly action: ProposalAction; readonly reference: string },
  context: z.RefinementCtx,
): void {
  if (value.action !== "add" && value.reference.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["reference"],
      message: "must be non-empty when action is revise or remove",
    });
  }
}

const requirementProposalSchema: z.ZodType<RequirementProposalV1> = z
  .strictObject({
    action: proposalActionSchema,
    reference: proposalReferenceSchema,
    statement: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
    rationale: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
  })
  .superRefine(requireProposalReferenceForExistingAction);

const decisionProposalSchema: z.ZodType<DecisionProposalV1> = z
  .strictObject({
    action: proposalActionSchema,
    reference: proposalReferenceSchema,
    statement: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
    rationale: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
  })
  .superRefine(requireProposalReferenceForExistingAction);

const milestoneProposalSchema: z.ZodType<MilestoneProposalV1> = z
  .strictObject({
    action: proposalActionSchema,
    reference: proposalReferenceSchema,
    title: boundedText(240),
    rationale: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
  })
  .superRefine(requireProposalReferenceForExistingAction);

export const projectDeltaSchema: z.ZodType<ProjectDeltaV1> = strictOutput(
  z.strictObject({
    summary: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
    requirementProposals: boundedList(requirementProposalSchema),
    decisionProposals: boundedList(decisionProposalSchema),
    milestoneProposals: boundedList(milestoneProposalSchema),
    unresolvedConflicts: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
  }),
);

const stackRecommendationDetailsSchema: z.ZodType<StackRecommendationV1Details> = z.strictObject({
  frontend: boundedText(240),
  backend: boundedText(240),
  database: boundedText(240),
  hosting: boundedText(240),
});

const stackAlternativeSchema: z.ZodType<StackAlternativeV1> = z.strictObject({
  name: boundedText(240),
  whenToChoose: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
  tradeoffs: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
});

export const stackRecommendationSchema: z.ZodType<StackRecommendationV1> = strictOutput(
  z.strictObject({
    recommendation: stackRecommendationDetailsSchema,
    rationale: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
    alternatives: boundedList(stackAlternativeSchema, MODEL_OUTPUT_ALTERNATIVES_MAX),
    risks: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
  }),
);

export const actionSpecificationSchema: z.ZodType<ActionSpecificationV1> = strictOutput(
  z.strictObject({
    purpose: boundedText(MODEL_OUTPUT_STRING_MAX),
    context: boundedText(MODEL_OUTPUT_STRING_MAX),
    task: boundedText(MODEL_OUTPUT_STRING_MAX),
    expectedResult: boundedText(MODEL_OUTPUT_STRING_MAX),
    boundaries: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
    acceptanceCriteria: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
    verification: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
    riskFlags: boundedList(boundedText(MODEL_OUTPUT_IDENTIFIER_MAX)),
  }),
);

const evidenceTestStatusSchema = z.enum(["passed", "failed", "not_run", "unclear"]);
const evidenceTestResultSchema: z.ZodType<EvidenceTestResultV1> = z.strictObject({
  name: boundedText(240),
  status: evidenceTestStatusSchema,
  evidence: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
});

export const evidenceAnalysisSchema: z.ZodType<EvidenceAnalysisV1> = strictOutput(
  z.strictObject({
    claimedChanges: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
    evidenceSupplied: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
    missingEvidence: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
    errors: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
    blockers: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
    testResults: boundedList(evidenceTestResultSchema),
    summary: boundedText(MODEL_OUTPUT_STRING_MAX),
  }),
);

const completionStatusSchema = z.enum([
  "completed",
  "needs_verification",
  "blocked",
  "in_progress",
]);

export const completionSuggestionSchema: z.ZodType<CompletionSuggestionV1> = strictOutput(
  z.strictObject({
    suggestedStatus: completionStatusSchema,
    confidence: confidenceSchema,
    rationale: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
    requiredVerification: boundedList(boundedText(MODEL_OUTPUT_SHORT_STRING_MAX)),
  }),
);

const riskCategorySchema = z.enum([
  "security",
  "privacy",
  "data_integrity",
  "destructive_action",
  "cost",
  "reliability",
  "scope",
]);
const riskSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
const riskFlagSchema: z.ZodType<RiskFlagV1> = z.strictObject({
  id: boundedText(MODEL_OUTPUT_IDENTIFIER_MAX),
  category: riskCategorySchema,
  severity: riskSeveritySchema,
  description: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
  mitigation: boundedText(MODEL_OUTPUT_SHORT_STRING_MAX),
});

export const riskFlagsSchema: z.ZodType<RiskFlagsV1> = strictOutput(
  z.strictObject({
    risks: boundedList(riskFlagSchema),
  }),
);

// Explicit v1 aliases make schema-version use at call sites obvious while retaining concise names.
export const intentDetectionV1Schema = intentDetectionSchema;
export const discoverySufficiencyV1Schema = discoverySufficiencySchema;
export const clarificationQuestionV1Schema = clarificationQuestionSchema;
export const projectDeltaV1Schema = projectDeltaSchema;
export const stackRecommendationV1Schema = stackRecommendationSchema;
export const actionSpecificationV1Schema = actionSpecificationSchema;
export const evidenceAnalysisV1Schema = evidenceAnalysisSchema;
export const completionSuggestionV1Schema = completionSuggestionSchema;
export const riskFlagsV1Schema = riskFlagsSchema;

export type IntentDetection = IntentDetectionV1;
export type DiscoverySufficiency = DiscoverySufficiencyV1;
export type ClarificationQuestion = ClarificationQuestionV1;
export type ProjectDelta = ProjectDeltaV1;
export type StackRecommendation = StackRecommendationV1;
export type ActionSpecification = ActionSpecificationV1;
export type EvidenceAnalysis = EvidenceAnalysisV1;
export type CompletionSuggestion = CompletionSuggestionV1;
export type RiskFlags = RiskFlagsV1;

export const MODEL_OUTPUT_SCHEMA_NAMESPACE = "unseenprompt.model-output" as const;
export const MODEL_OUTPUT_SCHEMA_VERSION = 1 as const;

function makeOutputSchema<O extends ModelOperation, T>(
  operation: O,
  schema: z.ZodType<T>,
): ModelOutputSchema<T, O> {
  const id = `${MODEL_OUTPUT_SCHEMA_NAMESPACE}.${operation}`;
  const versionedId = `${id}.v${MODEL_OUTPUT_SCHEMA_VERSION}`;
  return Object.freeze({
    id,
    operation,
    version: MODEL_OUTPUT_SCHEMA_VERSION,
    versionedId,
    schemaVersion: versionedId,
    schema,
    jsonSchema: projectToProviderJsonSchema(schema as z.ZodType<unknown>),
  });
}

export const modelOutputSchemaRegistry = Object.freeze({
  intent_detection: makeOutputSchema("intent_detection", intentDetectionSchema),
  discovery_sufficiency: makeOutputSchema("discovery_sufficiency", discoverySufficiencySchema),
  clarification_question: makeOutputSchema("clarification_question", clarificationQuestionSchema),
  project_delta: makeOutputSchema("project_delta", projectDeltaSchema),
  stack_recommendation: makeOutputSchema("stack_recommendation", stackRecommendationSchema),
  action_specification: makeOutputSchema("action_specification", actionSpecificationSchema),
  evidence_analysis: makeOutputSchema("evidence_analysis", evidenceAnalysisSchema),
  completion_suggestion: makeOutputSchema("completion_suggestion", completionSuggestionSchema),
  risk_flags: makeOutputSchema("risk_flags", riskFlagsSchema),
} satisfies { readonly [O in ModelOperation]: ModelOutputSchema<ModelOutputByOperation[O], O> });

export type ModelOutputSchemaRegistry = typeof modelOutputSchemaRegistry;

export const MODEL_OUTPUT_SCHEMA_REGISTRY = modelOutputSchemaRegistry;
export const modelOutputSchemas = modelOutputSchemaRegistry;

export function getModelOutputSchema<O extends ModelOperation>(
  operation: O,
): ModelOutputSchema<ModelOutputByOperation[O], O> {
  return modelOutputSchemaRegistry[operation] as ModelOutputSchema<ModelOutputByOperation[O], O>;
}

export const getSchemaForOperation = getModelOutputSchema;
