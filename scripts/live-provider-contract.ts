import { pathToFileURL } from "node:url";

import { createAnthropicAdapter } from "../src/lib/model/providers/anthropic";
import { createGeminiAdapter } from "../src/lib/model/providers/gemini";
import { createOpenAIAdapter } from "../src/lib/model/providers/openai";
import { isModelGatewayError } from "../src/lib/model/errors";
import type { ProviderAdapter, ProviderAdapterResult } from "../src/lib/model/provider";
import {
  formatLiveProviderUsage,
  isExactLiveProviderCandidate,
  LIVE_PROVIDER_CONTRACT_INPUT,
  LIVE_PROVIDER_CONTRACT_SCHEMA,
  LIVE_PROVIDER_CONTRACT_SCHEMA_NAME,
  LIVE_PROVIDER_CONTRACT_SYSTEM_INSTRUCTION,
  LIVE_PROVIDER_CONTRACT_TIMEOUT_MS,
  missingLiveProviderKeys,
  type LiveProviderKeyName,
} from "./live-provider-contract.helpers";

interface LiveProviderSpec {
  readonly name: "gemini" | "openai" | "anthropic";
  readonly keyName: LiveProviderKeyName;
  readonly model: string;
  readonly createAdapter: (apiKey: string) => ProviderAdapter;
}

/** Stable Gemini model validated by the operator's exact structured probe. */
export const GEMINI_LIVE_PROVIDER_MODEL = "gemini-3.1-flash-lite";

const LIVE_PROVIDER_SPECS: readonly LiveProviderSpec[] = [
  {
    name: "gemini",
    keyName: "GEMINI_API_KEY",
    model: GEMINI_LIVE_PROVIDER_MODEL,
    createAdapter: (apiKey) => createGeminiAdapter({ apiKey }),
  },
  {
    name: "openai",
    keyName: "OPENAI_API_KEY",
    model: "gpt-5-nano",
    createAdapter: (apiKey) => createOpenAIAdapter({ apiKey }),
  },
  {
    name: "anthropic",
    keyName: "ANTHROPIC_API_KEY",
    model: "claude-haiku-4-5-20251001",
    createAdapter: (apiKey) => createAnthropicAdapter({ apiKey }),
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
    const apiKey = process.env[spec.keyName];
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      // The complete key check above should make this unreachable. Keep the guard fail-closed
      // without ever printing a value if the environment changes between checks.
      failures.push(spec.name);
      process.stderr.write(`FAIL ${spec.name} configuration_error\n`);
      continue;
    }

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
