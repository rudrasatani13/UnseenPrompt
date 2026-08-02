import { describe, expect, it } from "vitest";

import { PROVIDER_IDS, type ProviderAdapter } from "@/lib/model/provider";

describe("provider contracts", () => {
  it("keeps provider identifiers in the server infrastructure layer", () => {
    expect(PROVIDER_IDS).toEqual(["anthropic", "openai", "gemini"]);
  });

  it("accepts an untrusted candidate and requires the supplied signal", async () => {
    const adapter: ProviderAdapter = {
      providerId: "openai",
      async generate(request) {
        expect(request.signal).toBeInstanceOf(AbortSignal);
        return {
          value: { candidate: true },
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
          resolvedModel: request.model,
          requestId: null,
        };
      },
    };

    const result = await adapter.generate({
      model: "test-model",
      systemInstruction: "system",
      input: "input",
      outputSchema: { type: "object" },
      outputSchemaName: "test",
      maxOutputTokens: 32,
      correlationId: "00000000-0000-4000-8000-000000000000",
      signal: new AbortController().signal,
    });

    expect(result.value).toEqual({ candidate: true });
  });
});
