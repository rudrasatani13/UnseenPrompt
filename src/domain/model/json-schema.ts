import { z } from "zod";

/**
 * The deliberately small JSON Schema dialect shared by all Phase 5 providers. Keeping this type
 * in the domain prevents a provider adapter from smuggling provider-specific keywords into a
 * schema that is supposed to be common to every route.
 */
export type ProviderJsonSchema = {
  readonly type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  readonly properties?: Readonly<Record<string, ProviderJsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: false;
  readonly items?: ProviderJsonSchema;
  readonly enum?: readonly (string | number | boolean)[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
};

export interface JsonSchemaAudit {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

const ALLOWED_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
]);

const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "definitions",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "default",
  "description",
  "title",
  "examples",
  "additionalItems",
  "contains",
  "unevaluatedItems",
  "unevaluatedProperties",
  "propertyNames",
  "dependentRequired",
  "dependentSchemas",
  "dependencies",
  "const",
  "multipleOf",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quotePath(path: string, key: string): string {
  return path === "$" ? `$.${key}` : `${path}.${key}`;
}

function auditNode(value: unknown, path: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${path}: expected an object`);
    return;
  }

  for (const key of Object.keys(value)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) {
      issues.push(`${quotePath(path, key)}: unsupported keyword`);
    } else if (!ALLOWED_KEYWORDS.has(key)) {
      issues.push(`${quotePath(path, key)}: forbidden keyword`);
    }
  }

  if (value.type !== undefined) {
    const validTypes = new Set(["object", "array", "string", "number", "integer", "boolean"]);
    if (typeof value.type !== "string" || !validTypes.has(value.type)) {
      issues.push(`${path}.type: unsupported type`);
    }
  }

  if (value.type === "object") {
    if (!isRecord(value.properties)) {
      issues.push(`${path}.properties: object schemas require properties`);
    } else {
      for (const [property, propertySchema] of Object.entries(value.properties)) {
        auditNode(propertySchema, quotePath(`${path}.properties`, property), issues);
      }
    }

    if (value.additionalProperties !== false) {
      issues.push(`${path}.additionalProperties: must be false`);
    }

    if (
      !Array.isArray(value.required) ||
      value.required.some((entry) => typeof entry !== "string")
    ) {
      issues.push(`${path}.required: object schemas require a string list`);
    } else if (isRecord(value.properties)) {
      const propertyNames = Object.keys(value.properties);
      const required = value.required;
      if (
        required.length !== propertyNames.length ||
        propertyNames.some((name) => !required.includes(name))
      ) {
        issues.push(`${path}.required: every property must be required exactly once`);
      }
      if (new Set(required).size !== required.length) {
        issues.push(`${path}.required: duplicate property`);
      }
    }
  } else if (
    value.properties !== undefined ||
    value.required !== undefined ||
    value.additionalProperties !== undefined
  ) {
    issues.push(`${path}: object keywords require type object`);
  }

  if (value.type === "array") {
    if (!isRecord(value.items)) {
      issues.push(`${path}.items: array schemas require items`);
    } else {
      auditNode(value.items, `${path}.items`, issues);
    }
  } else if (
    value.items !== undefined ||
    value.minItems !== undefined ||
    value.maxItems !== undefined
  ) {
    issues.push(`${path}: array keywords require type array`);
  }

  if (value.enum !== undefined) {
    if (!Array.isArray(value.enum) || value.enum.length === 0) {
      issues.push(`${path}.enum: expected a non-empty list`);
    } else {
      if (value.enum.some((entry) => entry === null)) {
        issues.push(`${path}.enum: null values are not allowed`);
      }
      const unique = new Set(value.enum.map((entry) => JSON.stringify(entry)));
      if (unique.size !== value.enum.length) {
        issues.push(`${path}.enum: duplicate value`);
      }
    }
  }

  for (const key of ["minimum", "maximum", "minItems", "maxItems"] as const) {
    const candidate = value[key];
    if (candidate !== undefined && (typeof candidate !== "number" || !Number.isFinite(candidate))) {
      issues.push(`${path}.${key}: expected a finite number`);
    }
  }

  if (
    typeof value.minimum === "number" &&
    typeof value.maximum === "number" &&
    value.minimum > value.maximum
  ) {
    issues.push(`${path}: minimum must not exceed maximum`);
  }
  if (
    typeof value.minItems === "number" &&
    typeof value.maxItems === "number" &&
    value.minItems > value.maxItems
  ) {
    issues.push(`${path}: minItems must not exceed maxItems`);
  }
}

/** Audit a schema before handing it to an adapter. No provider-specific keyword is accepted. */
export function auditProviderJsonSchema(value: unknown): JsonSchemaAudit {
  const issues: string[] = [];
  auditNode(value, "$", issues);
  if (isRecord(value) && value.type !== "object") {
    issues.push("$: root schema must be an object");
  }
  return { valid: issues.length === 0, issues };
}

/** Alias with the common-dialect name used by domain callers and tests. */
export const auditCommonJsonSchema = auditProviderJsonSchema;

export function assertProviderJsonSchema(value: unknown): asserts value is ProviderJsonSchema {
  const result = auditProviderJsonSchema(value);
  if (!result.valid) {
    throw new Error(`invalid provider JSON Schema: ${result.issues.join("; ")}`);
  }
}

export const assertCommonJsonSchema = assertProviderJsonSchema;

function projectNode(value: unknown, path: string): ProviderJsonSchema {
  if (!isRecord(value)) {
    throw new Error(`${path}: Zod JSON Schema node must be an object`);
  }

  const type = value.type;
  if (typeof type !== "string") {
    throw new Error(`${path}.type: Zod JSON Schema node must have a type`);
  }

  const projected: Record<string, unknown> = { type };

  if (type === "object") {
    const sourceProperties = value.properties;
    if (!isRecord(sourceProperties)) {
      throw new Error(`${path}.properties: object schema must have properties`);
    }

    const properties: Record<string, ProviderJsonSchema> = {};
    for (const [property, propertySchema] of Object.entries(sourceProperties)) {
      properties[property] = projectNode(propertySchema, `${path}.properties.${property}`);
    }
    projected.properties = properties;

    const sourceRequired = value.required;
    if (
      !Array.isArray(sourceRequired) ||
      sourceRequired.some((entry) => typeof entry !== "string")
    ) {
      throw new Error(`${path}.required: object schema must have required properties`);
    }
    projected.required = [...sourceRequired];
    // The output schemas are all strict. Never infer a permissive object from a malformed Zod
    // object, and never preserve an adapter-specific catch-all.
    projected.additionalProperties = false;
  } else if (type === "array") {
    if (!isRecord(value.items)) {
      throw new Error(`${path}.items: array schema must have items`);
    }
    projected.items = projectNode(value.items, `${path}.items`);
    if (typeof value.minItems === "number") projected.minItems = value.minItems;
    if (typeof value.maxItems === "number") projected.maxItems = value.maxItems;
  } else if (value.minimum !== undefined) {
    projected.minimum = value.minimum;
  }

  if (value.maximum !== undefined) projected.maximum = value.maximum;
  if (Array.isArray(value.enum)) projected.enum = [...value.enum];

  return projected as ProviderJsonSchema;
}

/**
 * Project a Zod schema through Zod's stable JSON Schema exporter, then retain only the common
 * provider subset. String-length/format checks intentionally stay runtime-only; every structural
 * keyword is retained and the resulting object is audited before it leaves this module.
 */
export function projectToProviderJsonSchema(schema: z.ZodType<unknown>): ProviderJsonSchema {
  const raw = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" });
  const projected = projectNode(raw, "$");
  assertProviderJsonSchema(projected);
  return projected;
}

export const projectToCommonJsonSchema = projectToProviderJsonSchema;
export const toProviderJsonSchema = projectToProviderJsonSchema;
