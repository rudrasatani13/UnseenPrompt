import { z } from "zod";

/** Providers supported by the Phase 5 provider-neutral gateway. */
export const MODEL_PROVIDERS = ["anthropic", "openai", "gemini", "opencode"] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export const MODEL_IDENTIFIER_MAX_LENGTH = 160;
export const MODEL_SECRET_MAX_LENGTH = 512;

export const MODEL_TOTAL_DEADLINE_DEFAULT_MS = 30_000;
export const MODEL_TOTAL_DEADLINE_MIN_MS = 1_000;
export const MODEL_TOTAL_DEADLINE_MAX_MS = 120_000;

export const MODEL_ATTEMPT_TIMEOUT_DEFAULT_MS = 12_000;
export const MODEL_ATTEMPT_TIMEOUT_MIN_MS = 500;
export const MODEL_ATTEMPT_TIMEOUT_MAX_MS = 60_000;

export const MODEL_MAX_OUTPUT_TOKENS_DEFAULT = 4_096;
export const MODEL_MAX_OUTPUT_TOKENS_MIN = 64;
export const MODEL_MAX_OUTPUT_TOKENS_MAX = 65_536;

/**
 * Rates are integer micros per million reported tokens. The cap is deliberately generous for
 * operator configuration while keeping token-rate multiplication within a practical safe range.
 */
export const MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX = 1_000_000_000_000;

/**
 * These limits are execution invariants, not configuration. Keeping them in a frozen value makes
 * it impossible for a caller to multiply retries, repairs, or fallback calls through environment
 * input.
 */
export const MODEL_EXECUTION_BUDGETS = Object.freeze({
  productionCalls: 3,
  transportRetries: 1,
  repairs: 1,
  fallbackEntries: 1,
  reviewerCalls: 1,
  absoluteCalls: 4,
} as const);

export type ModelExecutionBudgets = typeof MODEL_EXECUTION_BUDGETS;

export interface ModelRoute {
  readonly provider: ModelProvider;
  readonly model: string;
  readonly inputCostMicrosPerMillionTokens: number;
  readonly outputCostMicrosPerMillionTokens: number;
}

export type ModelApiKeys = Readonly<Partial<Record<ModelProvider, string>>>;

export interface ModelEnvironment {
  readonly apiKeys: ModelApiKeys;
  readonly primary: ModelRoute;
  readonly fallback: ModelRoute;
  readonly reviewer: ModelRoute | null;
  readonly totalDeadlineMs: number;
  readonly attemptTimeoutMs: number;
  readonly maxOutputTokens: number;
  readonly budgets: ModelExecutionBudgets;
}

/**
 * Environment values are strings in Next.js and Wrangler. A broad record is intentional: the
 * parser remains strict at runtime and rejects unknown model settings, including attempts to
 * override locked execution budgets.
 */
export type ModelEnvironmentInput = Readonly<Record<string, string | undefined>>;

type ModelProviderKeyName =
  "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GEMINI_API_KEY" | "OPENCODE_API_KEY";

const modelProviderSchema = z.enum(MODEL_PROVIDERS);
const modelIdentifierSchema = z
  .string()
  .min(1, "model identifier is required")
  .max(MODEL_IDENTIFIER_MAX_LENGTH, "model identifier is too long")
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, "model identifier contains unsupported characters");

const providerSecretSchema = z
  .string()
  .min(1, "provider API key is required")
  .max(MODEL_SECRET_MAX_LENGTH, "provider API key is too long")
  .refine((value) => value.trim() === value && !/[\r\n]/.test(value), {
    message: "provider API key contains unsupported whitespace",
  });

function integerEnvironmentSchema(options: {
  readonly minimum: number;
  readonly maximum: number;
  readonly defaultValue?: number;
}) {
  const numberSchema = z
    .number()
    .int("must be an integer")
    .safe("must be a safe integer")
    .min(options.minimum, `must be at least ${options.minimum}`)
    .max(options.maximum, `must be at most ${options.maximum}`);

  return z.preprocess((value) => {
    if (value === undefined && options.defaultValue !== undefined) {
      return options.defaultValue;
    }

    if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
      return Number.NaN;
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
  }, numberSchema);
}

