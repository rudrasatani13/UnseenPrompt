import { pathToFileURL } from "node:url";

import { createAnthropicAdapter } from "../src/lib/model/providers/anthropic";
import { createGeminiAdapter } from "../src/lib/model/providers/gemini";
import { createOpenAIAdapter } from "../src/lib/model/providers/openai";
import { createOpenCodeAdapter } from "../src/lib/model/providers/opencode";
import { isModelGatewayError } from "../src/lib/model/errors";
import type { ProviderAdapter, ProviderAdapterResult } from "../src/lib/model/provider";
import {
  formatLiveProviderUsage,
  isExactLiveProviderCandidate,
  isLiveProviderKeyPresent,
  LIVE_PROVIDER_CONTRACT_INPUT,
  LIVE_PROVIDER_CONTRACT_SCHEMA,
  LIVE_PROVIDER_CONTRACT_SCHEMA_NAME,
  LIVE_PROVIDER_CONTRACT_SYSTEM_INSTRUCTION,
  LIVE_PROVIDER_CONTRACT_TIMEOUT_MS,
  missingLiveProviderKeys,
  type LiveProviderKeyName,
  type OptionalLiveProviderKeyName,
} from "./live-provider-contract.helpers";

interface LiveProviderSpec {
  readonly name: "gemini" | "openai" | "anthropic" | "opencode";
  readonly keyName: LiveProviderKeyName | OptionalLiveProviderKeyName;
  readonly model: string;
  readonly optional: boolean;
  readonly createAdapter: (apiKey: string) => ProviderAdapter;
}

/** Stable Gemini model validated by the operator's exact structured probe. */
export const GEMINI_LIVE_PROVIDER_MODEL = "gemini-3.5-flash-lite";

/** OpenCode Go route validated when an operator supplies the subscription key. */
export const OPENCODE_LIVE_PROVIDER_MODEL = "deepseek-v4-flash";

const LIVE_PROVIDER_SPECS: readonly LiveProviderSpec[] = [
  {
    name: "gemini",
    keyName: "GEMINI_API_KEY",
    model: GEMINI_LIVE_PROVIDER_MODEL,
    optional: false,
    createAdapter: (apiKey) => createGeminiAdapter({ apiKey }),
  },
  {
    name: "openai",
    keyName: "OPENAI_API_KEY",
    model: "gpt-5.6-luna",
    optional: false,
    createAdapter: (apiKey) => createOpenAIAdapter({ apiKey }),
  },
  {
    name: "anthropic",
    keyName: "ANTHROPIC_API_KEY",
    model: "claude-sonnet-5",
    optional: false,
    createAdapter: (apiKey) => createAnthropicAdapter({ apiKey }),
  },
  {
    name: "opencode",
    keyName: "OPENCODE_API_KEY",
    model: OPENCODE_LIVE_PROVIDER_MODEL,
    optional: true,
    createAdapter: (apiKey) => createOpenCodeAdapter({ apiKey }),
  },
];

function parseCandidate(result: ProviderAdapterResult): { readonly ok: boolean } {
  if (typeof result.value !== "string") {
    throw new Error("invalid_output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.value) as unknown;
  } catch {
    throw new Error("invalid_output");
  }

  if (!isExactLiveProviderCandidate(parsed)) {
    throw new Error("invalid_output");
  }

  return parsed;
}

function safeFailureCode(error: unknown): string {
  if (isModelGatewayError(error)) return error.code;
  return error instanceof Error && error.message === "invalid_output"
    ? "invalid_output"
    : "provider_error";
}

function correlationId(): string {
  return globalThis.crypto.randomUUID();
}

async function probeProvider(spec: LiveProviderSpec, apiKey: string): Promise<void> {
  const result = await spec.createAdapter(apiKey).generate({
    model: spec.model,
    systemInstruction: LIVE_PROVIDER_CONTRACT_SYSTEM_INSTRUCTION,
    input: LIVE_PROVIDER_CONTRACT_INPUT,
    outputSchema: LIVE_PROVIDER_CONTRACT_SCHEMA,
    outputSchemaName: LIVE_PROVIDER_CONTRACT_SCHEMA_NAME,
    // Keep the request large enough for reasoning-capable models while bounding worst-case cost.
    maxOutputTokens: 512,
    correlationId: correlationId(),
    signal: AbortSignal.timeout(LIVE_PROVIDER_CONTRACT_TIMEOUT_MS),
  });

  parseCandidate(result);
  process.stdout.write(`PASS ${spec.name} ${formatLiveProviderUsage(result.usage)}\n`);
}

async function main(): Promise<void> {
  const missing = missingLiveProviderKeys(process.env);
  if (missing.length > 0) {
    process.stderr.write(`Missing provider API keys: ${missing.join(", ")}\n`);
    process.exitCode = 1;
    return;
  }

  const failures: string[] = [];

  // Keep calls deliberately sequential and one-shot. This command is an operator check, not the
  // gateway: it must not retry or route around one provider's result.
  for (const spec of LIVE_PROVIDER_SPECS) {
    if (!isLiveProviderKeyPresent(process.env, spec.keyName)) {
      if (spec.optional) {
        // Optional subscription providers are skipped, not failed, so environments without the
        // key keep the probe green. Only the key name is printed, never a value.
        process.stdout.write(`SKIP ${spec.name} ${spec.keyName} not provided\n`);
        continue;
      }
      // The complete key check above should make this unreachable. Keep the guard fail-closed
      // without ever printing a value if the environment changes between checks.
      failures.push(spec.name);
      process.stderr.write(`FAIL ${spec.name} configuration_error\n`);
      continue;
    }

    const apiKey = process.env[spec.keyName] as string;

    try {
      await probeProvider(spec, apiKey);
    } catch (error: unknown) {
      failures.push(spec.name);
      process.stderr.write(`FAIL ${spec.name} ${safeFailureCode(error)}\n`);
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    // Never print arbitrary exceptions: unexpected adapter/runtime details could include an
    // untrusted response body or other sensitive context.
    void error;
    process.stderr.write("provider_contract_failed\n");
    process.exitCode = 1;
  });
}
