import { describe, expect, it } from "vitest";

import type { ProviderAdapterRequest, ProviderFetch } from "@/lib/model/provider";
import {
  ANTHROPIC_MESSAGES_ENDPOINT,
  ANTHROPIC_VERSION,
  createAnthropicAdapter,
  MAX_ANTHROPIC_REQUEST_ID_LENGTH,
} from "@/lib/model/providers/anthropic";
import { MAX_RESPONSE_BYTES } from "@/lib/model/http";

const correlationId = "00000000-0000-4000-8000-000000000000";
const apiKey = "anthropic-key-synthetic";
const prompt = "synthetic prompt that must never appear in provider errors";
const output = { accepted: true, source: "synthetic" };
const outputText = JSON.stringify(output);

function request(signal = new AbortController().signal): ProviderAdapterRequest {
  return {
    model: "claude-test-model",
    systemInstruction: "Return the requested object as JSON.",
    input: prompt,
    outputSchema: {
      type: "object",
      properties: { accepted: { type: "boolean" }, source: { type: "string" } },
      required: ["accepted", "source"],
      additionalProperties: false,
    },
    outputSchemaName: "synthetic",
    maxOutputTokens: 123,
    correlationId,
    signal,
  };
}

function messageEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "message",
    role: "assistant",
    model: "claude-resolved-model",
    content: [{ type: "text", text: JSON.stringify(output) }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 17,
      output_tokens: 9,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 2000,
    },
    ...overrides,
  };
}

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function makeFetch(response: Response): { fetch: ProviderFetch; calls: () => number } {
  let count = 0;
  const fetch: ProviderFetch = async () => {
    count += 1;
    return response;
  };
  return { fetch, calls: () => count };
}

