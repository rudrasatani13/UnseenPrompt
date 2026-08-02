import { describe, expect, it, vi } from "vitest";

import type { ProviderJsonSchema } from "@/domain/model/json-schema";
import { MAX_RESPONSE_BYTES } from "@/lib/model/http";
import { isModelGatewayError } from "@/lib/model/errors";
import type { ProviderAdapterRequest, ProviderFetch } from "@/lib/model/provider";
import { createOpenAIAdapter } from "@/lib/model/providers/openai";

const correlationId = "11111111-1111-4111-8111-111111111111";
const apiKey = "sk-openai-synthetic-key";
const systemInstruction = "SYSTEM_SENTINEL_DO_NOT_LEAK";
const input = "INPUT_SENTINEL_DO_NOT_LEAK";
const outputSchema: ProviderJsonSchema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};

const request: ProviderAdapterRequest = {
  model: "gpt-test-1",
  systemInstruction,
  input,
  outputSchema,
  outputSchemaName: "synthetic_output",
  maxOutputTokens: 321,
  correlationId,
  signal: new AbortController().signal,
};

function responseEnvelope(
  candidate = '{"answer":"ok"}',
  options: {
    readonly status?: string;
    readonly output?: readonly unknown[];
    readonly usage?: unknown;
    readonly model?: string;
  } = {},
): Response {
  return new Response(
    JSON.stringify({
      status: options.status ?? "completed",
      output: options.output ?? [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: candidate, annotations: [] }],
        },
      ],
      usage: options.usage ?? {
        input_tokens: 11,
        output_tokens: 7,
        total_tokens: 18,
      },
      model: options.model ?? "gpt-test-1-resolved",
    }),
    {
      status: 200,
      headers: { "x-request-id": "req-synthetic-123" },
    },
  );
}

function errorResponse(
  status: number,
  body: unknown = { error: { code: "ordinary_error" } },
): Response {
  return new Response(JSON.stringify(body), { status });
}

function getErrorCode(error: unknown): string {
  expect(isModelGatewayError(error)).toBe(true);
  return (error as { readonly code: string }).code;
}