const modelEnvironmentSchema = z
  .object({
    ANTHROPIC_API_KEY: providerSecretSchema.optional(),
    OPENAI_API_KEY: providerSecretSchema.optional(),
    GEMINI_API_KEY: providerSecretSchema.optional(),
    OPENCODE_API_KEY: providerSecretSchema.optional(),

    MODEL_PRIMARY_PROVIDER: modelProviderSchema,
    MODEL_PRIMARY_MODEL: modelIdentifierSchema,
    MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS: integerEnvironmentSchema({
      minimum: 0,
      maximum: MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX,
    }),
    MODEL_PRIMARY_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: integerEnvironmentSchema({
      minimum: 0,
      maximum: MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX,
    }),

    MODEL_FALLBACK_PROVIDER: modelProviderSchema,
    MODEL_FALLBACK_MODEL: modelIdentifierSchema,
    MODEL_FALLBACK_INPUT_COST_MICROS_PER_MILLION_TOKENS: integerEnvironmentSchema({
      minimum: 0,
      maximum: MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX,
    }),
    MODEL_FALLBACK_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: integerEnvironmentSchema({
      minimum: 0,
      maximum: MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX,
    }),

    MODEL_REVIEWER_PROVIDER: modelProviderSchema.optional(),
    MODEL_REVIEWER_MODEL: modelIdentifierSchema.optional(),
    MODEL_REVIEWER_INPUT_COST_MICROS_PER_MILLION_TOKENS: integerEnvironmentSchema({
      minimum: 0,
      maximum: MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX,
    }).optional(),
    MODEL_REVIEWER_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: integerEnvironmentSchema({
      minimum: 0,
      maximum: MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX,
    }).optional(),

    MODEL_TOTAL_DEADLINE_MS: integerEnvironmentSchema({
      minimum: MODEL_TOTAL_DEADLINE_MIN_MS,
      maximum: MODEL_TOTAL_DEADLINE_MAX_MS,
      defaultValue: MODEL_TOTAL_DEADLINE_DEFAULT_MS,
    }),
    MODEL_ATTEMPT_TIMEOUT_MS: integerEnvironmentSchema({
      minimum: MODEL_ATTEMPT_TIMEOUT_MIN_MS,
      maximum: MODEL_ATTEMPT_TIMEOUT_MAX_MS,
      defaultValue: MODEL_ATTEMPT_TIMEOUT_DEFAULT_MS,
    }),
    MODEL_MAX_OUTPUT_TOKENS: integerEnvironmentSchema({
      minimum: MODEL_MAX_OUTPUT_TOKENS_MIN,
      maximum: MODEL_MAX_OUTPUT_TOKENS_MAX,
      defaultValue: MODEL_MAX_OUTPUT_TOKENS_DEFAULT,
    }),
  })
  .strict()
  .superRefine((values, context) => {
    if (values.MODEL_PRIMARY_PROVIDER === values.MODEL_FALLBACK_PROVIDER) {
      context.addIssue({
        code: "custom",
        path: ["MODEL_FALLBACK_PROVIDER"],
        message: "fallback provider must differ from primary provider",
      });
    }

    if (values.MODEL_ATTEMPT_TIMEOUT_MS > values.MODEL_TOTAL_DEADLINE_MS) {
      context.addIssue({
        code: "custom",
        path: ["MODEL_ATTEMPT_TIMEOUT_MS"],
        message: "attempt timeout must not exceed total deadline",
      });
    }

    const reviewerFields = [
      "MODEL_REVIEWER_PROVIDER",
      "MODEL_REVIEWER_MODEL",
      "MODEL_REVIEWER_INPUT_COST_MICROS_PER_MILLION_TOKENS",
      "MODEL_REVIEWER_OUTPUT_COST_MICROS_PER_MILLION_TOKENS",
    ] as const;
    const reviewerConfigured = reviewerFields.some((field) => values[field] !== undefined);

    if (reviewerConfigured) {
      for (const field of reviewerFields) {
        if (values[field] === undefined) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: "all reviewer route fields are required together",
          });
        }
      }
    }

    const providerKeyNames: Record<ModelProvider, ModelProviderKeyName> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      gemini: "GEMINI_API_KEY",
      opencode: "OPENCODE_API_KEY",
    };
    const referencedProviders = new Set<ModelProvider>([
      values.MODEL_PRIMARY_PROVIDER,
      values.MODEL_FALLBACK_PROVIDER,
    ]);

    if (values.MODEL_REVIEWER_PROVIDER !== undefined) {
      referencedProviders.add(values.MODEL_REVIEWER_PROVIDER);
    }

    for (const provider of referencedProviders) {
      const keyName = providerKeyNames[provider];
      if (values[keyName] === undefined) {
        context.addIssue({
          code: "custom",
          path: [keyName],
          message: `${keyName} is required for the configured ${provider} route`,
        });
      }
    }
  });

