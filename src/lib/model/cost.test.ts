import { describe, expect, it } from "vitest";

import { aggregateEstimatedCostMicros, aggregateUsage, estimateCostMicros } from "@/lib/model/cost";

const rates = {
  inputCostMicrosPerMillionTokens: 2_000_000,
  outputCostMicrosPerMillionTokens: 4_000_000,
};

describe("safe model cost aggregation", () => {
  it("uses ceiling micros-per-million arithmetic", () => {
    expect(estimateCostMicros({ inputTokens: 3, outputTokens: 2, totalTokens: null }, rates)).toBe(
      14,
    );
  });

  it("returns null for missing fields and numeric overflow", () => {
    expect(estimateCostMicros({ inputTokens: null, outputTokens: 2, totalTokens: 2 }, rates)).toBe(
      null,
    );
    expect(
      estimateCostMicros(
        { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1, totalTokens: null },
        rates,
      ),
    ).toBe(null);
    expect(aggregateEstimatedCostMicros([1, null, 2])).toBe(null);
  });

  it("aggregates reported usage without deriving missing totals", () => {
    expect(
      aggregateUsage([
        { inputTokens: 2, outputTokens: 3, totalTokens: null },
        { inputTokens: 4, outputTokens: 5, totalTokens: 9 },
      ]),
    ).toEqual({ inputTokens: 6, outputTokens: 8, totalTokens: null });
  });
});
