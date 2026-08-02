import "server-only";

import type { ModelUsage } from "@/domain/model/contracts";
import type { ProviderJsonSchema } from "@/domain/model/json-schema";

/** Provider identifiers are an infrastructure concern and must not enter the domain layer. */
export const PROVIDER_IDS = ["anthropic", "openai", "gemini"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** The operator-configured route used by the gateway and its cost estimator. */
export interface ProviderRoute {
  readonly provider: ProviderId;
  readonly model: string;
  /** Estimated input price in micros per one million reported input tokens. */
  readonly inputCostMicrosPerMillionTokens: number;
  /** Estimated output price in micros per one million reported output tokens. */
  readonly outputCostMicrosPerMillionTokens: number;
}

/**
 * The small common request sent to every direct REST adapter. Provider wire payloads are built
 * inside the adapter and are never represented by this contract.
 */
export interface ProviderAdapterRequest {
  readonly model: string;
  readonly systemInstruction: string;
  readonly input: string;
  readonly outputSchema: ProviderJsonSchema;
  readonly outputSchemaName: string;
  readonly maxOutputTokens: number;
  readonly correlationId: string;
  readonly signal: AbortSignal;
}

/** The untrusted candidate returned by an adapter before gateway schema validation. */
export interface ProviderAdapterResult {
  readonly value: unknown;
  readonly usage: ModelUsage;
  readonly resolvedModel: string;
  readonly requestId: string | null;
}

/**
 * Provider-neutral adapter port. Adapters must not retry, log, or persist provider payloads; the
 * gateway owns those policies.
 */
export interface ProviderAdapter {
  readonly providerId: ProviderId;
  generate(request: ProviderAdapterRequest): Promise<ProviderAdapterResult>;
}

/** Fetch is injected by concrete adapters in tests; production uses the Workers global fetch. */
export type ProviderFetch = typeof fetch;
