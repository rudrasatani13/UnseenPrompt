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

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const MAX_REQUEST_ID_LENGTH = 256;
const MAX_RESOLVED_MODEL_LENGTH = 160;
const PROVIDER_SCHEMA_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Options for the server-only direct OpenAI adapter. */
export interface OpenAIAdapterOptions {
  readonly apiKey: string;
  readonly fetch?: ProviderFetch;
}

const tokenSchema = z.number().int().nonnegative().safe().nullable();

/**
 * Responses envelopes are provider data, so these schemas intentionally stay local to the
 * adapter. Unknown provider fields are preserved by passthrough, while fields used below are
 * validated before they are inspected.
 */
const responseContentSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    refusal: z.unknown().optional(),
  })
  .passthrough();

const responseOutputItemSchema = z
  .object({
    type: z.string(),
    content: z.array(responseContentSchema).nullable().optional(),
    text: z.string().optional(),
    refusal: z.unknown().optional(),
  })
  .passthrough();

const responseUsageSchema = z
  .object({
    input_tokens: tokenSchema.optional(),
    output_tokens: tokenSchema.optional(),
    total_tokens: tokenSchema.optional(),
  })
  .passthrough();

const incompleteDetailsSchema = z
  .object({ reason: z.string().nullable().optional() })
  .passthrough();

const responseEnvelopeSchema = z
  .object({
    status: z.string().nullable().optional(),
    output: z.array(responseOutputItemSchema).nullable().optional(),
    incomplete_details: incompleteDetailsSchema.nullable().optional(),
    model: z.string().nullable().optional(),
    usage: responseUsageSchema.nullable().optional(),
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

function normalizeUsage(usage: z.infer<typeof responseUsageSchema> | null | undefined): ModelUsage {
  return {
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
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

function contentHasRefusal(content: readonly z.infer<typeof responseContentSchema>[]): boolean {
  return content.some(
    (item) => item.type === "refusal" || Object.prototype.hasOwnProperty.call(item, "refusal"),
  );
}

function extractOutputTextCandidates(output: readonly z.infer<typeof responseOutputItemSchema>[]): {
  readonly candidates: readonly string[];
  readonly refused: boolean;
} {
  const candidates: string[] = [];
  let refused = false;

  for (const item of output) {
    if (item.type === "refusal") refused = true;
    if (item.type === "output_text" && item.text !== undefined) candidates.push(item.text);
    if (Object.prototype.hasOwnProperty.call(item, "refusal")) refused = true;

    if (item.content !== null && item.content !== undefined) {
      if (contentHasRefusal(item.content)) refused = true;
      for (const content of item.content) {
        if (content.type === "output_text" && content.text !== undefined) {
          candidates.push(content.text);
        }
      }
    }
  }

  return { candidates, refused };
}

function malformedEnvelope(correlationId: string): never {
  throw createModelGatewayError("provider_error", correlationId);
}

function invalidCandidate(correlationId: string): never {
  throw createModelGatewayError("invalid_output", correlationId);
}

/** Build a server-only OpenAI Responses adapter without SDK retries or provider-side state. */
export function createOpenAIAdapter(options: OpenAIAdapterOptions): ProviderAdapter {
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  return Object.freeze({
    providerId: "openai" as const,
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
        response = await fetchImplementation(OPENAI_RESPONSES_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            "X-Client-Request-Id": request.correlationId,
          },
          body: JSON.stringify({
            model: request.model,
            instructions: request.systemInstruction,
            input: request.input,
            max_output_tokens: request.maxOutputTokens,
            store: false,
            text: {
              format: {
                type: "json_schema",
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

      const parsed = responseEnvelopeSchema.safeParse(body);
      if (!parsed.success) malformedEnvelope(request.correlationId);

      const envelope = parsed.data;
      const extracted = extractOutputTextCandidates(envelope.output ?? []);
      if (extracted.refused) {
        throw createModelGatewayError("content_refused", request.correlationId);
      }

      const status = envelope.status;
      const incompleteReason = envelope.incomplete_details?.reason;
      if (status === "incomplete") {
        if (incompleteReason === "max_output_tokens") {
          throw createModelGatewayError("output_truncated", request.correlationId);
        }
        if (incompleteReason === "content_filter") {
          throw createModelGatewayError("content_refused", request.correlationId);
        }
        malformedEnvelope(request.correlationId);
      }
      if (status !== "completed") malformedEnvelope(request.correlationId);

      if (extracted.candidates.length !== 1) invalidCandidate(request.correlationId);

      return {
        // JSON parsing and operation-schema validation belong to the gateway so it can make the
        // single structured-repair decision. Keep this untrusted candidate opaque at the adapter
        // boundary, even when it is malformed JSON.
        value: extracted.candidates[0],
        usage: normalizeUsage(envelope.usage),
        resolvedModel: boundedResolvedModel(envelope.model) ?? request.model,
        requestId: boundedHeaderValue(response.headers.get("x-request-id")),
      };
    },
  });
}
