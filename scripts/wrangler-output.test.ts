import { describe, expect, test } from "vitest";

import {
  parseWranglerEvents,
  resolveDeploymentUrl,
  resolvePreviewUrl,
  resolveVersionId,
} from "./wrangler-output.mjs";

describe("Wrangler output parsing", () => {
  test("resolves the preview alias emitted by Wrangler 4.114.0", () => {
    const events = parseWranglerEvents(
      '{"type":"version-upload","preview_url":"https://version.example.workers.dev","preview_alias_url":"https://pr-42.example.workers.dev"}\n',
    );
    expect(resolvePreviewUrl(events)).toBe("https://pr-42.example.workers.dev");
  });

  test("falls back to Wrangler's singular preview URL", () => {
    expect(
      resolvePreviewUrl([
        { type: "version-upload", preview_url: "https://version.example.workers.dev" },
      ]),
    ).toBe("https://version.example.workers.dev");
  });

  test("resolves string deployment targets", () => {
    expect(
      resolveDeploymentUrl([{ type: "deploy", targets: ["https://staging.example.workers.dev"] }]),
    ).toBe("https://staging.example.workers.dev");
  });

  test("rejects non-HTTPS and missing deployment URLs", () => {
    expect(() =>
      resolveDeploymentUrl([{ type: "deploy", targets: ["http://example.test"] }]),
    ).toThrow("must use HTTPS");
    expect(() => resolveDeploymentUrl([{ type: "deploy", targets: [] }])).toThrow("did not report");
  });

  test("rejects line breaks that could inject GitHub outputs", () => {
    expect(() =>
      resolvePreviewUrl([
        {
          type: "version-upload",
          preview_url: "https://preview.example.test/\nforged=value",
        },
      ]),
    ).toThrow("must not contain line breaks");
  });

  test("resolves production version IDs", () => {
    expect(resolveVersionId([{ type: "version-upload", version_id: "version-123" }])).toBe(
      "version-123",
    );
  });
});
