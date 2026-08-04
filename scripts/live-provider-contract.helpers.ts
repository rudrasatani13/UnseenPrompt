import type { ModelUsage } from "../src/domain/model/contracts";
import type { ProviderJsonSchema } from "../src/domain/model/json-schema";

/** The only schema accepted by the operator-only live provider probe. */
export const LIVE_PROVIDER_CONTRACT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
  },
  required: ["ok"],
  additionalProperties: false,
} as const satisfies ProviderJsonSchema;

export const LIVE_PROVIDER_CONTRACT_SCHEMA_NAME = "live_provider_contract_v1";
export const LIVE_PROVIDER_CONTRACT_SYSTEM_INSTRUCTION =
  "Return only the JSON object required by the schema.";
export const LIVE_PROVIDER_CONTRACT_INPUT =
  "This is a synthetic operator contract probe. Return ok=true.";
export const LIVE_PROVIDER_CONTRACT_TIMEOUT_MS = 30_000;

export const LIVE_PROVIDER_KEY_NAMES = [
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

/**
 * Subscription-gated keys probed only when an operator provides them. A missing optional key
 * skips the probe instead of failing it, so CI and local environments without the subscription
 * keep passing.
 */
export const OPTIONAL_LIVE_PROVIDER_KEY_NAMES = ["OPENCODE_API_KEY"] as const;

export type LiveProviderKeyName = (typeof LIVE_PROVIDER_KEY_NAMES)[number];
export type OptionalLiveProviderKeyName = (typeof OPTIONAL_LIVE_PROVIDER_KEY_NAMES)[number];

/**
 * Return missing key names only. Values are intentionally never returned so this helper can be
 * used by command-line diagnostics without risking secret exposure.
 */
export function missingLiveProviderKeys(
  environment: Readonly<Record<string, string | undefined>>,
): readonly LiveProviderKeyName[] {
  return LIVE_PROVIDER_KEY_NAMES.filter((name) => {
    const value = environment[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

/** True when the named key holds a non-blank value; never exposes the value itself. */
export function isLiveProviderKeyPresent(
  environment: Readonly<Record<string, string | undefined>>,
  name: LiveProviderKeyName | OptionalLiveProviderKeyName,
): boolean {
  const value = environment[name];
  return typeof value === "string" && value.trim().length > 0;
}

/** Validate the exact closed `{ ok: boolean }` response expected from every live provider. */
export function isExactLiveProviderCandidate(value: unknown): value is { readonly ok: boolean } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  return (
    keys.length === 1 &&
    keys[0] === "ok" &&
    Object.prototype.hasOwnProperty.call(candidate, "ok") &&
    typeof candidate.ok === "boolean"
  );
}

/**
 * Format usage metadata for a safe one-line result. Provider responses are untrusted, so only
 * finite non-negative integers are emitted; all other values become `unknown`.
 */
export function formatLiveProviderUsage(usage: ModelUsage): string {
  const format = (value: number | null): string =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : "unknown";

  return `input_tokens=${format(usage.inputTokens)} output_tokens=${format(usage.outputTokens)} total_tokens=${format(usage.totalTokens)}`;
}
