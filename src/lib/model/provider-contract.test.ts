import { describe, expect, it } from "vitest";

import { getModelOutputSchema, MODEL_OUTPUT_SCHEMA_REGISTRY } from "@/domain/model/schemas";
import {
  ANTHROPIC_MESSAGES_ENDPOINT,
  ANTHROPIC_VERSION,
  createAnthropicAdapter,
} from "@/lib/model/providers/anthropic";
import { createGeminiAdapter } from "@/lib/model/providers/gemini";
import { createOpenAIAdapter } from "@/lib/model/providers/openai";
import { MAX_RESPONSE_BYTES } from "@/lib/model/http";
import { isModelGatewayError } from "@/lib/model/errors";
import type { ProviderAdapter, ProviderAdapterRequest, ProviderFetch } from "@/lib/model/provider";

const apiKey = "provider-key-contract-sentinel";
const systemInstruction = "contract-system-sentinel";
const input = "contract-input-sentinel";
const intentSchema = getModelOutputSchema("intent_detection");
const candidate = JSON.stringify({
  mode: "feature",
  confidence: 0.9,
  rationale: "The request describes a feature change.",
  detectedLanguage: "en",
});
const correlationId = "11111111-1111-4111-8111-111111111111";
const model = "contract-model-v1";
const outputSchema = intentSchema.jsonSchema;
const outputSchemaName = `${intentSchema.operation}_v${intentSchema.version}`;
const PROVIDER_SCHEMA_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const request: ProviderAdapterRequest = {
  model,
  systemInstruction,
  input,
  outputSchema,
  outputSchemaName,
  maxOutputTokens: 321,
  correlationId,
  signal: new AbortController().signal,
};

