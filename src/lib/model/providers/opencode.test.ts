import { describe, expect, it, vi } from "vitest";

import type { ProviderJsonSchema } from "@/domain/model/json-schema";
import { MAX_RESPONSE_BYTES } from "@/lib/model/http";
import { isModelGatewayError } from "@/lib/model/errors";
import type { ProviderAdapterRequest, ProviderFetch } from "@/lib/model/provider";
import {
  createOpenCodeAdapter,
  OPENCODE_CHAT_COMPLETIONS_ENDPOINT,
} from "@/lib/model/providers/opencode";

const correlationId = "11111111-1111-4111-8111-111111111111";
const apiKey = "sk-opencode-synthetic-key";
const systemInstruction = "SYSTEM_SENTINEL_DO_NOT_LEAK";
const input = "INPUT_SENTINEL_DO_NOT_LEAK";
const outputSchema: ProviderJsonSchema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};

const request: ProviderAdapterRequest = {
  model: "deepseek-v4-flash",
  systemInstruction,
  input,
  outputSchema,
  outputSchemaName: "synthetic_output",
  maxOutputTokens: 321,
  correlationId,
  signal: new AbortController().signal,
};

function chatEnvelope(
  candidate = '{"answer":"ok"}',
  options: {
    readonly finishReason?: string | null;
    readonly choices?: readonly unknown[];
    readonly usage?: unknown;
    readonly model?: string;
    readonly refusal?: string;
  } = {},
): Response {
  return new Response(
    JSON.stringify({
      model: options.model ?? "deepseek-v4-flash-resolved",
      choices: options.choices ?? [
        {
          index: 0,
          message: {
            role: "assistant",
            content: candidate,
            ...(options.refusal === undefined ? {} : { refusal: options.refusal }),
          },
          finish_reason: options.finishReason ?? "stop",
        },
      ],
      usage: options.usage ?? {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
      },
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

describe("OpenCode Go Chat Completions adapter", () => {
  it("uses the fixed endpoint and exact structured-output request shape", async () => {
    let seenUrl: string | URL | RequestInfo | undefined;
    let seenInit: RequestInit | undefined;
    const fetchImplementation: ProviderFetch = async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return chatEnvelope();
    };
    const signal = new AbortController().signal;
    const result = await createOpenCodeAdapter({ apiKey, fetch: fetchImplementation }).generate({
      ...request,
      signal,
    });

    expect(seenUrl).toBe(OPENCODE_CHAT_COMPLETIONS_ENDPOINT);
    expect(seenInit?.method).toBe("POST");
    expect(seenInit?.signal).toBe(signal);
    expect(seenInit?.headers).toEqual({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Client-Request-Id": correlationId,
    });
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      model: request.model,
      messages: [
        { role: "system", content: systemInstruction },
        {
          role: "user",
          content: `${input}\n\nRespond with JSON only. Match this exact JSON schema (${request.outputSchemaName}) and include no extra keys:\n${JSON.stringify(outputSchema)}`,
        },
      ],
      max_tokens: request.maxOutputTokens,
      temperature: 0,
      store: false,
      response_format: { type: "json_object" },
    });
    expect(result).toEqual({
      value: '{"answer":"ok"}',
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      resolvedModel: "deepseek-v4-flash-resolved",
      requestId: "req-synthetic-123",
    });
  });

  it("normalizes missing usage and bounds request metadata", async () => {
    const fetchImplementation: ProviderFetch = async () =>
      new Response(
        JSON.stringify({
          model: `${"m".repeat(300)}\nsecret`,
          choices: [
            { message: { role: "assistant", content: '{"answer":"ok"}' }, finish_reason: "stop" },
          ],
        }),
        {
          status: 200,
          headers: { "x-request-id": `${"r".repeat(300)}secret` },
        },
      );

    const result = await createOpenCodeAdapter({ fetch: fetchImplementation, apiKey }).generate(
      request,
    );
    expect(result.usage).toEqual({ inputTokens: null, outputTokens: null, totalTokens: null });
    expect(result.resolvedModel).toHaveLength(160);
    expect(result.resolvedModel).not.toContain("secret");
    expect(result.requestId).toHaveLength(256);
    expect(result.requestId).not.toContain("secret");
  });

  it.each([
    [400, "invalid_provider_request"],
    [401, "authentication_failed"],
    [402, "billing_or_quota_exhausted"],
    [403, "permission_denied"],
    [404, "model_not_found"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [503, "provider_unavailable"],
    [418, "provider_error"],
  ] as const)("maps HTTP %i to %s without leaking the body", async (status, expectedCode) => {
    const secretBody = "OPENCODE_SECRET_SENTINEL";
    const fetchImplementation: ProviderFetch = async () =>
      errorResponse(status, { error: { message: secretBody, code: "ordinary_error" } });

    try {
      await createOpenCodeAdapter({ apiKey, fetch: fetchImplementation }).generate(request);
      expect.unreachable("expected an error");
    } catch (error: unknown) {
      expect(getErrorCode(error)).toBe(expectedCode);
      expect(String(error)).not.toContain(secretBody);
      expect(JSON.stringify(error)).not.toContain(secretBody);
    }
  });

  it("maps 429 quota-coded bodies to billing exhaustion", async () => {
    const body = { error: { code: "insufficient_quota" } };
    const fetchImplementation: ProviderFetch = async () => errorResponse(429, body);

    await expect(
      createOpenCodeAdapter({ apiKey, fetch: fetchImplementation }).generate(request),
    ).rejects.toMatchObject({ code: "billing_or_quota_exhausted", httpStatus: 429 });
  });

  it("keeps ordinary 429 codes rate limited", async () => {
    const fetchImplementation: ProviderFetch = async () =>
      errorResponse(429, { error: { code: "rate_limit_exceeded" } });

    await expect(
      createOpenCodeAdapter({ apiKey, fetch: fetchImplementation }).generate(request),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("keeps malformed and oversized 429 bodies rate limited without leaking content", async () => {
    const oversizedCode = "x".repeat(300);
    const fetchImplementation: ProviderFetch = async () =>
      errorResponse(429, { error: { code: oversizedCode } });

    const error = await createOpenCodeAdapter({ apiKey, fetch: fetchImplementation })
      .generate(request)
      .catch((value: unknown) => value);

    expect(getErrorCode(error)).toBe("rate_limited");
    expect(JSON.stringify(error)).not.toContain(oversizedCode);
  });

  it("maps aborted oversized-body streams to aborted", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(abortError);
      },
    });
    const error = await createOpenCodeAdapter({
      apiKey,
      fetch: async () => new Response(stream, { status: 429 }),
    })
      .generate(request)
      .catch((value: unknown) => value);

    expect(getErrorCode(error)).toBe("aborted");
  });

  it("rejects malformed success bodies as provider errors without leaking content", async () => {
    const malformedSecret = "OPENCODE_MALFORMED_SENTINEL";
    const fetchImplementation: ProviderFetch = async () =>
      new Response(`{"choices":[{"message":{"content":"${malformedSecret}`, { status: 200 });

    const error = await createOpenCodeAdapter({ apiKey, fetch: fetchImplementation })
      .generate(request)
      .catch((value: unknown) => value);

    expect(getErrorCode(error)).toBe("provider_error");
    expect(String(error)).not.toContain(malformedSecret);
  });

  it("rejects oversized success bodies as provider errors", async () => {
    const fetchImplementation: ProviderFetch = async () =>
      new Response("x".repeat(MAX_RESPONSE_BYTES + 1), { status: 200 });

    await expect(
      createOpenCodeAdapter({ apiKey, fetch: fetchImplementation }).generate(request),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("maps length finish reasons to output truncation", async () => {
    const fetchImplementation: ProviderFetch = async () =>
      chatEnvelope('{"answer":"truncated', { finishReason: "length" });

    await expect(
      createOpenCodeAdapter({ apiKey, fetch: fetchImplementation }).generate(request),
    ).rejects.toMatchObject({ code: "output_truncated" });
  });

  it("maps refusals and content filters to content_refused", async () => {
    const refusalFetch: ProviderFetch = async () => chatEnvelope("", { refusal: "not allowed" });
    await expect(
      createOpenCodeAdapter({ apiKey, fetch: refusalFetch }).generate(request),
    ).rejects.toMatchObject({ code: "content_refused" });

    const filterFetch: ProviderFetch = async () =>
      chatEnvelope("", { finishReason: "content_filter" });
    await expect(
      createOpenCodeAdapter({ apiKey, fetch: filterFetch }).generate(request),
    ).rejects.toMatchObject({ code: "content_refused" });
  });

  it("rejects unexpected envelopes as provider errors", async () => {
    const zeroChoices: ProviderFetch = async () => chatEnvelope("", { choices: [] });
    await expect(
      createOpenCodeAdapter({ apiKey, fetch: zeroChoices }).generate(request),
    ).rejects.toMatchObject({ code: "provider_error" });

    const unknownFinish: ProviderFetch = async () =>
      chatEnvelope('{"answer":"ok"}', { finishReason: "tool_calls" });
    await expect(
      createOpenCodeAdapter({ apiKey, fetch: unknownFinish }).generate(request),
    ).rejects.toMatchObject({ code: "provider_error" });

    const emptyContent: ProviderFetch = async () => chatEnvelope("");
    await expect(
      createOpenCodeAdapter({ apiKey, fetch: emptyContent }).generate(request),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("fails before fetch when the API key is missing or blank", async () => {
    const fetchImplementation = vi.fn<ProviderFetch>(async () => chatEnvelope());
    const adapter = createOpenCodeAdapter({ apiKey: "   ", fetch: fetchImplementation });

    await expect(adapter.generate(request)).rejects.toMatchObject({ code: "configuration_error" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects unsafe schema names before any provider call", async () => {
    const fetchImplementation = vi.fn<ProviderFetch>(async () => chatEnvelope());
    const adapter = createOpenCodeAdapter({ apiKey, fetch: fetchImplementation });

    await expect(
      adapter.generate({ ...request, outputSchemaName: "bad name!" }),
    ).rejects.toMatchObject({ code: "invalid_provider_request" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("maps transport failures without retaining the thrown cause", async () => {
    const secretCause = "OPENCODE_TRANSPORT_SENTINEL";
    const fetchImplementation: ProviderFetch = async () => {
      throw new TypeError(secretCause);
    };

    try {
      await createOpenCodeAdapter({ apiKey, fetch: fetchImplementation }).generate(request);
      expect.unreachable("expected an error");
    } catch (error: unknown) {
      expect(getErrorCode(error)).toBe("provider_unavailable");
      expect(String(error)).not.toContain(secretCause);
      expect(JSON.stringify(error)).not.toContain(secretCause);
    }
  });
});
