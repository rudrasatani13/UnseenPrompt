import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const APP_URL = "https://app.unseenprompt.test";
const supabaseClient = vi.hoisted(() => ({ marker: "supabase-client" }));
const runtimeState = vi.hoisted(() => ({ appEnvironment: "local" as "local" | "production" }));
const getAuthenticatedContext = vi.hoisted(() => vi.fn());
const getSnapshot = vi.hoisted(() => vi.fn());
const createDiscoveryRuntime = vi.hoisted(() => vi.fn(() => ({ getSnapshot })));

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

const snapshot = {
  projectId: PROJECT_ID,
  mode: "new_build",
  stage: "discovery",
  stateVersion: 4,
  initialRequestText: "Build a field notebook.",
  session: {
    id: "33333333-3333-4333-8333-333333333333",
    projectId: PROJECT_ID,
    sourceDraftId: "44444444-4444-4444-8444-444444444444",
    status: "active",
    policyVersion: 1,
    activeQuestionId: null,
    latestAssessmentId: null,
    confirmedTurnCount: 1,
    blockCode: null,
    startedAt: "2026-08-04T00:00:00.000Z",
    completedAt: null,
    abandonedAt: null,
  },
  confirmedQuestions: [],
  confirmedAnswers: [],
  assessments: [],
  activeQuestion: null,
};

const context = { params: { projectId: PROJECT_ID } };

describe("GET /api/projects/[projectId]/discovery", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeState.appEnvironment = "local";
    getAuthenticatedContext
      .mockReset()
      .mockResolvedValue({ user: { id: USER_ID }, supabase: supabaseClient });
    createDiscoveryRuntime.mockClear();
    getSnapshot.mockReset().mockResolvedValue(snapshot);
  });

  it("closes production before auth and requires auth otherwise", async () => {
    runtimeState.appEnvironment = "production";
    const { GET } = await import("./route");
    expect((await GET(new Request(APP_URL), context)).status).toBe(404);
    expect(getAuthenticatedContext).not.toHaveBeenCalled();

    runtimeState.appEnvironment = "local";
    getAuthenticatedContext.mockResolvedValue(null);
    expect((await GET(new Request(APP_URL), context)).status).toBe(401);
  });

  it("requires auth before revealing unsupported methods", async () => {
    const route = await import("./route");
    for (const handler of [route.POST, route.PUT, route.PATCH, route.DELETE]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
    }
  });

  it("rejects malformed route IDs and keeps owner lookup in the service", async () => {
    const { GET } = await import("./route");
    const malformed = await GET(new Request(APP_URL), { params: { projectId: "not-a-uuid" } });
    expect(malformed.status).toBe(422);
    expect(getSnapshot).not.toHaveBeenCalled();

    const response = await GET(new Request(APP_URL), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createDiscoveryRuntime).toHaveBeenCalledWith(supabaseClient);
    expect(getSnapshot).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("maps owner-scoped not-found and unknown persistence failures without details", async () => {
    const { GET } = await import("./route");
    getSnapshot.mockRejectedValueOnce({ code: "discovery_not_found" });
    const missing = await GET(new Request(APP_URL), context);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: "not_found" } });

    getSnapshot.mockRejectedValueOnce(new Error("SQL detail with answer text"));
    const failed = await GET(new Request(APP_URL), context);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: { code: "provider_error" } });
  });
});