describe("Anthropic Messages adapter", () => {
  it("sends the exact structured-output request and normalizes safe response metadata", async () => {
    const controller = new AbortController();
    let seenUrl: string | URL | Request | undefined;
    let seenInit: RequestInit | undefined;
    const requestSignal = controller.signal;
    const fetch: ProviderFetch = async (input, init) => {
      seenUrl = input;
      seenInit = init;
      return jsonResponse(messageEnvelope(), 200, {
        "request-id": `req_${"x".repeat(MAX_ANTHROPIC_REQUEST_ID_LENGTH + 20)}`,
      });
    };

    const result = await createAnthropicAdapter({ apiKey, fetch }).generate(request(requestSignal));

    expect(seenUrl).toBe(ANTHROPIC_MESSAGES_ENDPOINT);
    expect(seenInit?.method).toBe("POST");
    expect(seenInit?.signal).toBe(requestSignal);
    expect(seenInit?.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    });
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      model: "claude-test-model",
      max_tokens: 123,
      system: "Return the requested object as JSON.",
      messages: [{ role: "user", content: prompt }],
      output_config: {
        format: {
          type: "json_schema",
          schema: request().outputSchema,
        },
      },
    });
    expect(result).toEqual({
      value: outputText,
      usage: { inputTokens: 17, outputTokens: 9, totalTokens: null },
      resolvedModel: "claude-resolved-model",
      requestId: `req_${"x".repeat(MAX_ANTHROPIC_REQUEST_ID_LENGTH - 4)}`,
    });
  });

  it.each([
    [400, "invalid_provider_request"],
    [401, "authentication_failed"],
    [402, "billing_or_quota_exhausted"],
    [403, "permission_denied"],
    [404, "model_not_found"],
    [408, "attempt_timeout"],
    [413, "invalid_provider_request"],
    [422, "invalid_provider_request"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [502, "provider_unavailable"],
    [503, "provider_unavailable"],
    [504, "provider_unavailable"],
    [529, "provider_unavailable"],
    [418, "provider_error"],
  ] as const)("maps HTTP %s to %s without exposing the body", async (status, code) => {
    const secretBody = "provider-body-secret";
    const { fetch, calls } = makeFetch(jsonResponse({ error: secretBody }, status));
    const adapter = createAnthropicAdapter({ apiKey, fetch });

    const error = await adapter.generate(request()).catch((value: unknown) => value);

    expect(error).toMatchObject({ code, httpStatus: status });
    expect(String(error)).not.toContain(secretBody);
    expect(JSON.stringify(error)).not.toContain(apiKey);
    expect(JSON.stringify(error)).not.toContain(prompt);
    expect(calls()).toBe(1);
  });

  it.each([
    "Your credit balance is too low to access the Claude API.",
    "Your credit balance is too low to access the Anthropic API.",
    "Your credit balance is too low to access the Claude API. Please go to Plans & Billing to upgrade or purchase credits.",
  ] as const)("classifies explicit Anthropic billing exhaustion safely", async (message) => {
    const bodySecret = "ANTHROPIC_BILLING_BODY_SENTINEL";
    const { fetch, calls } = makeFetch(
      jsonResponse(
        {
          type: "error",
          error: { type: "invalid_request_error", message, detail: bodySecret },
        },
        400,
      ),
    );

    const error = await createAnthropicAdapter({ apiKey, fetch })
      .generate(request())
      .catch((value: unknown) => value);

    expect(error).toMatchObject({ code: "billing_or_quota_exhausted", httpStatus: 400 });
    expect(String(error)).not.toContain(bodySecret);
    expect(JSON.stringify(error)).not.toContain(bodySecret);
    expect(JSON.stringify(error)).not.toContain(apiKey);
    expect(JSON.stringify(error)).not.toContain(prompt);
    expect(calls()).toBe(1);
  });

  it.each([
    [
      "unknown validation",
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "The requested max_tokens value is invalid.",
        },
      },
    ],
    [
      "root message only",
      {
        type: "error",
        message: "Your credit balance is too low to access the Claude API.",
      },
    ],
    [
      "wrong error type",
      {
        type: "error",
        error: {
          type: "authentication_error",
          message: "Your credit balance is too low to access the Claude API.",
        },
      },
    ],
    [
      "wrong root type",
      {
        type: "invalid_request_error",
        error: {
          type: "invalid_request_error",
          message: "Your credit balance is too low to access the Claude API.",
        },
      },
    ],
    [
      "embedded prompt phrase",
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: 'Echoed prompt: "Your credit balance is too low to access the Claude API."',
        },
      },
    ],
    [
      "prefix trick",
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Notice: Your credit balance is too low to access the Claude API.",
        },
      },
    ],
    [
      "suffix trick",
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Your credit balance is too low to access the Claude API. Unexpected.",
        },
      },
    ],
    [
      "billing validation",
      {
        type: "error",
        error: { type: "invalid_request_error", message: "Billing address is required." },
      },
    ],
    [
      "payment validation",
      {
        type: "error",
        error: { type: "invalid_request_error", message: "Payment method is invalid." },
      },
    ],
    [
      "quota validation",
      {
        type: "error",
        error: { type: "invalid_request_error", message: "Quota parameter is invalid." },
      },
    ],
    [
      "wording change",
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Your credit balance is low to access the Claude API.",
        },
      },
    ],
  ] as const)("keeps Anthropic 400 %s generic", async (_label, envelope) => {
    const unknownSecret = "ANTHROPIC_UNKNOWN_400_SENTINEL";
    const unknown = await createAnthropicAdapter({
      apiKey,
      fetch: async () => jsonResponse({ ...envelope, sentinel: unknownSecret }, 400),
    })
      .generate(request())
      .catch((value: unknown) => value);
    expect(unknown).toMatchObject({ code: "invalid_provider_request", httpStatus: 400 });
    expect(String(unknown)).not.toContain(unknownSecret);
    expect(JSON.stringify(unknown)).not.toContain(unknownSecret);
  });

  it("keeps malformed and oversized Anthropic 400 bodies generic and bounded", async () => {
    const malformedSecret = "ANTHROPIC_MALFORMED_400_SENTINEL";
    const malformed = await createAnthropicAdapter({
      apiKey,
      fetch: async () => new Response(`{"error":{"message":"${malformedSecret}`, { status: 400 }),
    })
      .generate(request())
      .catch((value: unknown) => value);
    expect(malformed).toMatchObject({ code: "invalid_provider_request", httpStatus: 400 });
    expect(String(malformed)).not.toContain(malformedSecret);
    expect(JSON.stringify(malformed)).not.toContain(malformedSecret);

    const oversizedSecret = "ANTHROPIC_OVERSIZED_400_SENTINEL";
    const oversized = await createAnthropicAdapter({
      apiKey,
      fetch: async () =>
        new Response(
          JSON.stringify({
            type: "error",
            error: {
              type: "invalid_request_error",
              message: `Your credit balance is too low ${oversizedSecret}`,
            },
          }) + "x".repeat(MAX_RESPONSE_BYTES),
          { status: 400 },
        ),
    })
      .generate(request())
      .catch((value: unknown) => value);
    expect(oversized).toMatchObject({ code: "invalid_provider_request", httpStatus: 400 });
    expect(String(oversized)).not.toContain(oversizedSecret);
    expect(JSON.stringify(oversized)).not.toContain(oversizedSecret);
  });

  it("preserves cancellation when a bounded Anthropic 400 body read aborts", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return Promise.reject(
          Object.assign(new Error("ANTHROPIC_ABORT_BODY_SENTINEL"), { name: "AbortError" }),
        );
      },
    });
    const error = await createAnthropicAdapter({
      apiKey,
      fetch: async () => new Response(stream, { status: 400 }),
    })
      .generate(request())
      .catch((value: unknown) => value);

    expect(error).toMatchObject({ code: "aborted" });
    expect(String(error)).not.toContain("ANTHROPIC_ABORT_BODY_SENTINEL");
    expect(JSON.stringify(error)).not.toContain("ANTHROPIC_ABORT_BODY_SENTINEL");
  });

  it("maps refusal and explicit max-token truncation before inspecting content", async () => {
    for (const [stopReason, code] of [
      ["refusal", "content_refused"],
      ["max_tokens", "output_truncated"],
      ["model_context_window_exceeded", "output_truncated"],
    ] as const) {
      const { fetch, calls } = makeFetch(
        jsonResponse(messageEnvelope({ stop_reason: stopReason, content: [] })),
      );
      const error = await createAnthropicAdapter({ apiKey, fetch })
        .generate(request())
        .catch((value: unknown) => value);
      expect(error).toMatchObject({ code });
      expect(calls()).toBe(1);
    }
  });

  it("accepts stop_sequence with exactly one text candidate", async () => {
    const { fetch, calls } = makeFetch(
      jsonResponse(
        messageEnvelope({
          stop_reason: "stop_sequence",
          content: [{ type: "text", text: outputText }],
        }),
      ),
    );

    await expect(
      createAnthropicAdapter({ apiKey, fetch }).generate(request()),
    ).resolves.toMatchObject({
      value: outputText,
    });
    expect(calls()).toBe(1);
  });

  it.each([
    ["tool_use", "invalid_output"],
    ["pause_turn", "invalid_output"],
    [null, "invalid_output"],
    ["future_stop_reason", "invalid_output"],
  ] as const)(
    "rejects nonterminal stop reason %s even with a schema-valid text candidate",
    async (stopReason, code) => {
      const { fetch, calls } = makeFetch(
        jsonResponse(
          messageEnvelope({
            stop_reason: stopReason,
            content: [{ type: "text", text: outputText }],
          }),
        ),
      );
      const error = await createAnthropicAdapter({ apiKey, fetch })
        .generate(request())
        .catch((value: unknown) => value);

      expect(error).toMatchObject({ code });
      expect(String(error)).not.toContain(outputText);
      expect(JSON.stringify(error)).not.toContain(apiKey);
      expect(JSON.stringify(error)).not.toContain(prompt);
      expect(calls()).toBe(1);
    },
  );

  it.each([
    ["missing content", messageEnvelope({ content: undefined })],
    ["empty content", messageEnvelope({ content: [] })],
    [
      "multiple text blocks",
      messageEnvelope({
        content: [
          { type: "text", text: JSON.stringify(output) },
          { type: "text", text: JSON.stringify(output) },
        ],
      }),
    ],
    ["non-text content", messageEnvelope({ content: [{ type: "tool_use", id: "synthetic" }] })],
    ["malformed envelope", { type: "message", content: [] }],
  ] as const)("fails closed for %s", async (_name, payload) => {
    const secretOutput = "raw-provider-output-secret";
    const { fetch, calls } = makeFetch(jsonResponse(payload));
    const error = await createAnthropicAdapter({ apiKey, fetch })
      .generate(request())
      .catch((value: unknown) => value);

    expect(error).toMatchObject({ code: "invalid_output" });
    expect(String(error)).not.toContain(secretOutput);
    expect(JSON.stringify(error)).not.toContain(apiKey);
    expect(JSON.stringify(error)).not.toContain(prompt);
    expect(calls()).toBe(1);
  });

  it("returns malformed candidate JSON text unchanged for gateway repair", async () => {
    const malformed = "{ provider-output-secret";
    const { fetch, calls } = makeFetch(
      jsonResponse(messageEnvelope({ content: [{ type: "text", text: malformed }] })),
    );
    const result = await createAnthropicAdapter({ apiKey, fetch }).generate(request());

    expect(result.value).toBe(malformed);
    expect(result.usage).toEqual({ inputTokens: 17, outputTokens: 9, totalTokens: null });
    expect(calls()).toBe(1);
  });

  it("maps an oversized successful body to invalid_output and performs one fetch", async () => {
    const oversized = new Response("x".repeat(MAX_RESPONSE_BYTES + 1), { status: 200 });
    const { fetch, calls } = makeFetch(oversized);
    const error = await createAnthropicAdapter({ apiKey, fetch })
      .generate(request())
      .catch((value: unknown) => value);

    expect(error).toMatchObject({ code: "invalid_output" });
    expect(String(error)).not.toContain("x");
    expect(calls()).toBe(1);
  });

  it("maps network and cancellation failures without exposing thrown messages", async () => {
    const secret = "dns-provider-secret";
    const networkFetch: ProviderFetch = async () => {
      throw new TypeError(secret);
    };
    const networkError = await createAnthropicAdapter({ apiKey, fetch: networkFetch })
      .generate(request())
      .catch((value: unknown) => value);
    expect(networkError).toMatchObject({ code: "provider_unavailable" });
    expect(String(networkError)).not.toContain(secret);

    const abortFetch: ProviderFetch = async () => {
      throw Object.assign(new Error("abort-provider-secret"), { name: "AbortError" });
    };
    const abortError = await createAnthropicAdapter({ apiKey, fetch: abortFetch })
      .generate(request())
      .catch((value: unknown) => value);
    expect(abortError).toMatchObject({ code: "aborted" });
    expect(String(abortError)).not.toContain("abort-provider-secret");
  });

  it("does not call fetch when the server key is missing", async () => {
    let calls = 0;
    const fetch: ProviderFetch = async () => {
      calls += 1;
      return jsonResponse(messageEnvelope());
    };
    const error = await createAnthropicAdapter({ apiKey: "  ", fetch })
      .generate(request())
      .catch((value: unknown) => value);

    expect(error).toMatchObject({ code: "configuration_error" });
    expect(calls).toBe(0);
  });
});
