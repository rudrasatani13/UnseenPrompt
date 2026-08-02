import "server-only";

import type { ModelUsage } from "@/domain/model/contracts";
import {
  createModelGatewayError,
  mapContentRefusal,
  mapInvalidOutput,
  mapOutputTruncation,
  mapProviderHttpStatus,
  mapProviderTransportError,
} from "@/lib/model/errors";
import { BoundedResponseError, readBoundedJsonResponse } from "@/lib/model/http";
import type {
  ProviderAdapter,
  ProviderAdapterRequest,
  ProviderAdapterResult,
  ProviderFetch,
} from "@/lib/model/provider";
import { z } from "zod";

const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com";
const GEMINI_GENERATE_CONTENT_PATH = "/v1beta/models/";
const MAX_RESPONSE_ID_LENGTH = 256;
const MAX_RESOLVED_MODEL_LENGTH = 160;

/** Options for the direct Gemini Developer API adapter. */
export interface GeminiAdapterOptions {
  readonly apiKey: string;
  readonly fetch?: ProviderFetch;
}

/**
 * These schemas deliberately describe only the provider envelope. The candidate remains unknown
 * until the gateway validates it against the operation's runtime Zod schema.
 */
const GeminiPartWireSchema = z
  .object({
    text: z.unknown().optional(),
  })
  .passthrough();

const GeminiContentWireSchema = z
  .object({
    parts: z.array(GeminiPartWireSchema).optional(),
  })
  .passthrough();

const GeminiCandidateWireSchema = z
  .object({
    content: GeminiContentWireSchema.optional(),
    finishReason: z.unknown().optional(),
  })
  .passthrough();

const GeminiUsageMetadataWireSchema = z
  .object({
    promptTokenCount: z.unknown().optional(),
    candidatesTokenCount: z.unknown().optional(),
    totalTokenCount: z.unknown().optional(),
  })
  .passthrough();

const GeminiPromptFeedbackWireSchema = z
  .object({
    blockReason: z.unknown().optional(),
  })
  .passthrough();

const GeminiResponseWireSchema = z
  .object({
    candidates: z.array(GeminiCandidateWireSchema).optional(),
    usageMetadata: GeminiUsageMetadataWireSchema.optional(),
    modelVersion: z.unknown().optional(),
    responseId: z.unknown().optional(),
    promptFeedback: GeminiPromptFeedbackWireSchema.optional(),
  })
  .passthrough();

type GeminiResponseWire = z.infer<typeof GeminiResponseWireSchema>;

function normalizeTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeBoundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (normalized.length === 0) return null;
  return normalized.slice(0, maximum);
}

function normalizeUsage(value: GeminiResponseWire["usageMetadata"]): ModelUsage {
  return {
    inputTokens: normalizeTokenCount(value?.promptTokenCount),
    outputTokens: normalizeTokenCount(value?.candidatesTokenCount),
    totalTokens: normalizeTokenCount(value?.totalTokenCount),
  };
}

function normalizeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length === 0 ? null : normalized;
}

function isBlockedPromptFeedback(value: unknown): boolean {
  const reason = normalizeReason(value);
  return reason !== null && reason !== "BLOCK_REASON_UNSPECIFIED";
}

function isRefusalFinishReason(value: unknown): boolean {
  const reason = normalizeReason(value);
  if (reason === null) return false;
  return (
    reason === "SAFETY" ||
    reason === "SPII" ||
    reason === "RECITATION" ||
    reason === "LANGUAGE" ||
    reason.includes("SAFETY") ||
    reason.includes("PROHIBITED") ||
    reason.includes("BLOCK")
  );
}

function mapHttpError(response: Response, correlationId: string): never {
  // Gemini documents RESOURCE_EXHAUSTED/HTTP 429 as a rate-limit condition. Keep the shared
  // status mapping authoritative so the gateway can apply its one bounded retry/backoff; error
  // bodies are untrusted and must not influence classification or be read on this path.
  throw mapProviderHttpStatus(response.status, correlationId, response.headers);
}

function mapBodyReadError(error: unknown, correlationId: string): never {
  if (error instanceof BoundedResponseError && error.reason === "aborted") {
    throw createModelGatewayError("aborted", correlationId);
  }
  throw mapInvalidOutput(correlationId);
}

