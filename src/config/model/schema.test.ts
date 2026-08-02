import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MODEL_ATTEMPT_TIMEOUT_DEFAULT_MS,
  MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX,
  MODEL_EXECUTION_BUDGETS,
  MODEL_MAX_OUTPUT_TOKENS_DEFAULT,
  MODEL_MAX_OUTPUT_TOKENS_MAX,
  MODEL_MAX_OUTPUT_TOKENS_MIN,
  MODEL_TOTAL_DEADLINE_DEFAULT_MS,
  parseModelEnvironment,
} from "@/config/model/schema";

const baseEnvironment = {
  ANTHROPIC_API_KEY: "sk-ant-test-key",
  OPENAI_API_KEY: "sk-openai-test-key",
  MODEL_PRIMARY_PROVIDER: "anthropic",
  MODEL_PRIMARY_MODEL: "claude-test-1",
  MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS: "3000000",
  MODEL_PRIMARY_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: "15000000",
  MODEL_FALLBACK_PROVIDER: "openai",
  MODEL_FALLBACK_MODEL: "gpt-test-1",
  MODEL_FALLBACK_INPUT_COST_MICROS_PER_MILLION_TOKENS: "5000000",
  MODEL_FALLBACK_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: "15000000",
} as const;

describe("parseModelEnvironment", () => {
  it("parses primary and fallback routes with locked defaults", () => {
    const environment = parseModelEnvironment(baseEnvironment);

    expect(environment.primary).toEqual({
      provider: "anthropic",
      model: "claude-test-1",
      inputCostMicrosPerMillionTokens: 3_000_000,
      outputCostMicrosPerMillionTokens: 15_000_000,
    });
    expect(environment.fallback.provider).toBe("openai");
    expect(environment.reviewer).toBeNull();
    expect(environment.totalDeadlineMs).toBe(MODEL_TOTAL_DEADLINE_DEFAULT_MS);
    expect(environment.attemptTimeoutMs).toBe(MODEL_ATTEMPT_TIMEOUT_DEFAULT_MS);
    expect(environment.maxOutputTokens).toBe(MODEL_MAX_OUTPUT_TOKENS_DEFAULT);
    expect(environment.apiKeys).toEqual({
      anthropic: "sk-ant-test-key",
      openai: "sk-openai-test-key",
    });
    expect(environment.budgets).toBe(MODEL_EXECUTION_BUDGETS);
    expect(Object.isFrozen(environment.budgets)).toBe(true);
  });

  it("allows an unused provider key without requiring its route", () => {
    const environment = parseModelEnvironment({
      ...baseEnvironment,
      GEMINI_API_KEY: "AIza-unused-test-key",
    });

    expect(environment.apiKeys.gemini).toBe("AIza-unused-test-key");
  });

  it("requires a key for every referenced provider and never echoes a secret", () => {
    const rejectedSecret = "sk-ant-rejected-secret-value-123456789";

    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        ANTHROPIC_API_KEY: rejectedSecret,
        OPENAI_API_KEY: undefined,
      }),
    ).toThrow(/OPENAI_API_KEY/);

    let thrown: unknown;
    try {
      parseModelEnvironment({
        ...baseEnvironment,
        ANTHROPIC_API_KEY: rejectedSecret.repeat(30),
      });
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain(rejectedSecret);
  });

  it("requires reviewer provider, model, and both cost rates as one group", () => {
    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        MODEL_REVIEWER_PROVIDER: "gemini",
        MODEL_REVIEWER_MODEL: "gemini-test-1",
        GEMINI_API_KEY: "AIza-reviewer-test-key",
      }),
    ).toThrow(/MODEL_REVIEWER_INPUT_COST_MICROS_PER_MILLION_TOKENS/);

    const environment = parseModelEnvironment({
      ...baseEnvironment,
      MODEL_REVIEWER_PROVIDER: "gemini",
      MODEL_REVIEWER_MODEL: "gemini-test-1",
      MODEL_REVIEWER_INPUT_COST_MICROS_PER_MILLION_TOKENS: "1000000",
      MODEL_REVIEWER_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: "2000000",
      GEMINI_API_KEY: "AIza-reviewer-test-key",
    });

    expect(environment.reviewer).toEqual({
      provider: "gemini",
      model: "gemini-test-1",
      inputCostMicrosPerMillionTokens: 1_000_000,
      outputCostMicrosPerMillionTokens: 2_000_000,
    });
  });

  it("rejects a fallback that uses the primary provider", () => {
    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        MODEL_FALLBACK_PROVIDER: "anthropic",
      }),
    ).toThrow(/fallback provider must differ/);
  });

  it("enforces bounded identifiers, safe rates, deadlines, and output limits", () => {
    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        MODEL_PRIMARY_MODEL: "bad model",
      }),
    ).toThrow(/MODEL_PRIMARY_MODEL/);

    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS: "-1",
      }),
    ).toThrow(/MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS/);

    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS: String(
          MODEL_COST_MICROS_PER_MILLION_TOKENS_MAX + 1,
        ),
      }),
    ).toThrow(/MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS/);

    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        MODEL_TOTAL_DEADLINE_MS: "999",
      }),
    ).toThrow(/MODEL_TOTAL_DEADLINE_MS/);

    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        MODEL_ATTEMPT_TIMEOUT_MS: "2000",
        MODEL_TOTAL_DEADLINE_MS: "1000",
      }),
    ).toThrow(/attempt timeout must not exceed/);

    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        MODEL_MAX_OUTPUT_TOKENS: String(MODEL_MAX_OUTPUT_TOKENS_MIN - 1),
      }),
    ).toThrow(/MODEL_MAX_OUTPUT_TOKENS/);

    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        MODEL_MAX_OUTPUT_TOKENS: String(MODEL_MAX_OUTPUT_TOKENS_MAX + 1),
      }),
    ).toThrow(/MODEL_MAX_OUTPUT_TOKENS/);
  });

  it("rejects unknown budget overrides", () => {
    expect(() =>
      parseModelEnvironment({
        ...baseEnvironment,
        MODEL_MAX_REPAIRS: "99",
      }),
    ).toThrow(/Unrecognized key/);
  });
});

describe("server-only model accessor boundary", () => {
  it("marks the accessor module server-only", () => {
    const source = readFileSync("src/config/model/server.ts", "utf8");
    expect(source).toContain('import "server-only"');
  });
});
