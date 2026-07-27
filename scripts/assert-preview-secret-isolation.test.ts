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
    const fetchImpl = vi.fn(async () => apiResponse([{ id: "unseenprompt-staging" }]));

    await expect(
      verifyPreviewSecretIsolation({
        accountId: "account-id",
        apiToken: "api-token",
        fetchImpl,
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
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
