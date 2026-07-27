import { describe, expect, test, vi } from "vitest";

import { assertCloudflareDeployment } from "./assert-cloudflare-deployment.mjs";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("deployment verification", () => {
  test("rejects an expected release that is not a full lowercase commit SHA", async () => {
    await expect(
      assertCloudflareDeployment({
        deploymentUrl: "https://preview.example.test",
        expectedReleaseSha: "short-sha",
        fetchImpl: () => {
          throw new Error("fetch must not run");
        },
      }),
    ).rejects.toThrow("40-character lowercase commit SHA");
  });

  test("rejects a healthy deployment with the wrong release", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        service: "unseenprompt",
        status: "ok",
        release: "old-release",
      }),
    );

    await expect(
      assertCloudflareDeployment({
        deploymentUrl: "https://preview.example.test",
        expectedReleaseSha: "a".repeat(40),
        fetchImpl,
      }),
    ).rejects.toThrow("release mismatch");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("accepts a matching release and completed Workflow probe", async () => {
    const expectedReleaseSha = "b".repeat(40);
    const responses = [
      jsonResponse({ service: "unseenprompt", status: "ok", release: expectedReleaseSha }),
      jsonResponse({ status: "complete", output: { ok: true } }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);

    await assertCloudflareDeployment({
      deploymentUrl: "https://preview.example.test",
      expectedReleaseSha,
      healthcheckToken: "test-token",
      fetchImpl,
      sleep: async () => undefined,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
