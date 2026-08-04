import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GEMINI_LIVE_PROVIDER_MODEL, OPENCODE_LIVE_PROVIDER_MODEL } from "./live-provider-contract";
import {
  formatLiveProviderUsage,
  isExactLiveProviderCandidate,
  isLiveProviderKeyPresent,
  LIVE_PROVIDER_CONTRACT_SCHEMA,
  missingLiveProviderKeys,
} from "./live-provider-contract.helpers";

describe("operator live provider contract helpers", () => {
  it("requires all three provider keys by name without exposing values", () => {
    const sentinel = "provider-secret-sentinel";
    const missing = missingLiveProviderKeys({
      GEMINI_API_KEY: "  ",
      OPENAI_API_KEY: sentinel,
    });

    expect(missing).toEqual(["GEMINI_API_KEY", "ANTHROPIC_API_KEY"]);
    expect(JSON.stringify(missing)).not.toContain(sentinel);
  });

  it("treats the OpenCode Go key as optional without exposing values", () => {
    const sentinel = "opencode-secret-sentinel";
    // The required-key gate never lists the optional key, whether present or not.
    expect(missingLiveProviderKeys({ OPENCODE_API_KEY: sentinel })).toEqual([
      "GEMINI_API_KEY",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
    ]);
    expect(missingLiveProviderKeys({})).toEqual([
      "GEMINI_API_KEY",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
    ]);

    expect(isLiveProviderKeyPresent({ OPENCODE_API_KEY: sentinel }, "OPENCODE_API_KEY")).toBe(true);
    expect(isLiveProviderKeyPresent({}, "OPENCODE_API_KEY")).toBe(false);
    expect(isLiveProviderKeyPresent({ OPENCODE_API_KEY: "  " }, "OPENCODE_API_KEY")).toBe(false);
  });

  it("accepts only the exact closed synthetic response", () => {
    expect(isExactLiveProviderCandidate({ ok: true })).toBe(true);
    expect(isExactLiveProviderCandidate({ ok: false })).toBe(true);
    expect(isExactLiveProviderCandidate({ ok: true, extra: false })).toBe(false);
    expect(isExactLiveProviderCandidate({ ok: "true" })).toBe(false);
    expect(isExactLiveProviderCandidate({})).toBe(false);
    expect(isExactLiveProviderCandidate([true])).toBe(false);
    expect(isExactLiveProviderCandidate(JSON.parse('{"__proto__":{},"ok":true}'))).toBe(false);
  });

  it("keeps the wire schema closed and usage output numeric-only", () => {
    expect(LIVE_PROVIDER_CONTRACT_SCHEMA).toEqual({
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false,
    });
    expect(formatLiveProviderUsage({ inputTokens: 11, outputTokens: 7, totalTokens: 18 })).toBe(
      "input_tokens=11 output_tokens=7 total_tokens=18",
    );
    expect(
      formatLiveProviderUsage({ inputTokens: null, outputTokens: Number.NaN, totalTokens: -1 }),
    ).toBe("input_tokens=unknown output_tokens=unknown total_tokens=unknown");
  });

  it("pins the Gemini probe to the evidence-backed stable model", () => {
    expect(GEMINI_LIVE_PROVIDER_MODEL).toBe("gemini-3.5-flash-lite");
  });

  it("pins the OpenCode Go probe to the staging subscription model", () => {
    expect(OPENCODE_LIVE_PROVIDER_MODEL).toBe("deepseek-v4-flash");
  });

  it("reaches the missing-key gate without making a provider request", () => {
    const environment = { ...process.env };
    for (const key of ["GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) {
      delete environment[key];
    }

    const result = spawnSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        path.join(process.cwd(), "scripts/live-provider-contract.ts"),
      ],
      { encoding: "utf8", env: environment },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "Missing provider API keys: GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY",
    );
    expect(result.stderr).not.toContain("provider_contract_failed");
  });
});
