import "server-only";

import type { ModelUsage } from "@/domain/model/contracts";
import type { ProviderRoute } from "@/lib/model/provider";

const MICROS_PER_MILLION_TOKENS = 1_000_000;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export interface ModelCostRates {
  readonly inputCostMicrosPerMillionTokens: number;
  readonly outputCostMicrosPerMillionTokens: number;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function safeProduct(left: number, right: number): number | null {
  if (!isSafeNonNegativeInteger(left) || !isSafeNonNegativeInteger(right)) return null;
  const result = left * right;
  return Number.isSafeInteger(result) ? result : null;
}

function asRates(value: ModelCostRates | ProviderRoute): ModelCostRates | null {
  const input = value.inputCostMicrosPerMillionTokens;
  const output = value.outputCostMicrosPerMillionTokens;
  if (!isSafeNonNegativeInteger(input) || !isSafeNonNegativeInteger(output)) return null;
  return { inputCostMicrosPerMillionTokens: input, outputCostMicrosPerMillionTokens: output };
}

/**
 * Estimate micros from provider-reported input/output tokens. Missing or unsafe values produce
 * `null`; token totals are never inferred from input/output because providers may report them
 * differently.
 */
export function estimateCostMicros(
  usage: ModelUsage | null | undefined,
  rates: ModelCostRates | ProviderRoute | null | undefined,
): number | null {
  if (usage === null || usage === undefined || rates === null || rates === undefined) return null;
  if (!isSafeNonNegativeInteger(usage.inputTokens)) return null;
  if (!isSafeNonNegativeInteger(usage.outputTokens)) return null;

  const safeRates = asRates(rates);
  if (safeRates === null) return null;

  const inputNumerator = safeProduct(usage.inputTokens, safeRates.inputCostMicrosPerMillionTokens);
  const outputNumerator = safeProduct(
    usage.outputTokens,
    safeRates.outputCostMicrosPerMillionTokens,
  );
  if (inputNumerator === null || outputNumerator === null) return null;

  const numerator = inputNumerator + outputNumerator;
  if (!Number.isSafeInteger(numerator) || numerator < 0) return null;
  const cost = Math.ceil(numerator / MICROS_PER_MILLION_TOKENS);
  return Number.isSafeInteger(cost) && cost >= 0 && cost <= MAX_SAFE ? cost : null;
}

/** Aggregate a list of reported usage records without guessing missing provider fields. */
export function aggregateUsage(usages: readonly ModelUsage[]): ModelUsage {
  if (usages.length === 0) {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }

  const fields = ["inputTokens", "outputTokens", "totalTokens"] as const;
  const aggregate = {} as Record<(typeof fields)[number], number | null>;

  for (const field of fields) {
    let sum = 0;
    let available = true;
    for (const usage of usages) {
      const value = usage[field];
      if (!isSafeNonNegativeInteger(value)) {
        available = false;
        break;
      }
      sum += value;
      if (!Number.isSafeInteger(sum) || sum > MAX_SAFE) {
        available = false;
        break;
      }
    }
    aggregate[field] = available ? sum : null;
  }

  return aggregate;
}

/** Sum per-call cost estimates; a missing estimate invalidates the aggregate. */
export function aggregateEstimatedCostMicros(costs: readonly (number | null)[]): number | null {
  let sum = 0;
  for (const cost of costs) {
    if (!isSafeNonNegativeInteger(cost)) return null;
    sum += cost;
    if (!Number.isSafeInteger(sum) || sum > MAX_SAFE) return null;
  }
  return sum;
}
