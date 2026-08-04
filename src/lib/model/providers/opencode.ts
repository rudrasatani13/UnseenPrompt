import "server-only";

import { z } from "zod";

import type { ModelUsage } from "@/domain/model/contracts";
import {
  BoundedResponseError,
  MalformedJsonError,
  MAX_RESPONSE_BYTES,
  parseJsonFromUnknown,
  readBoundedResponseText,
} from "@/lib/model/http";
import {
  createModelGatewayError,
  mapProviderResponseError,
  mapProviderTransportError,
} from "@/lib/model/errors";
import type {
  ProviderAdapter,
  ProviderAdapterRequest,
  ProviderAdapterResult,
  ProviderFetch,
} from "@/lib/model/provider";

export const OPENCODE_CHAT_COMPLETIONS_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions";
const MAX_REQUEST_ID_LENGTH = 256;
const MAX_RESOLVED_MODEL_LENGTH = 160;
const PROVIDER_SCHEMA_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Options for the server-only OpenCode Go (OpenAI-compatible Chat Completions) adapter. */
export interface OpenCodeAdapterOptions {
  readonly apiKey: string;
  readonly fetch?: ProviderFetch;
}

const tokenSchema = z.number().int().nonnegative().safe().nullable();

/**
 * Chat Completions envelopes are provider data, so these schemas intentionally stay local to the
 * adapter. Unknown provider fields are preserved by passthrough, while fields used below are
 * validated before they are inspected.
 */
const messageSchema = z
  .object({
    role: z.string().optional(),
    content: z.string().nullable().optional(),
    refusal: z.string().nullable().optional(),
  })
  .passthrough();

const choiceSchema = z
  .object({
    message: messageSchema.optional(),
    finish_reason: z.string().nullable().optional(),
  })
  .passthrough();

const chatUsageSchema = z
  .object({
    prompt_tokens: tokenSchema.optional(),
    completion_tokens: tokenSchema.optional(),
    total_tokens: tokenSchema.optional(),
  })
  .passthrough();

const chatEnvelopeSchema = z
  .object({
    model: z.string().nullable().optional(),
    choices: z.array(choiceSchema).nullable().optional(),
    usage: chatUsageSchema.nullable().optional(),
  })
  .passthrough();

const providerErrorEnvelopeSchema = z
  .object({
    code: z.unknown().optional(),
    type: z.unknown().optional(),
    error: z.unknown().optional(),
  })
  .passthrough();
const providerErrorCodeSchema = z.string().trim().max(128);

const QUOTA_ERROR_CODES = new Set([
  "billing_hard_limit_reached",
  "billing_not_active",
  "credit_balance_exhausted",
  "insufficient_funds",
  "insufficient_quota",
  "payment_required",
  "quota_exceeded",
]);

function boundedHeaderValue(value: string | null): string | null {
  if (value === null) return null;
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_REQUEST_ID_LENGTH);
  return sanitized.length > 0 ? sanitized : null;
}

function boundedResolvedModel(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_RESOLVED_MODEL_LENGTH);
  return sanitized.length > 0 ? sanitized : null;
}

function normalizeUsage(usage: z.infer<typeof chatUsageSchema> | null | undefined): ModelUsage {
  return {
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
  };
}

function extractSafeErrorCodes(value: unknown): readonly string[] {
  const parsed = providerErrorEnvelopeSchema.safeParse(value);
  if (!parsed.success) return [];

  const candidates: unknown[] = [parsed.data.code, parsed.data.type];
  const nested = parsed.data.error;
  if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
    const nestedParsed = providerErrorEnvelopeSchema.safeParse(nested);
    if (nestedParsed.success) {
      candidates.push(nestedParsed.data.code, nestedParsed.data.type);
    }
  }

  return candidates.flatMap((candidate) => {
    const bounded = providerErrorCodeSchema.safeParse(candidate);
    return bounded.success ? [bounded.data.toLowerCase()] : [];
  });
}

async function responseHasQuotaCode(response: Response, correlationId: string): Promise<boolean> {
  try {
    const text = await readBoundedResponseText(response, MAX_RESPONSE_BYTES);
    let body: unknown;
    try {
      body = parseJsonFromUnknown(text);
    } catch (error: unknown) {
      if (error instanceof MalformedJsonError) return false;
      return false;
    }
    return extractSafeErrorCodes(body).some((code) => QUOTA_ERROR_CODES.has(code));
  } catch (error: unknown) {
    if (error instanceof BoundedResponseError && error.reason === "aborted") {
      // Preserve caller cancellation without retaining the stream error or its message.
      throw createModelGatewayError("aborted", correlationId);
    }
    // Other body-read failures must not hide the stable HTTP status mapping.
    if (error instanceof BoundedResponseError) return false;
    return false;
  }
}