function parseCandidateValue(
  payload: GeminiResponseWire,
  correlationId: string,
): { readonly value: unknown; readonly finishReason: string } {
  if (isBlockedPromptFeedback(payload.promptFeedback?.blockReason)) {
    throw mapContentRefusal(correlationId);
  }

  if (payload.candidates === undefined || payload.candidates.length !== 1) {
    throw mapInvalidOutput(correlationId);
  }

  const candidate = payload.candidates[0];
  if (candidate === undefined) {
    throw mapInvalidOutput(correlationId);
  }
  if (isRefusalFinishReason(candidate.finishReason)) {
    throw mapContentRefusal(correlationId);
  }

  const finishReason = normalizeReason(candidate.finishReason);
  if (finishReason === "MAX_TOKENS") {
    throw mapOutputTruncation(correlationId);
  }
  if (finishReason !== "STOP") {
    throw mapInvalidOutput(correlationId);
  }

  const parts = candidate.content?.parts;
  if (parts === undefined || parts.length !== 1) {
    throw mapInvalidOutput(correlationId);
  }

  const text = parts[0]?.text;
  if (typeof text !== "string") {
    throw mapInvalidOutput(correlationId);
  }

  // Candidate JSON is intentionally left as raw text. The gateway owns JSON parsing and schema
  // validation so one structured repair can receive the rejected candidate without another
  // provider call being hidden inside this adapter.
  return { value: text, finishReason };
}

/** Build the fixed Gemini Developer API generateContent endpoint. */
function buildEndpoint(model: string): string {
  return `${GEMINI_ORIGIN}${GEMINI_GENERATE_CONTENT_PATH}${encodeURIComponent(model)}:generateContent`;
}

/**
 * Direct, non-streaming Gemini Developer API adapter. The adapter intentionally owns no retry,
 * logging, persistence, or operation-schema validation policy; those belong to the gateway.
 */
export function createGeminiAdapter(options: GeminiAdapterOptions): ProviderAdapter {
  const runtimeOptions = options as unknown as
    { readonly apiKey?: unknown; readonly fetch?: unknown } | null | undefined;
  const apiKey = runtimeOptions?.apiKey;
  const fetchImpl =
    typeof runtimeOptions?.fetch === "function"
      ? (runtimeOptions.fetch as ProviderFetch)
      : globalThis.fetch;

  return {
    providerId: "gemini",

    async generate(request: ProviderAdapterRequest): Promise<ProviderAdapterResult> {
      if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
        throw createModelGatewayError("configuration_error", request.correlationId);
      }

      const payload = {
        systemInstruction: {
          parts: [{ text: request.systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: request.input }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: request.outputSchema,
          maxOutputTokens: request.maxOutputTokens,
        },
      };

      let body: string;
      try {
        body = JSON.stringify(payload);
      } catch {
        throw createModelGatewayError("invalid_provider_request", request.correlationId);
      }

      let response: Response;
      try {
        response = await fetchImpl(buildEndpoint(request.model), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body,
          signal: request.signal,
        });
      } catch (error) {
        throw mapProviderTransportError(error, request.correlationId);
      }

      if (!response.ok) {
        return mapHttpError(response, request.correlationId);
      }

      let rawPayload: unknown;
      try {
        rawPayload = await readBoundedJsonResponse(response);
      } catch (error) {
        return mapBodyReadError(error, request.correlationId);
      }

      const parsed = GeminiResponseWireSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw mapInvalidOutput(request.correlationId);
      }

      const candidate = parseCandidateValue(parsed.data, request.correlationId);
      const usage = normalizeUsage(parsed.data.usageMetadata);
      const modelVersion = normalizeBoundedString(
        parsed.data.modelVersion,
        MAX_RESOLVED_MODEL_LENGTH,
      );
      const requestId = normalizeBoundedString(parsed.data.responseId, MAX_RESPONSE_ID_LENGTH);

      return {
        value: candidate.value,
        usage,
        resolvedModel: modelVersion ?? request.model,
        requestId,
      };
    },
  };
}