interface ProviderHarness {
  readonly name: string;
  readonly expectedMalformedCode: "invalid_output" | "provider_error";
  readonly expectedOversizedCode: "invalid_output" | "provider_error";
  readonly expectedUsage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number | null;
  };
  readonly expectedRequestId: string | null;
  readonly apiKeyHeader: string;
  readonly create: (fetch: ProviderFetch) => ProviderAdapter;
  readonly success: () => Response;
  readonly endpoint: string;
  readonly assertRequest: (body: Record<string, unknown>) => void;
}

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const harnesses: readonly ProviderHarness[] = [
  {
    name: "anthropic",
    expectedMalformedCode: "invalid_output",
    expectedOversizedCode: "invalid_output",
    expectedUsage: { inputTokens: 11, outputTokens: 7, totalTokens: null },
    expectedRequestId: null,
    apiKeyHeader: "x-api-key",
    create: (fetch) => createAnthropicAdapter({ apiKey, fetch }),
    success: () =>
      jsonResponse({
        type: "message",
        model: "claude-contract-resolved",
        content: [{ type: "text", text: candidate }],
        stop_reason: "end_turn",
        usage: { input_tokens: 11, output_tokens: 7 },
      }),
    endpoint: ANTHROPIC_MESSAGES_ENDPOINT,
    assertRequest(body) {
      expect(body.model).toBe(model);
      expect(body.max_tokens).toBe(request.maxOutputTokens);
      expect(body.system).toBe(systemInstruction);
      expect(body.messages).toEqual([{ role: "user", content: input }]);
      expect(body.output_config).toEqual({
        format: { type: "json_schema", schema: outputSchema },
      });
    },
  },
  {
    name: "openai",
    expectedMalformedCode: "provider_error",
    expectedOversizedCode: "provider_error",
    expectedUsage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    expectedRequestId: "openai-contract-request",
    apiKeyHeader: "authorization",
    create: (fetch) => createOpenAIAdapter({ apiKey, fetch }),
    success: () =>
      jsonResponse(
        {
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: candidate }],
            },
          ],
          usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
          model: "gpt-contract-resolved",
        },
        200,
        { "x-request-id": "openai-contract-request" },
      ),
    endpoint: "https://api.openai.com/v1/responses",
    assertRequest(body) {
      expect(body.model).toBe(model);
      expect(body.instructions).toBe(systemInstruction);
      expect(body.input).toBe(input);
      expect(body.max_output_tokens).toBe(request.maxOutputTokens);
      expect(body.store).toBe(false);
      expect(body.text).toEqual({
        format: {
          type: "json_schema",
          name: outputSchemaName,
          schema: outputSchema,
          strict: true,
        },
      });
    },
  },
  {
    name: "gemini",
    expectedMalformedCode: "invalid_output",
    expectedOversizedCode: "invalid_output",
    expectedUsage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    expectedRequestId: "gemini-contract-request",
    apiKeyHeader: "x-goog-api-key",
    create: (fetch) => createGeminiAdapter({ apiKey, fetch }),
    success: () =>
      jsonResponse(
        {
          candidates: [
            {
              content: { parts: [{ text: candidate }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: {
            promptTokenCount: 11,
            candidatesTokenCount: 7,
            totalTokenCount: 18,
          },
          modelVersion: "gemini-contract-resolved",
          responseId: "gemini-contract-request",
        },
        200,
      ),
    endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    assertRequest(body) {
      expect(body.systemInstruction).toEqual({ parts: [{ text: systemInstruction }] });
      expect(body.contents).toEqual([{ role: "user", parts: [{ text: input }] }]);
      expect(body.generationConfig).toEqual({
        responseMimeType: "application/json",
        responseJsonSchema: outputSchema,
        maxOutputTokens: request.maxOutputTokens,
      });
    },
  },
];

function errorCode(value: unknown): string {
  expect(isModelGatewayError(value)).toBe(true);
  return (value as { readonly code: string }).code;
}

describe.each(harnesses)("shared provider adapter contract: $name", (harness) => {
  it("returns the common candidate/usage metadata and forwards one exact AbortSignal", async () => {
    let seenUrl: string | URL | Request | undefined;
    let seenInit: RequestInit | undefined;
    let calls = 0;
    const signal = new AbortController().signal;
    const fetch: ProviderFetch = async (url, init) => {
      calls += 1;
      seenUrl = url;
      seenInit = init;
      return harness.success();
    };

    const result = await harness.create(fetch).generate({ ...request, signal });

    expect(calls).toBe(1);
    expect(seenUrl).toBe(harness.endpoint);
    expect(seenInit?.method).toBe("POST");
    expect(seenInit?.signal).toBe(signal);
    const headers = new Headers(seenInit?.headers);
    expect(headers.get("content-type")?.toLowerCase()).toBe("application/json");
    expect(headers.get(harness.apiKeyHeader)).toContain(apiKey);
    const body = JSON.parse(String(seenInit?.body)) as Record<string, unknown>;
    harness.assertRequest(body);
    expect(JSON.stringify(body)).not.toContain("owner_id");
    expect(JSON.stringify(body)).not.toContain("request headers");
    expect(result.value).toBe(candidate);
    expect(typeof result.value).toBe("string");
    const parsedCandidate = JSON.parse(result.value as string) as unknown;
    expect(intentSchema.schema.safeParse(parsedCandidate).success).toBe(true);
    expect(result.usage).toEqual(harness.expectedUsage);
    expect(result.resolvedModel).toEqual(expect.any(String));
    expect(result.requestId).toBe(harness.expectedRequestId);
  });

  it("maps malformed envelopes to a stable redacted error", async () => {
    const rawBody = `RAW_PROVIDER_BODY_SECRET_${harness.name}_${apiKey}_${input}`;
    const fetch: ProviderFetch = async () => new Response(`{${rawBody}`, { status: 200 });

    try {
      await harness.create(fetch).generate(request);
      expect.unreachable("expected malformed envelope error");
    } catch (error: unknown) {
      expect(errorCode(error)).toBe(harness.expectedMalformedCode);
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(rawBody);
      expect(serialized).not.toContain(apiKey);
      expect(serialized).not.toContain(systemInstruction);
      expect(serialized).not.toContain(input);
    }
  });

  it("maps bounded-response failure to a stable redacted error", async () => {
    const secret = `OVERSIZED_PROVIDER_BODY_${harness.name}_${apiKey}`;
    const fetch: ProviderFetch = async () =>
      new Response(secret, {
        status: 200,
        headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
      });

    try {
      await harness.create(fetch).generate(request);
      expect.unreachable("expected oversized response error");
    } catch (error: unknown) {
      expect(errorCode(error)).toBe(harness.expectedOversizedCode);
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain(apiKey);
      expect(serialized).not.toContain(input);
    }
  });

  it("keeps fixed endpoints independent of keys and prompt content", () => {
    expect(harness.endpoint).not.toContain(apiKey);
    expect(harness.endpoint).not.toContain(systemInstruction);
    expect(harness.endpoint).not.toContain(input);
    if (harness.name === "anthropic") expect(ANTHROPIC_VERSION).toBe("2023-06-01");
  });
});

describe("registered provider schema names", () => {
  it("derive names that satisfy the provider structured-output grammar", () => {
    for (const schema of Object.values(MODEL_OUTPUT_SCHEMA_REGISTRY)) {
      const name = `${schema.operation}_v${schema.version}`;
      expect(name).toMatch(PROVIDER_SCHEMA_NAME_PATTERN);
      expect(name.length).toBeLessThanOrEqual(64);
    }
  });
});
