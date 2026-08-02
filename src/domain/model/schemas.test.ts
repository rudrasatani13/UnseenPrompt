import { describe, expect, it } from "vitest";

import type {
  IntentDetectionV1,
  ModelGatewayRequest,
  ModelOperation,
} from "@/domain/model/contracts";
import {
  MODEL_OUTPUT_ARRAY_MAX,
  MODEL_OUTPUT_SCHEMA_NAMESPACE,
  MODEL_OUTPUT_SCHEMA_VERSION,
  MODEL_OUTPUT_STRING_MAX,
  actionSpecificationSchema,
  clarificationQuestionSchema,
  completionSuggestionSchema,
  discoverySufficiencySchema,
  evidenceAnalysisSchema,
  getModelOutputSchema,
  intentDetectionSchema,
  modelOutputSchemaRegistry,
  projectDeltaSchema,
  riskFlagsSchema,
  stackRecommendationSchema,
} from "@/domain/model/schemas";

const validOutputs = {
  intent_detection: {
    mode: "new_build",
    confidence: 0.8,
    rationale: "The request describes a new application.",
    detectedLanguage: "en-US",
  },
  discovery_sufficiency: {
    isSufficient: false,
    confidence: 0.4,
    missingFacts: ["target users"],
    rationale: "The target users are not specified.",
  },
  clarification_question: {
    question: "Who will use this application?",
    rationale: "The audience determines the first workflow.",
    suggestedAnswers: [{ label: "Customers", value: "External customers" }],
    allowsFreeText: true,
  },
  project_delta: {
    summary: "Add the initial user requirement.",
    requirementProposals: [
      {
        action: "add",
        reference: "",
        statement: "Users can create an account.",
        rationale: "Account ownership is required for the workflow.",
      },
    ],
    decisionProposals: [],
    milestoneProposals: [],
    unresolvedConflicts: [],
  },
  stack_recommendation: {
    recommendation: {
      frontend: "Web UI",
      backend: "Cloudflare Workers",
      database: "Postgres",
      hosting: "Cloudflare",
    },
    rationale: ["The stack keeps deployment close to the target runtime."],
    alternatives: [
      {
        name: "Alternative",
        whenToChoose: "Choose this when a different runtime is required.",
        tradeoffs: "It adds operational complexity.",
      },
    ],
    risks: [],
  },
  action_specification: {
    purpose: "Implement the requested change.",
    context: "The project currently has no implementation.",
    task: "Add the feature behind a typed boundary.",
    expectedResult: "A tested, reviewable implementation.",
    boundaries: ["Do not change unrelated modules."],
    acceptanceCriteria: ["The feature has focused tests."],
    verification: ["Run the unit test suite."],
    riskFlags: ["scope-review"],
  },
  evidence_analysis: {
    claimedChanges: ["The implementation was added."],
    evidenceSupplied: ["The focused test output was supplied."],
    missingEvidence: [],
    errors: [],
    blockers: [],
    testResults: [{ name: "unit", status: "passed", evidence: "All focused tests passed." }],
    summary: "The supplied evidence supports the claim.",
  },
  completion_suggestion: {
    suggestedStatus: "needs_verification",
    confidence: 0.7,
    rationale: "The implementation is present but a build is still required.",
    requiredVerification: ["Run the production build."],
  },
  risk_flags: {
    risks: [
      {
        id: "secret-exposure",
        category: "security",
        severity: "high",
        description: "A secret could be exposed by an unsafe log.",
        mitigation: "Use an allowlisted diagnostic event.",
      },
    ],
  },
} as const satisfies Record<ModelOperation, unknown>;

const schemas = {
  intent_detection: intentDetectionSchema,
  discovery_sufficiency: discoverySufficiencySchema,
  clarification_question: clarificationQuestionSchema,
  project_delta: projectDeltaSchema,
  stack_recommendation: stackRecommendationSchema,
  action_specification: actionSpecificationSchema,
  evidence_analysis: evidenceAnalysisSchema,
  completion_suggestion: completionSuggestionSchema,
  risk_flags: riskFlagsSchema,
} as const satisfies Record<ModelOperation, { safeParse: (value: unknown) => unknown }>;