function malformedEnvelope(correlationId: string): never {
  throw createModelGatewayError("provider_error", correlationId);
}

function invalidCandidate(correlationId: string): never {
  throw createModelGatewayError("invalid_output", correlationId);
}

/** Build a server-only OpenCode Go adapter without SDK retries or provider-side state. */
export function createOpenCodeAdapter(options: OpenCodeAdapterOptions): ProviderAdapter {
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  return Object.freeze({
    providerId: "opencode" as const,
    async generate(request: ProviderAdapterRequest): Promise<ProviderAdapterResult> {
      if (
        typeof request.outputSchemaName !== "string" ||
        !PROVIDER_SCHEMA_NAME_PATTERN.test(request.outputSchemaName)
      ) {
        throw createModelGatewayError("invalid_provider_request", request.correlationId);
      }
      if (typeof options.apiKey !== "string" || options.apiKey.trim().length === 0) {
        throw createModelGatewayError("configuration_error", request.correlationId);
      }

      let response: Response;
      try {
        response = await fetchImplementation(OPENCODE_CHAT_COMPLETIONS_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            "X-Client-Request-Id": request.correlationId,
          },
          body: JSON.stringify({
            model: request.model,
            messages: [
              { role: "system", content: request.systemInstruction },
              { role: "user", content: request.input },
            ],
            max_tokens: request.maxOutputTokens,
            temperature: 0,
            store: false,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: request.outputSchemaName,
                schema: request.outputSchema,
                strict: true,
              },
            },
          }),
          signal: request.signal,
        });
      } catch (error: unknown) {
        throw mapProviderTransportError(error, request.correlationId);
      }

      if (!response.ok) {
        if (
          response.status === 429 &&
          (await responseHasQuotaCode(response, request.correlationId))
        ) {
          throw createModelGatewayError("billing_or_quota_exhausted", request.correlationId, {
            httpStatus: response.status,
          });
        }
        throw mapProviderResponseError(response, request.correlationId);
      }

      let body: unknown;
      try {
        const text = await readBoundedResponseText(response, MAX_RESPONSE_BYTES);
        body = parseJsonFromUnknown(text);
      } catch (error: unknown) {
        if (error instanceof BoundedResponseError && error.reason === "aborted") {
          throw createModelGatewayError("aborted", request.correlationId);
        }
        // Malformed or oversized provider envelopes are provider errors. The body is never kept.
        throw createModelGatewayError("provider_error", request.correlationId);
      }

      const parsed = chatEnvelopeSchema.safeParse(body);
      if (!parsed.success) malformedEnvelope(request.correlationId);

      const envelope = parsed.data;
      const choices = envelope.choices ?? [];
      if (choices.length !== 1) malformedEnvelope(request.correlationId);

      const choice = choices[0];
      if (choice === undefined) malformedEnvelope(request.correlationId);
      const message = choice.message;
      if (message === undefined) malformedEnvelope(request.correlationId);
      if (message.refusal !== null && message.refusal !== undefined) {
        throw createModelGatewayError("content_refused", request.correlationId);
      }

      const finishReason = choice.finish_reason;
      if (finishReason === "length") {
        throw createModelGatewayError("output_truncated", request.correlationId);
      }
      if (finishReason === "content_filter") {
        throw createModelGatewayError("content_refused", request.correlationId);
      }
      if (finishReason !== "stop" && finishReason !== null && finishReason !== undefined) {
        malformedEnvelope(request.correlationId);
      }

      const content = message.content;
      if (typeof content !== "string" || content.length === 0)
        invalidCandidate(request.correlationId);

      return {
        // JSON parsing and operation-schema validation belong to the gateway so it can make the
        // single structured-repair decision. Keep this untrusted candidate opaque at the adapter
        // boundary, even when it is malformed JSON.
        value: content,
        usage: normalizeUsage(envelope.usage),
        resolvedModel: boundedResolvedModel(envelope.model) ?? request.model,
        requestId: boundedHeaderValue(response.headers.get("x-request-id")),
      };
    },
  });
}