describe("OpenAI Responses adapter", () => {
  it("uses the fixed endpoint and exact structured-output request shape", async () => {
    let seenUrl: string | URL | RequestInfo | undefined;
    let seenInit: RequestInit | undefined;
    const fetchImplementation: ProviderFetch = async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return responseEnvelope();
    };
    const signal = new AbortController().signal;
    const result = await createOpenAIAdapter({ apiKey, fetch: fetchImplementation }).generate({
      ...request,
      signal,
    });

    expect(seenUrl).toBe("https://api.openai.com/v1/responses");
    expect(seenInit?.method).toBe("POST");
    expect(seenInit?.signal).toBe(signal);
    expect(seenInit?.headers).toEqual({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Client-Request-Id": correlationId,
    });
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      model: request.model,
      instructions: systemInstruction,
      input,
      max_output_tokens: request.maxOutputTokens,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: request.outputSchemaName,
          schema: outputSchema,
          strict: true,
        },
      },
    });
    expect(result).toEqual({
      value: '{"answer":"ok"}',
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      resolvedModel: "gpt-test-1-resolved",
      requestId: "req-synthetic-123",
    });
  });

  it("normalizes missing usage and bounds request metadata", async () => {
    const fetchImplementation: ProviderFetch = async () =>
      new Response(
        JSON.stringify({
          status: "completed",
          output: [{ type: "output_text", text: '{"answer":"ok"}' }],
          model: `${"m".repeat(300)}\nsecret`,
        }),
        {
          status: 200,
          headers: { "x-request-id": `${"r".repeat(300)}secret` },
        },
      );

    const result = await createOpenAIAdapter({ fetch: fetchImplementation, apiKey }).generate(
      request,
    );
    expect(result.usage).toEqual({ inputTokens: null, outputTokens: null, totalTokens: null });
    expect(result.resolvedModel).toHaveLength(160);
    expect(result.requestId).toHaveLength(256);
    expect(result.resolvedModel).not.toContain("secret");
    expect(result.requestId).not.toContain("secret");
  });

  it.each([
    [401, "authentication_failed"],
    [403, "permission_denied"],
    [404, "model_not_found"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [402, "billing_or_quota_exhausted"],
  ] as const)("maps HTTP %s to %s without exposing the body", async (status, expectedCode) => {
    const secretBody = "PROVIDER_BODY_SECRET_SENTINEL";
    const fetchImplementation: ProviderFetch = async () =>
      errorResponse(status, { error: { message: secretBody, code: "ordinary_error" } });

    try {
      await createOpenAIAdapter({ apiKey, fetch: fetchImplementation }).generate(request);
      expect.unreachable("expected an error");
    } catch (error: unknown) {
      expect(getErrorCode(error)).toBe(expectedCode);
      expect(String(error)).not.toContain(secretBody);
      expect(JSON.stringify(error)).not.toContain(apiKey);
      expect(JSON.stringify(error)).not.toContain(systemInstruction);
      expect(JSON.stringify(error)).not.toContain(input);
    }
  });

  it("maps an OpenAI insufficient-quota 429 separately from ordinary rate limits", async () => {
    const fetchImplementation: ProviderFetch = async () =>
      errorResponse(429, { error: { code: "insufficient_quota", message: "secret" } });

    await expect(
      createOpenAIAdapter({ apiKey, fetch: fetchImplementation }).generate(request),
    ).rejects.toMatchObject({ code: "billing_or_quota_exhausted", httpStatus: 429 });
  });

  it.each([
    ["refusal", [{ type: "refusal", refusal: "SAFETY_SENTINEL" }], "content_refused"],
    [
      "nested refusal",
      [{ type: "message", content: [{ type: "refusal", refusal: "SAFETY_SENTINEL" }] }],
      "content_refused",
    ],
    [
      "content refusal field",
      [{ type: "message", content: [{ type: "output_text", text: "ignored", refusal: null }] }],
      "content_refused",
    ],
    ["unknown incomplete status", [{ type: "message", content: [] }], "provider_error"],
  ] as const)("maps %s output safely", async (label, output, expectedCode) => {
    const fetchImplementation: ProviderFetch = async () =>
      responseEnvelope("ignored", {
        status: label === "unknown incomplete status" ? "incomplete" : "completed",
        output,
      });

    await expect(
      createOpenAIAdapter({ apiKey, fetch: fetchImplementation }).generate(request),
    ).rejects.toMatchObject({ code: expectedCode });
  });

  it("maps max-output-token incomplete details to output_truncated", async () => {
    const fetchImplementation: ProviderFetch = async () =>
      new Response(
        JSON.stringify({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [],
        }),
        { status: 200 },
      );

    await expect(
      createOpenAIAdapter({ apiKey, fetch: fetchImplementation }).generate(request),
    ).rejects.toMatchObject({ code: "output_truncated" });
  });

  it("maps content-filter truncation to content_refused and unknown status to provider_error", async () => {
    const contentFilterFetch: ProviderFetch = async () =>
      new Response(
        JSON.stringify({
          status: "incomplete",
          incomplete_details: { reason: "content_filter" },
          output: [],
        }),
        { status: 200 },
      );
    await expect(
      createOpenAIAdapter({ apiKey, fetch: contentFilterFetch }).generate(request),
    ).rejects.toMatchObject({ code: "content_refused" });

    const unknownStatusFetch: ProviderFetch = async () =>
      responseEnvelope("ignored", { status: "in_progress", output: [] });
    await expect(
      createOpenAIAdapter({ apiKey, fetch: unknownStatusFetch }).generate(request),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("fails before fetch when the API key is missing or blank", async () => {
    const fetchImplementation = vi.fn<ProviderFetch>(async () => responseEnvelope());
    const adapter = createOpenAIAdapter({ apiKey: "   ", fetch: fetchImplementation });

    await expect(adapter.generate(request)).rejects.toMatchObject({ code: "configuration_error" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each(["dotted.name", "a/b", "", "x".repeat(65)])(
    "rejects an invalid provider schema name before fetch: %s",
    async (outputSchemaName) => {
      const fetchImplementation = vi.fn<ProviderFetch>(async () => responseEnvelope());
      const adapter = createOpenAIAdapter({ apiKey, fetch: fetchImplementation });

      try {
        await adapter.generate({ ...request, outputSchemaName });
        expect.unreachable("expected an invalid provider request error");
      } catch (error: unknown) {
        expect(getErrorCode(error)).toBe("invalid_provider_request");
        if (outputSchemaName.length > 0) {
          expect(JSON.stringify(error)).not.toContain(outputSchemaName);
        }
      }
      expect(fetchImplementation).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["failed status", { status: "failed", output: [] }, "provider_error"],
    ["missing candidate", { status: "completed", output: [] }, "invalid_output"],
    [
      "multiple candidates",
      {
        status: "completed",
        output: [
          { type: "output_text", text: '{"answer":"one"}' },
          { type: "output_text", text: '{"answer":"two"}' },
        ],
      },
      "invalid_output",
    ],
  ] as const)("maps %s to a stable sanitized error", async (_label, envelope, expectedCode) => {
    const fetchImplementation: ProviderFetch = async () => responseEnvelope("ignored", envelope);
    await expect(
      createOpenAIAdapter({ apiKey, fetch: fetchImplementation }).generate(request),
    ).rejects.toMatchObject({ code: expectedCode });
  });

  it("returns one output_text candidate unchanged for gateway JSON validation", async () => {
    const malformedCandidate = "{MALFORMED_OUTPUT_SENTINEL";
    const fetchImplementation: ProviderFetch = async () =>
      responseEnvelope(malformedCandidate, { status: "completed" });

    const result = await createOpenAIAdapter({ apiKey, fetch: fetchImplementation }).generate(
      request,
    );
    expect(result.value).toBe(malformedCandidate);
  });

  it("maps malformed and oversized envelopes without leaking untrusted content", async () => {
    const malformedSecret = "MALFORMED_BODY_SECRET_SENTINEL";
    const malformedFetch: ProviderFetch = async () =>
      new Response(`{${malformedSecret}`, { status: 200 });
    await expect(
      createOpenAIAdapter({ apiKey, fetch: malformedFetch }).generate(request),
    ).rejects.toMatchObject({ code: "provider_error" });

    const oversizedFetch: ProviderFetch = async () =>
      new Response("x".repeat(MAX_RESPONSE_BYTES + 1), { status: 200 });
    try {
      await createOpenAIAdapter({ apiKey, fetch: oversizedFetch }).generate(request);
      expect.unreachable("expected an error");
    } catch (error: unknown) {
      expect(getErrorCode(error)).toBe("provider_error");
      expect(String(error)).not.toContain(malformedSecret);
    }
  });

  it("maps network failures and forwards the supplied signal with one fetch", async () => {
    const signal = new AbortController().signal;
    const fetchImplementation = vi.fn<ProviderFetch>(async (_url, init) => {
      expect(init?.signal).toBe(signal);
      throw Object.assign(new TypeError("NETWORK_SECRET_SENTINEL"), { name: "TypeError" });
    });

    await expect(
      createOpenAIAdapter({ apiKey, fetch: fetchImplementation }).generate({ ...request, signal }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
