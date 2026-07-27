import { describe, expect, test, vi } from "vitest";

import {
  assertPreviewSecretIsolation,
  verifyPreviewSecretIsolation,
} from "./assert-preview-secret-isolation.mjs";

const apiResponse = (result: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      errors: [],
      messages: [],
      success: status >= 200 && status < 300,
      result,
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );

describe("preview Worker secret isolation", () => {
  test("accepts a preview Worker with no secret bindings", () => {
    expect(() => assertPreviewSecretIsolation("[]")).not.toThrow();
  });

  test("rejects any secret bound to the preview Worker", () => {
    expect(() =>
      assertPreviewSecretIsolation(
        JSON.stringify([{ name: "HEALTHCHECK_TOKEN", type: "secret_text" }]),
      ),
    ).toThrow("must not have secret bindings");
  });

  test("accepts a new account where the preview Worker does not exist yet", async () => {
    const fetchImpl = vi.fn(async () => apiResponse([{ id: "another-preview-worker" }]));

    await expect(
      verifyPreviewSecretIsolation({
        accountId: "account-id",
        apiToken: "api-token",
        fetchImpl,
        protectedAccountIds: ["staging-account", "production-account"],
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("checks secret bindings when the preview Worker exists", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(apiResponse([{ id: "unseenprompt-preview" }]))
      .mockResolvedValueOnce(apiResponse([]));

    await expect(
      verifyPreviewSecretIsolation({
        accountId: "account-id",
        apiToken: "api-token",
        fetchImpl,
        protectedAccountIds: ["staging-account", "production-account"],
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("rejects a preview credential configured for a protected account", async () => {
    await expect(
      verifyPreviewSecretIsolation({
        accountId: "shared-account",
        apiToken: "api-token",
        fetchImpl: vi.fn(),
        protectedAccountIds: ["shared-account", "production-account"],
      }),
    ).rejects.toThrow("must differ from staging and production");
  });

  test("rejects an account that already contains a protected Worker", async () => {
    const fetchImpl = vi.fn(async () =>
      apiResponse([{ id: "unseenprompt-production" }, { id: "unseenprompt-preview" }]),
    );

    await expect(
      verifyPreviewSecretIsolation({
        accountId: "preview-account",
        apiToken: "api-token",
        fetchImpl,
        protectedAccountIds: ["staging-account", "production-account"],
      }),
    ).rejects.toThrow("contains protected Worker unseenprompt-production");
  });
});
