import { beforeEach, describe, expect, it, vi } from "vitest";

const createBatch = vi.fn();
const get = vi.fn();
const status = vi.fn();

vi.mock("@/lib/cloudflare/context", () => ({
  getRuntimeBindings: () => ({
    version: "local",
    workflow: {
      createBatch,
      get,
    },
  }),
}));

const VALID_TOKEN = "a".repeat(32);

describe("POST /api/internal/health/workflow", () => {
  beforeEach(() => {
    vi.resetModules();
    createBatch.mockReset();
    get.mockReset();
    status.mockReset();
    process.env.HEALTHCHECK_TOKEN = VALID_TOKEN;
  });

  async function post(headers: HeadersInit): Promise<Response> {
    const { POST } = await import("./route");
    return POST(
      new Request("http://localhost/api/internal/health/workflow", {
        method: "POST",
        headers,
      }),
    );
  }

  it("returns 401 when authorization is missing", async () => {
    const response = await post({});
    expect(response.status).toBe(401);
  });

  it("returns 401 when the scheme is not Bearer", async () => {
    const response = await post({ Authorization: `Token ${VALID_TOKEN}` });
    expect(response.status).toBe(401);
  });

  it("returns 401 when the token is wrong", async () => {
    const response = await post({ Authorization: `Bearer ${"b".repeat(32)}` });
    expect(response.status).toBe(401);
  });

  it("creates a deterministic Workflow probe with a valid token", async () => {
    status.mockResolvedValue({ status: "complete", output: { ok: true } });
    createBatch.mockResolvedValue([{ status }]);

    const response = await post({
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Idempotency-Key": "test-probe-0001",
    });

    expect(createBatch).toHaveBeenCalledWith([
      {
        id: "health-test-probe-0001",
        params: { requestId: "health-test-probe-0001" },
      },
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      id: "health-test-probe-0001",
      status: "complete",
      output: { ok: true },
    });
  });

  it("reuses an existing instance when createBatch skips the ID", async () => {
    status.mockResolvedValue({ status: "running", output: null });
    createBatch.mockResolvedValue([]);
    get.mockResolvedValue({ status });

    const response = await post({
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Idempotency-Key": "test-probe-0001",
    });

    expect(get).toHaveBeenCalledWith("health-test-probe-0001");
    expect(response.status).toBe(202);
  });

  it("never returns the health token in the body", async () => {
    status.mockResolvedValue({ status: "complete", output: { ok: true } });
    createBatch.mockResolvedValue([{ status }]);

    const response = await post({
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Idempotency-Key": "test-probe-0001",
    });
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain(VALID_TOKEN);
    expect(serialized).not.toContain("HEALTHCHECK_TOKEN");
  });
});
