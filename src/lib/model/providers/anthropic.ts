import "server-only";

import { z } from "zod";

import type { ModelUsage } from "@/domain/model/contracts";
import {
  createModelGatewayError,
  mapContentRefusal,
  mapInvalidOutput,
  mapOutputTruncation,
  mapProviderResponseError,
  mapProviderTransportError,
  ModelGatewayError,
} from "@/lib/model/errors";
import { BoundedResponseError, readBoundedJsonResponse } from "@/lib/model/http";
import type {
  ProviderAdapter,
  ProviderAdapterRequest,
  ProviderAdapterResult,
  ProviderFetch,
} from "@/lib/model/provider";

/** Anthropic Messages has one fixed Phase 5 endpoint; callers cannot override its origin. */
export const ANTHROPIC_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Request IDs are diagnostic metadata only and are never allowed to grow without bound. */
export const MAX_ANTHROPIC_REQUEST_ID_LENGTH = 256;
export const MAX_ANTHROPIC_RESOLVED_MODEL_LENGTH = 256;

const anthropicContentBlockSchema = z
  .object({
    type: z.string(),
    text: z.unknown().optional(),
  })
  .passthrough();

const anthropicUsageSchema = z
  .object({
    input_tokens: z.unknown().optional(),
    output_tokens: z.unknown().optional(),
    total_tokens: z.unknown().optional(),
  })
  .passthrough();

/**
 * This is intentionally a local wire schema. Provider payloads stay unknown until this envelope
 * has been parsed; the candidate itself remains unknown for the gateway's operation schema.
 */
const anthropicMessageSchema = z
  .object({
    type: z.literal("message"),
    model: z.string().trim().min(1).max(MAX_ANTHROPIC_RESOLVED_MODEL_LENGTH),
    content: z.array(anthropicContentBlockSchema),
    stop_reason: z.string().nullable(),
    usage: anthropicUsageSchema.optional(),
  })
  .passthrough();

export interface AnthropicAdapterOptions {
  /** The server-only key is sent in a header and is never included in a URL or error. */
  readonly apiKey: string;
  /** Injected in tests; production uses the Workers global fetch. */
  readonly fetch?: ProviderFetch;
}

function isSafeToken(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function normalizeUsage(usage: z.infer<typeof anthropicUsageSchema> | undefined): ModelUsage {
  return {
    inputTokens: isSafeToken(usage?.input_tokens) ? usage.input_tokens : null,
    outputTokens: isSafeToken(usage?.output_tokens) ? usage.output_tokens : null,
    // Anthropic generally reports input/output fields only. Do not infer a total: the shared
    // contract treats an unreported provider field as null.
    totalTokens: isSafeToken(usage?.total_tokens) ? usage.total_tokens : null,
  };
}

function boundedRequestId(headers: Headers): string | null {
  const raw = headers.get("request-id");
  if (raw === null) return null;

  const value = raw.trim();
  if (value.length === 0) return null;

  // Header values are opaque provider metadata. Strip control characters before bounding so this
  // value remains safe if a caller later serializes diagnostic records.
  const printable = [...value].filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint >= 0x20 && codePoint !== 0x7f;
  });
  const bounded = printable.join("").slice(0, MAX_ANTHROPIC_REQUEST_ID_LENGTH);
  return bounded.length === 0 ? null : bounded;
}

function buildRequestBody(request: ProviderAdapterRequest): string {
  const body = {
    model: request.model,
    max_tokens: request.maxOutputTokens,
    system: request.systemInstruction,
    messages: [{ role: "user", content: request.input }],
    output_config: {
      format: {
        type: "json_schema",
        schema: request.outputSchema,
      },
    },
  };

  try {
    const serialized = JSON.stringify(body);
    if (typeof serialized !== "string") {
      throw new Error("request_not_serializable");
    }
    return serialized;
  } catch {
    // The caller receives only the stable code. In particular, JSON.stringify's message must not
    // cross the provider boundary because it could contain untrusted schema data.
    throw createModelGatewayError("invalid_provider_request", request.correlationId);
  }
}

function parseCandidate(
  message: z.infer<typeof anthropicMessageSchema>,
  correlationId: string,
): unknown {
  switch (message.stop_reason) {
    case "refusal":
      throw mapContentRefusal(correlationId);
    case "max_tokens":
    case "model_context_window_exceeded":
      throw mapOutputTruncation(correlationId);
    case "end_turn":
    case "stop_sequence":
      break;
    default:
      // Phase 5 does not execute/continue tools or paused turns. Unknown and non-terminal stop
      // reasons must not let a text block bypass the provider-output state machine.
      throw mapInvalidOutput(correlationId);
  }

  // Phase 5 does not request tools, streaming, or hidden thinking. A response is accepted only
  // when its content is exactly one text block, avoiding accidental acceptance of mixed output.
  if (message.content.length !== 1) {
    throw mapInvalidOutput(correlationId);
  }
  const block = message.content[0];
  if (block === undefined || block.type !== "text" || typeof block.text !== "string") {
    throw mapInvalidOutput(correlationId);
  }

  // JSON parsing and operation-schema validation belong to the gateway. Returning the text
  // unchanged lets the gateway make the single structured-repair decision with the rejected
  // candidate still available in memory.
  return block.text;
}

function parseResponseBody(
  value: unknown,
  correlationId: string,
): z.infer<typeof anthropicMessageSchema> {
  const parsed = anthropicMessageSchema.safeParse(value);
  if (!parsed.success) {
    throw mapInvalidOutput(correlationId);
  }
  return parsed.data;
}

function isModelGatewayError(value: unknown): value is ModelGatewayError {
  return value instanceof ModelGatewayError;
}

/** Create a direct, non-retrying Anthropic Messages adapter. */
export function createAnthropicAdapter(options: AnthropicAdapterOptions): ProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;

  return {
    providerId: "anthropic",

    async generate(request): Promise<ProviderAdapterResult> {
      if (typeof options.apiKey !== "string" || options.apiKey.trim().length === 0) {
        throw createModelGatewayError("configuration_error", request.correlationId);
      }

      const body = buildRequestBody(request);
      let response: Response;
      try {
        response = await fetchImpl(ANTHROPIC_MESSAGES_ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": options.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body,
          signal: request.signal,
        });
      } catch (error) {
        throw mapProviderTransportError(error, request.correlationId);
      }

      if (!response.ok) {
        throw mapProviderResponseError(response, request.correlationId);
      }

      let envelope: unknown;
      try {
        envelope = await readBoundedJsonResponse(response);
      } catch (error) {
        if (isModelGatewayError(error)) throw error;
        if (error instanceof BoundedResponseError) {
          if (error.reason === "too_large") {
            throw mapInvalidOutput(request.correlationId);
          }
          throw mapProviderTransportError(error, request.correlationId);
        }
        // Malformed successful bodies are untrusted output. Never expose the parser message or
        // response body to the caller.
        throw mapInvalidOutput(request.correlationId);
      }

      try {
        const message = parseResponseBody(envelope, request.correlationId);
        const value = parseCandidate(message, request.correlationId);
        return {
          value,
          usage: normalizeUsage(message.usage),
          resolvedModel: message.model,
          requestId: boundedRequestId(response.headers),
        };
      } catch (error) {
        if (isModelGatewayError(error)) throw error;
        // Keep the adapter fail-closed if a future local parser changes unexpectedly. This catch
        // does not retain the parser's message, cause, or untrusted candidate.
        throw mapInvalidOutput(request.correlationId);
      }
    },
  };
}
