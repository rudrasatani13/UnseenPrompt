import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  assertProviderJsonSchema,
  auditCommonJsonSchema,
  auditProviderJsonSchema,
  projectToCommonJsonSchema,
  projectToProviderJsonSchema,
} from "@/domain/model/json-schema";
import { modelOutputSchemaRegistry } from "@/domain/model/schemas";

describe("common provider JSON Schema projection", () => {
  const runtimeSchema = z.strictObject({
    title: z.string().trim().min(1).max(32),
    state: z.enum(["ready", "blocked"]),
    score: z.number().finite().min(0).max(1),
    labels: z.array(z.string().trim().min(1).max(32)).max(4),
    nested: z.strictObject({ enabled: z.boolean() }),
  });

  it("keeps structure, enums, bounds, required fields, and closed objects", () => {
    const projected = projectToProviderJsonSchema(runtimeSchema);
    expect(projected).toEqual({
      type: "object",
      properties: {
        title: { type: "string" },
        state: { type: "string", enum: ["ready", "blocked"] },
        score: { type: "number", minimum: 0, maximum: 1 },
        labels: { type: "array", items: { type: "string" }, maxItems: 4 },
        nested: {
          type: "object",
          properties: { enabled: { type: "boolean" } },
          required: ["enabled"],
          additionalProperties: false,
        },
      },
      required: ["title", "state", "score", "labels", "nested"],
      additionalProperties: false,
    });
  });

  it("is deterministic and strips validation-only string keywords", () => {
    const first = projectToCommonJsonSchema(runtimeSchema);
    const second = projectToCommonJsonSchema(runtimeSchema);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(first)).not.toContain("minLength");
    expect(JSON.stringify(first)).not.toContain("maxLength");
    expect(JSON.stringify(first)).not.toContain("$schema");
  });

  it("audits every registered schema", () => {
    for (const entry of Object.values(modelOutputSchemaRegistry)) {
      expect(auditProviderJsonSchema(entry.jsonSchema)).toEqual({ valid: true, issues: [] });
      expect(auditCommonJsonSchema(entry.jsonSchema).valid).toBe(true);
    }
  });
});

describe("common provider JSON Schema auditor", () => {
  const invalidSchemas: ReadonlyArray<readonly [unknown, string]> = [
    [{ type: "string" }, "root schema"],
    [{ type: "null" }, "forbidden nullable root"],
    [{ type: "object", properties: {}, required: [], additionalProperties: true }, "open object"],
    [
      {
        type: "object",
        properties: { value: { type: "string", minLength: 1 } },
        required: ["value"],
        additionalProperties: false,
      },
      "unsupported keyword",
    ],
    [
      {
        type: "object",
        properties: { value: { type: "string" } },
        required: [],
        additionalProperties: false,
      },
      "incomplete required list",
    ],
    [
      {
        type: "object",
        properties: { value: { type: "array", items: { type: "string" }, oneOf: [] } },
        required: ["value"],
        additionalProperties: false,
      },
      "shape-changing keyword",
    ],
  ];

  it.each(invalidSchemas)("rejects %s", (candidate) => {
    const audit = auditProviderJsonSchema(candidate);
    expect(audit.valid).toBe(false);
    expect(audit.issues.length).toBeGreaterThan(0);
  });

  it("rejects invalid structural bounds and duplicate enum values", () => {
    expect(
      auditProviderJsonSchema({
        type: "object",
        properties: {
          value: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 1 },
        },
        required: ["value"],
        additionalProperties: false,
      }).valid,
    ).toBe(false);
    expect(
      auditProviderJsonSchema({
        type: "object",
        properties: { value: { type: "string", enum: ["same", "same"] } },
        required: ["value"],
        additionalProperties: false,
      }).valid,
    ).toBe(false);
  });

  it("throws a safe error when asserting an invalid schema", () => {
    expect(() => assertProviderJsonSchema({ type: "object", properties: {} })).toThrow(
      /invalid provider JSON Schema/,
    );
  });
});