const providerKeyNames: Record<ModelProvider, ModelProviderKeyName> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  opencode: "OPENCODE_API_KEY",
};

function isProviderSecretPath(path: readonly PropertyKey[]): boolean {
  const field = path[0];
  return (
    field === "ANTHROPIC_API_KEY" ||
    field === "OPENAI_API_KEY" ||
    field === "GEMINI_API_KEY" ||
    field === "OPENCODE_API_KEY"
  );
}

/**
 * Parses model gateway configuration without echoing rejected credentials. The schema is strict:
 * unknown settings are errors, so callers cannot supply environment overrides for execution
 * budgets or other unreviewed knobs.
 */
export function parseModelEnvironment(values: ModelEnvironmentInput): ModelEnvironment {
  const result = modelEnvironmentSchema.safeParse(values);

  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const path = issue.path.join(".") || "model";
      const message = isProviderSecretPath(issue.path) ? "invalid provider API key" : issue.message;
      return `${path}: ${message}`;
    });
    throw new Error(`Invalid model environment: ${messages.join("; ")}`);
  }

  const parsed = result.data;
  const apiKeys: Partial<Record<ModelProvider, string>> = {};

  for (const provider of MODEL_PROVIDERS) {
    const key = parsed[providerKeyNames[provider]];
    if (key !== undefined) {
      apiKeys[provider] = key;
    }
  }

  const routeFrom = (
    provider: ModelProvider,
    model: string,
    inputCostMicrosPerMillionTokens: number,
    outputCostMicrosPerMillionTokens: number,
  ): ModelRoute =>
    Object.freeze({
      provider,
      model,
      inputCostMicrosPerMillionTokens,
      outputCostMicrosPerMillionTokens,
    });

  const primary = routeFrom(
    parsed.MODEL_PRIMARY_PROVIDER,
    parsed.MODEL_PRIMARY_MODEL,
    parsed.MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    parsed.MODEL_PRIMARY_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
  );
  const fallback = routeFrom(
    parsed.MODEL_FALLBACK_PROVIDER,
    parsed.MODEL_FALLBACK_MODEL,
    parsed.MODEL_FALLBACK_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    parsed.MODEL_FALLBACK_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
  );
  const reviewer =
    parsed.MODEL_REVIEWER_PROVIDER === undefined ||
    parsed.MODEL_REVIEWER_MODEL === undefined ||
    parsed.MODEL_REVIEWER_INPUT_COST_MICROS_PER_MILLION_TOKENS === undefined ||
    parsed.MODEL_REVIEWER_OUTPUT_COST_MICROS_PER_MILLION_TOKENS === undefined
      ? null
      : routeFrom(
          parsed.MODEL_REVIEWER_PROVIDER,
          parsed.MODEL_REVIEWER_MODEL,
          parsed.MODEL_REVIEWER_INPUT_COST_MICROS_PER_MILLION_TOKENS,
          parsed.MODEL_REVIEWER_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
        );

  return Object.freeze({
    apiKeys: Object.freeze(apiKeys),
    primary,
    fallback,
    reviewer,
    totalDeadlineMs: parsed.MODEL_TOTAL_DEADLINE_MS,
    attemptTimeoutMs: parsed.MODEL_ATTEMPT_TIMEOUT_MS,
    maxOutputTokens: parsed.MODEL_MAX_OUTPUT_TOKENS,
    budgets: MODEL_EXECUTION_BUDGETS,
  });
}
