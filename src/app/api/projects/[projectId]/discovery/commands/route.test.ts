import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const QUESTION_ID = "33333333-3333-4333-8333-333333333333";
const APP_URL = "https://app.unseenprompt.test";
const supabaseClient = vi.hoisted(() => ({ marker: "supabase-client" }));
const runtimeState = vi.hoisted(() => ({ appEnvironment: "local" as "local" | "production" }));
const getAuthenticatedContext = vi.hoisted(() => vi.fn());
const advance = vi.hoisted(() => vi.fn());
const executeCommand = vi.hoisted(() => vi.fn());
const createDiscoveryRuntime = vi.hoisted(() => vi.fn(() => ({ advance, executeCommand })));

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => ({
    APP_ENV: runtimeState.appEnvironment,
    NEXT_PUBLIC_APP_URL: APP_URL,
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  }),
}));
vi.mock("@/lib/supabase/require-user", () => ({ getAuthenticatedContext }));
vi.mock("@/lib/discovery/runtime", () => ({ createDiscoveryRuntime }));

const advanceResult = {
  status: "question",
  snapshot: { projectId: PROJECT_ID, stateVersion: 5, activeQuestion: { id: QUESTION_ID } },
};
const commandResult = {
  projectId: PROJECT_ID,
  stateVersion: 6,
  eventId: "44444444-4444-4444-8444-444444444444",
  replayed: false,
};

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP_URL}/api/projects/${PROJECT_ID}/discovery/commands`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_URL, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody(
  command: unknown = { type: "advance_discovery" },
  overrides: Record<string, unknown> = {},
) {
  return {
    schema: "unseenprompt.discovery-command",
    schemaVersion: 1,
    projectId: PROJECT_ID,
    expectedStateVersion: 4,
    idempotencyKey: "discovery-key-1",
    command,
    ...overrides,
  };
}

const context = { params: { projectId: PROJECT_ID } };

describe("POST /api/projects/[projectId]/discovery/commands", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "local";
    getAuthenticatedContext
      .mockReset()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
    createDiscoveryRuntime.mockClear();
    advance.mockReset().mockResolvedValue(advanceResult);
    executeCommand.mockReset().mockResolvedValue(commandResult);
  });

  it("runs the product gate before auth and gates unsupported methods", async () => {
    runtimeState.appEnvironment = "production";
    const { POST } = await import("./route");
    expect((await POST(postRequest(validBody()), context)).status).toBe(404);
    expect(getAuthenticatedContext).not.toHaveBeenCalled();

    runtimeState.appEnvironment = "local";
    getAuthenticatedContext.mockResolvedValue(null);
    expect((await POST(postRequest(validBody()), context)).status).toBe(401);

    getAuthenticatedContext.mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
    const route = await import("./route");
    for (const handler of [route.GET, route.PUT, route.PATCH, route.DELETE]) {
      expect((await handler()).status).toBe(405);
    }
  });

  it("validates origin, content type, body size, path identity, and command unions", async () => {
    const { POST } = await import("./route");

    expect(
      (await POST(postRequest(validBody(), { origin: "https://evil.example" }), context)).status,
    ).toBe(403);
    expect(
      (await POST(postRequest(validBody(), { "content-type": "text/plain" }), context)).status,
    ).toBe(422);
    expect(
      (
        await POST(
          postRequest(
            validBody({
              type: "confirm_answer",
              questionId: QUESTION_ID,
              source: "free_text",
              answerText: "a".repeat(64 * 1024),
            }),
          ),
          context,
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await POST(
          postRequest({ ...validBody(), projectId: "55555555-5555-4555-8555-555555555555" }),
          context,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await POST(
          postRequest({ ...validBody(), command: { type: "advance_discovery", extra: true } }),
          context,
        )
      ).status,
    ).toBe(422);
    expect(advance).not.toHaveBeenCalled();
  });

  it("uses the orchestration advance path with cancellation/deadline and returns replay DTOs", async () => {
    const { POST } = await import("./route");
    const request = postRequest(validBody());
    const response = await POST(request, context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(advanceResult);
    expect(advance).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      idempotencyKey: "discovery-key-1",
      signal: request.signal,
      deadlineMs: 30_000,
    });
    expect(executeCommand).not.toHaveBeenCalled();

    advance.mockResolvedValueOnce({ ...advanceResult, status: "sufficient" });
    expect(
      (
        await POST(
          postRequest(
            validBody({ type: "advance_discovery" }, { idempotencyKey: "discovery-key-2" }),
          ),
          context,
        )
      ).status,
    ).toBe(200);
  });

  it("sends non-advance commands to the service and maps safe failures", async () => {
    const { POST } = await import("./route");
    const body = validBody({
      type: "confirm_answer",
      questionId: QUESTION_ID,
      source: "suggested",
      answerText: "offline",
    });
    const response = await POST(postRequest(body), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(commandResult);
    expect(executeCommand).toHaveBeenCalledWith(body);

    executeCommand.mockRejectedValueOnce({ code: "idempotency_in_progress" });
    const running = await POST(
      postRequest({ ...body, idempotencyKey: "discovery-key-2" }),
      context,
    );
    expect(running.status).toBe(409);
    expect(running.headers.get("retry-after")).toBe("1");
    expect(await running.json()).toEqual({ error: { code: "conflict" } });

    executeCommand.mockRejectedValueOnce({ code: "rate_limited" });
    const limited = await POST(
      postRequest({ ...body, idempotencyKey: "discovery-key-3" }),
      context,
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("1");
  });
});
