import { describe, expect, it, vi } from "vitest";

import { createGeminiAdapter } from "@/lib/model/providers/gemini";

const API_KEY = "AIza-test-secret-key";
const CORRELATION_ID = "550e8400-e29b-41d4-a716-446655440000";
const SYSTEM_INSTRUCTION = "system sentinel: do not disclose";
const INPUT = "user prompt sentinel";
const OUTPUT = "output sentinel";

const schema = {
  type: "object" as const,
  properties: {
    answer: { type: "string" as const },
  },
  required: ["answer"] as const,
  additionalProperties: false as const,
};

function request(
  overrides: Partial<Parameters<ReturnType<typeof createGeminiAdapter>["generate"]>[0]> = {},
) {
  return {
    model: "models/gemini/flash?unsafe=1",
    systemInstruction: SYSTEM_INSTRUCTION,
    input: INPUT,
    outputSchema: schema,
    outputSchemaName: "test.schema.v1",
    maxOutputTokens: 123,
    correlationId: CORRELATION_ID,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function successfulPayload(overrides: Record<string, unknown> = {}) {
  return {
    candidates: [
      {
        content: { parts: [{ text: JSON.stringify({ answer: "ok" }) }] },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 11,
      candidatesTokenCount: 7,
      totalTokenCount: 18,
    },
    modelVersion: "gemini-2.5-flash-001",
    responseId: "response-123",
    ...overrides,
  };
}

function response(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    headers === undefined ? { status } : { status, headers },
  );
}

function makeFetch(payload: unknown, status = 200, headers?: HeadersInit) {
  return vi.fn(async () => response(payload, status, headers)) as unknown as typeof fetch;
}

describe("Gemini generateContent adapter", () => {
  it("uses the fixed encoded endpoint, API-key header, exact signal, and generateContent body", async () => {
    const fetchImpl = makeFetch(successfulPayload());
    const adapter = createGeminiAdapter({ apiKey: API_KEY, fetch: fetchImpl });
    const signal = new AbortController().signal;
    const input = request({ model: "gemini/flash:v1?x=a b", signal });

    await expect(adapter.generate(input)).resolves.toMatchObject({
      value: JSON.stringify({ answer: "ok" }),
      resolvedModel: "gemini-2.5-flash-001",
      requestId: "response-123",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calls = (
      fetchImpl as unknown as { readonly mock: { readonly calls: Array<[string, RequestInit]> } }
    ).mock.calls;
    const [url, init] = calls[0]!;
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent("gemini/flash:v1?x=a b")}:generateContent`,
    );
    expect(url).not.toContain(API_KEY);
    expect(init.method).toBe("POST");
    expect(init.signal).toBe(signal);
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-goog-api-key": API_KEY,
    });

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: INPUT }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        maxOutputTokens: 123,
      },
    });
    expect(body).not.toHaveProperty("input");
    expect(body).not.toHaveProperty("model");
    expect(body).not.toHaveProperty("store");
    expect(body).not.toHaveProperty("previousInteraction");
  });

  it("normalizes reported usage and leaves malformed counts as null", async () => {
    const adapter = createGeminiAdapter({
      apiKey: API_KEY,
      fetch: makeFetch(
        successfulPayload({
          usageMetadata: {
            promptTokenCount: 12,
            candidatesTokenCount: Number.MAX_SAFE_INTEGER,
            totalTokenCount: -1,
          },
        }),
      ),
    });

    await expect(adapter.generate(request())).resolves.toMatchObject({
      usage: {
        inputTokens: 12,
        outputTokens: Number.MAX_SAFE_INTEGER,
        totalTokens: null,
      },
    });
  });

  it("bounds response IDs and ignores malformed model versions", async () => {
    const longResponseId = "x".repeat(1_024);
    const adapter = createGeminiAdapter({
      apiKey: API_KEY,
      fetch: makeFetch(
        successfulPayload({
          modelVersion: { unexpected: OUTPUT },
          responseId: longResponseId,
        }),
      ),
    });

    const result = await adapter.generate(request());
    expect(result.resolvedModel).toBe(request().model);
    expect(result.requestId).toHaveLength(256);
  });

  it.each([
    "SAFETY",
    "SPII",
    "IMAGE_SAFETY",
    "RECITATION",
    "LANGUAGE",
    "PROHIBITED_CONTENT",
    "BLOCKLIST",
  ])("maps refusal finish reason %s without exposing candidate text", async (finishReason) => {
    const fetchImpl = makeFetch({
      ...successfulPayload(),
      candidates: [
        {
          content: { parts: [{ text: JSON.stringify({ output: OUTPUT }) }] },
          finishReason,
        },
      ],
    });
    const adapter = createGeminiAdapter({ apiKey: API_KEY, fetch: fetchImpl });

    const result = adapter.generate(request());
    await expect(result).rejects.toMatchObject({ code: "content_refused" });
    await expect(result).rejects.toSatisfy((error: unknown) => {
      const serialized = JSON.stringify(error);
      return (
        !serialized.includes(API_KEY) && !serialized.includes(INPUT) && !serialized.includes(OUTPUT)
      );
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps a prompt block reason to content_refused before candidate handling", async () => {
    const adapter = createGeminiAdapter({
      apiKey: API_KEY,
      fetch: makeFetch({
        ...successfulPayload(),
        candidates: [],
        promptFeedback: { blockReason: "SAFETY" },
      }),
    });

    await expect(adapter.generate(request())).rejects.toMatchObject({ code: "content_refused" });
  });

  it("maps MAX_TOKENS to output_truncated and performs no repair or retry", async () => {
    const fetchImpl = makeFetch({
      ...successfulPayload(),
      candidates: [
        {
          content: { parts: [{ text: JSON.stringify({ answer: "partial" }) }] },
          finishReason: "MAX_TOKENS",
        },
      ],
    });
    const adapter = createGeminiAdapter({ apiKey: API_KEY, fetch: fetchImpl });

    await expect(adapter.generate(request())).rejects.toMatchObject({ code: "output_truncated" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    [],
    [successfulPayload().candidates?.[0], successfulPayload().candidates?.[0]],
  ])("rejects missing or multiple candidates as invalid_output", async (candidates) => {
    const adapter = createGeminiAdapter({
      apiKey: API_KEY,
      fetch: makeFetch({ ...successfulPayload(), candidates }),
    });

    await expect(adapter.generate(request())).rejects.toMatchObject({ code: "invalid_output" });
  });

  it.each([
    { parts: [] },
    { parts: [{ text: "{}" }, { text: "{}" }] },
    { parts: [{ inlineData: { mimeType: "text/plain", data: "hidden" } }] },
    undefined,
  ])("requires exactly one candidate text part", async (parts) => {
    const adapter = createGeminiAdapter({
      apiKey: API_KEY,
      fetch: makeFetch({
        ...successfulPayload(),
        candidates: [
          { content: parts === undefined ? undefined : { parts }, finishReason: "STOP" },
        ],
      }),
    });

    await expect(adapter.generate(request())).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("returns malformed candidate JSON unchanged for gateway-owned repair", async () => {
    const malformedCandidate = `{\"secret\":\"${OUTPUT}\"`;
    const adapter = createGeminiAdapter({
      apiKey: API_KEY,
      fetch: makeFetch({
        ...successfulPayload(),
        candidates: [
          {
            content: { parts: [{ text: malformedCandidate }] },
            finishReason: "STOP",
          },
        ],
      }),
    });

    await expect(adapter.generate(request())).resolves.toMatchObject({ value: malformedCandidate });
  });

  it("rejects malformed provider envelopes without exposing the body", async () => {
    const malformedBody = `not-json-${API_KEY}-${INPUT}`;
    const adapter = createGeminiAdapter({ apiKey: API_KEY, fetch: makeFetch(malformedBody) });

    const result = adapter.generate(request());
    await expect(result).rejects.toMatchObject({ code: "invalid_output" });
    await expect(result).rejects.toSatisfy(
      (error: unknown) => !JSON.stringify(error).includes(malformedBody),
    );
  });

  it.each([
    [400, "invalid_provider_request"],
    [401, "authentication_failed"],
    [403, "permission_denied"],
    [404, "model_not_found"],
    [402, "billing_or_quota_exhausted"],
    [500, "provider_unavailable"],
    [503, "provider_unavailable"],
    [418, "provider_error"],
  ] as const)("maps HTTP %s to %s without reading or exposing its body", async (status, code) => {
    const fetchImpl = makeFetch(`provider body secret ${API_KEY} ${INPUT} ${OUTPUT}`, status);
    const adapter = createGeminiAdapter({ apiKey: API_KEY, fetch: fetchImpl });

    const result = adapter.generate(request());
    await expect(result).rejects.toMatchObject({ code, httpStatus: status });
    await expect(result).rejects.toSatisfy((error: unknown) => {
      const serialized = JSON.stringify(error);
      return (
        !serialized.includes(API_KEY) && !serialized.includes(INPUT) && !serialized.includes(OUTPUT)
      );
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      body: {
        error: {
          status: "RESOURCE_EXHAUSTED",
          message: `quota exhausted ${API_KEY} ${INPUT}`,
        },
      },
      retryAfter: "1",
      expectedRetryAfterMs: 1_000,
    },
    {
      body: {
        error: {
          status: "RATE_LIMIT_EXCEEDED",
          message: `quota-looking message ${API_KEY}`,
        },
      },
      retryAfter: "99",
      expectedRetryAfterMs: 2_000,
    },
    {
      body: `malformed body ${API_KEY} ${INPUT}`,
      retryAfter: undefined,
      expectedRetryAfterMs: undefined,
    },
  ])(
    "maps every HTTP 429 body to rate_limited without reading or exposing it",
    async ({ body, retryAfter, expectedRetryAfterMs }) => {
      const providerResponse = new Response(
        typeof body === "string" ? body : JSON.stringify(body),
        {
          status: 429,
          ...(retryAfter === undefined ? {} : { headers: { "retry-after": retryAfter } }),
        },
      );
      const getReader = vi.spyOn(providerResponse.body!, "getReader");
      const fetchImpl = vi.fn(async () => providerResponse) as unknown as typeof fetch;
      const adapter = createGeminiAdapter({ apiKey: API_KEY, fetch: fetchImpl });

      const result = adapter.generate(request());
      await expect(result).rejects.toMatchObject({
        code: "rate_limited",
        httpStatus: 429,
        ...(expectedRetryAfterMs === undefined ? {} : { retryAfterMs: expectedRetryAfterMs }),
      });
      await expect(result).rejects.toSatisfy(
        (error: unknown) =>
          !JSON.stringify(error).includes(API_KEY) && !JSON.stringify(error).includes(INPUT),
      );
      expect(getReader).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("maps oversized successful responses to invalid_output without exposing body text", async () => {
    const fetchImpl = makeFetch("x", 200, { "content-length": String(1_048_577) });
    const adapter = createGeminiAdapter({ apiKey: API_KEY, fetch: fetchImpl });
    const result = adapter.generate(request());

    await expect(result).rejects.toMatchObject({ code: "invalid_output" });
    await expect(result).rejects.toSatisfy(
      (error: unknown) => !JSON.stringify(error).includes(API_KEY),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps network failures to stable errors and never leaks thrown messages", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError(`network ${API_KEY} ${SYSTEM_INSTRUCTION} ${INPUT}`);
    }) as unknown as typeof fetch;
    const adapter = createGeminiAdapter({ apiKey: API_KEY, fetch: fetchImpl });
    const result = adapter.generate(request());

    await expect(result).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(result).rejects.toSatisfy((error: unknown) => {
      const serialized = JSON.stringify(error);
      return (
        !serialized.includes(API_KEY) &&
        !serialized.includes(SYSTEM_INSTRUCTION) &&
        !serialized.includes(INPUT)
      );
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps abort failures to aborted and performs one fetch", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("secret abort body", "AbortError");
    }) as unknown as typeof fetch;
    const adapter = createGeminiAdapter({ apiKey: API_KEY, fetch: fetchImpl });
    const result = adapter.generate(request());

    await expect(result).rejects.toMatchObject({ code: "aborted" });
    await expect(result).rejects.toSatisfy(
      (error: unknown) => !JSON.stringify(error).includes("secret abort body"),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["   ", undefined, null, 123])(
    "fails closed on a non-string or blank API key before making a fetch (%s)",
    async (apiKey) => {
      const fetchImpl = vi.fn() as unknown as typeof fetch;
      const adapter = createGeminiAdapter({
        apiKey: apiKey as unknown as string,
        fetch: fetchImpl,
      });

      const result = adapter.generate(request());
      await expect(result).rejects.toMatchObject({ code: "configuration_error" });
      await expect(result).rejects.toSatisfy(
        (error: unknown) => !JSON.stringify(error).includes(API_KEY),
      );
      expect(fetchImpl).toHaveBeenCalledTimes(0);
    },
  );
});
