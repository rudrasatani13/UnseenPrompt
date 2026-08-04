import { describe, expect, it } from "vitest";

import { readProductJsonBody } from "./product-json";

function request(contentType: string, body: BodyInit = '{"ok":true}'): Request {
  return new Request("https://app.unseenprompt.test/api/product", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

describe("readProductJsonBody", () => {
  it.each([
    "application/json",
    "APPLICATION/JSON",
    " application/json ",
    "application/json; charset=utf-8",
    'application/json ; charset=UTF-8; profile="v1"',
    'application/json; profile="json,strict"',
  ])("accepts a valid JSON media type: %s", async (contentType) => {
    const result = await readProductJsonBody(request(contentType));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ ok: true });
  });

  it.each([
    "application/jsonp",
    "application/json, text/plain",
    "application/json; charset=utf-8, application/json",
    "application/json; charset",
    "application/json; charset=",
    "application/json; charset = utf-8",
    "application/json; charset=utf-8; CHARSET=UTF-8",
    'application/json; charset="utf-8',
    "application/json;; charset=utf-8",
    "application/json/extra",
    "text/application/json",
  ])("rejects a malformed or smuggled media type: %s", async (contentType) => {
    const result = await readProductJsonBody(request(contentType));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(422);
  });

  it("retains the fatal UTF-8 and 64 KiB body guards", async () => {
    const invalidUtf8 = new Request("https://app.unseenprompt.test/api/product", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0xc3, 0x28]),
    });
    const invalid = await readProductJsonBody(invalidUtf8);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.response.status).toBe(422);

    const oversized = await readProductJsonBody(
      request("application/json", JSON.stringify("a".repeat(64 * 1024))),
    );
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.response.status).toBe(413);
  });
});