describe("model output schemas", () => {
  it.each(Object.entries(schemas))(
    "accepts a representative %s output and trims strings",
    (operation, schema) => {
      const parsed = schema.safeParse(validOutputs[operation as ModelOperation]);
      expect(parsed).toMatchObject({ success: true });
    },
  );

  it.each(Object.entries(schemas))("rejects an extra root key for %s", (operation, schema) => {
    const candidate = { ...validOutputs[operation as ModelOperation], unexpected: true };
    expect(schema.safeParse(candidate)).toMatchObject({ success: false });
  });

  it("rejects an extra nested key in a closed proposal object", () => {
    const candidate = {
      ...validOutputs.project_delta,
      requirementProposals: [
        { ...validOutputs.project_delta.requirementProposals[0], unexpected: "nope" },
      ],
    };
    expect(projectDeltaSchema.safeParse(candidate)).toMatchObject({ success: false });
  });

  it("rejects prototype-shaped keys instead of normalising them away", () => {
    const candidate = JSON.parse('{"risks":[],"__proto__":{"polluted":true}}') as Record<
      string,
      unknown
    >;
    expect(riskFlagsSchema.safeParse(candidate)).toMatchObject({ success: false });
  });

  it("rejects non-finite and out-of-range confidence values", () => {
    expect(
      intentDetectionSchema.safeParse({ ...validOutputs.intent_detection, confidence: Number.NaN }),
    ).toMatchObject({ success: false });
    expect(
      completionSuggestionSchema.safeParse({
        ...validOutputs.completion_suggestion,
        confidence: 1.01,
      }),
    ).toMatchObject({ success: false });
  });

  it("enforces the exactly-one-question and proposal-reference refinements", () => {
    expect(
      clarificationQuestionSchema.safeParse({
        ...validOutputs.clarification_question,
        question: "Which workflow? Which audience?",
      }),
    ).toMatchObject({ success: false });
    expect(
      projectDeltaSchema.safeParse({
        ...validOutputs.project_delta,
        requirementProposals: [
          {
            ...validOutputs.project_delta.requirementProposals[0],
            action: "revise",
            reference: "",
          },
        ],
      }),
    ).toMatchObject({ success: false });
  });

  it("enforces bounded strings and arrays", () => {
    expect(
      actionSpecificationSchema.safeParse({
        ...validOutputs.action_specification,
        purpose: "x".repeat(MODEL_OUTPUT_STRING_MAX + 1),
      }),
    ).toMatchObject({ success: false });
    expect(
      riskFlagsSchema.safeParse({
        risks: Array.from(
          { length: MODEL_OUTPUT_ARRAY_MAX + 1 },
          () => validOutputs.risk_flags.risks[0],
        ),
      }),
    ).toMatchObject({ success: false });
  });

  it("trims accepted text before returning the value", () => {
    const parsed = intentDetectionSchema.parse({
      ...validOutputs.intent_detection,
      rationale: "  concise basis  ",
    });
    expect(parsed.rationale).toBe("concise basis");
  });
});

describe("versioned model output registry", () => {
  const operations = Object.keys(modelOutputSchemaRegistry) as ModelOperation[];

  it("contains exactly the nine operation keys", () => {
    expect(operations).toHaveLength(9);
    expect(new Set(operations).size).toBe(9);
  });

  it("assigns unique operation IDs and versioned IDs", () => {
    const entries = Object.values(modelOutputSchemaRegistry);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    expect(new Set(entries.map((entry) => entry.versionedId)).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.id).toBe(`${MODEL_OUTPUT_SCHEMA_NAMESPACE}.${entry.operation}`);
      expect(entry.version).toBe(MODEL_OUTPUT_SCHEMA_VERSION);
      expect(entry.versionedId).toBe(`${entry.id}.v${entry.version}`);
      expect(entry.schemaVersion).toBe(entry.versionedId);
      expect(entry.operation).toBe(getModelOutputSchema(entry.operation).operation);
    }
  });

  it("projects every registry entry as a strict root object", () => {
    for (const entry of Object.values(modelOutputSchemaRegistry)) {
      expect(entry.jsonSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      expect(entry.jsonSchema.required).toEqual(Object.keys(entry.jsonSchema.properties ?? {}));
    }
  });
});

describe("request/schema operation identity", () => {
  it("is represented in the generic request type", () => {
    type IntentRequest = ModelGatewayRequest<IntentDetectionV1, "intent_detection">;
    const request = {
      projectId: "project",
      projectStateVersion: 1,
      idempotencyKey: "idempotency",
      operation: "intent_detection",
      schema: modelOutputSchemaRegistry.intent_detection,
      systemInstruction: "Return the requested object.",
      input: "A bounded input.",
      reviewPolicy: "none",
    } satisfies IntentRequest;

    // @ts-expect-error A request cannot pair one operation with another operation's schema.
    const mismatched: IntentRequest = { ...request, operation: "risk_flags" };
    void mismatched;
    expect(request.schema.operation).toBe(request.operation);
  });
});
