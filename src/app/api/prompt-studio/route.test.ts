import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const APP_URL = "https://app.unseenprompt.test";
const runtimeState = vi.hoisted(() => ({
  appEnvironment: "local" as "local" | "production" | "staging",
  model: {
    provider: "opencode",
    model: "deepseek-v4-flash",
  } as { provider: string; model: string },
}));
const getAuthenticatedContext = vi.hoisted(() => vi.fn());
const getServerModelEnvironment = vi.hoisted(() => vi.fn());
const getServerEnvironment = vi.hoisted(() => vi.fn());
const generate = vi.hoisted(() => vi.fn());

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => getServerEnvironment(),
}));
vi.mock("@/config/model/server", () => ({
  getServerModelEnvironment: () => getServerModelEnvironment(),
}));
vi.mock("@/lib/supabase/require-user", () => ({ getAuthenticatedContext }));
vi.mock("@/lib/model/providers/opencode", () => ({
  createOpenCodeAdapter: () => ({ providerId: "opencode", generate }),
}));
vi.mock("@/lib/model/providers/gemini", () => ({
  createGeminiAdapter: () => ({ providerId: "gemini", generate }),
}));
vi.mock("@/lib/model/providers/openai", () => ({
  createOpenAIAdapter: () => ({ providerId: "openai", generate }),
}));
vi.mock("@/lib/model/providers/anthropic", () => ({
  createAnthropicAdapter: () => ({ providerId: "anthropic", generate }),
}));

function environmentFor(appEnv: "local" | "production" | "staging") {
  return {
    APP_ENV: appEnv,
    NEXT_PUBLIC_APP_URL: APP_URL,
    RELEASE_SHA: "test",
    MAINTENANCE_MODE: "off",
  };
}

function modelEnvironment() {
  return {
    apiKeys: { opencode: "sk-test" },
    primary: {
      provider: runtimeState.model.provider,
      model: runtimeState.model.model,
      inputCostMicrosPerMillionTokens: 1,
      outputCostMicrosPerMillionTokens: 1,
    },
    fallback: {
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      inputCostMicrosPerMillionTokens: 1,
      outputCostMicrosPerMillionTokens: 1,
    },
    reviewer: null,
    totalDeadlineMs: 30_000,
    attemptTimeoutMs: 12_000,
    maxOutputTokens: 4_096,
    budgets: Object.freeze({
      productionCalls: 3,
      transportRetries: 1,
      repairs: 1,
      fallbackEntries: 1,
      reviewerCalls: 1,
      absoluteCalls: 4,
    }),
  };
}

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP_URL}/api/prompt-studio`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_URL, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/prompt-studio", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "local";
    runtimeState.model = { provider: "opencode", model: "deepseek-v4-flash" };
    getServerEnvironment.mockReset().mockReturnValue(environmentFor("local"));
    getServerModelEnvironment.mockReset().mockReturnValue(modelEnvironment());
    getAuthenticatedContext.mockReset().mockResolvedValue({ user: { id: USER_ID }, supabase: {} });
    generate.mockReset();
  });

  it("returns an intent for a valid prompt", async () => {
    generate.mockResolvedValue({
      value: JSON.stringify({
        mode: "new_build",
        confidence: 0.95,
        rationale: "Build a coffee website from scratch.",
        detectedLanguage: "en",
      }),
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      resolvedModel: "deepseek-v4-flash",
      requestId: "req-1",
    });
    const { POST } = await import("./route");

    const response = await POST(postRequest({ prompt: "I want to build a coffee website" }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { readonly intent?: { readonly mode?: string } };
    expect(payload.intent?.mode).toBe("new_build");
  });

  it("rejects anonymous requests", async () => {
    getAuthenticatedContext.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(postRequest({ prompt: "hello" }));

    expect(response.status).toBe(401);
  });

  it("rejects invalid payloads", async () => {
    const { POST } = await import("./route");

    expect((await POST(postRequest({ prompt: "" }))).status).toBe(422);
    expect((await POST(postRequest({ prompt: 42 }))).status).toBe(422);
  });

  it("closes the surface in production", async () => {
    runtimeState.appEnvironment = "production";
    getServerEnvironment.mockReturnValue(environmentFor("production"));
    const { POST } = await import("./route");

    const response = await POST(postRequest({ prompt: "hello" }));

    expect(response.status).toBe(404);
    expect(getAuthenticatedContext).not.toHaveBeenCalled();
  });
});
