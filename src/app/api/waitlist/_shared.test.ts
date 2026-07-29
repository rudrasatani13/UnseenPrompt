import { describe, expect, it, vi } from "vitest";

import { readJsonBody } from "@/app/api/waitlist/_shared";

function requestWithBody(
  chunks: string[],
  options: { readonly keepOpen?: boolean; readonly onCancel?: () => void } = {},
): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      if (!options.keepOpen) {
        controller.close();
      }
    },
    cancel() {
      options.onCancel?.();
    },
  });

  return {
    body,
    headers: new Headers({ "content-type": "application/json" }),
    text: vi.fn(async () => {
      throw new Error("readJsonBody must not buffer the request with request.text()");
    }),
  } as unknown as Request;
}

describe("readJsonBody", () => {
  it("parses JSON delivered across stream chunks", async () => {
    const request = requestWithBody(['{"email":"', 'person@example.com"}']);

    await expect(readJsonBody(request)).resolves.toEqual({
      ok: true,
      value: { email: "person@example.com" },
    });
    expect(request.text).not.toHaveBeenCalled();
  });

  it("cancels the stream as soon as the body exceeds 4 KiB", async () => {
    const onCancel = vi.fn();
    const request = requestWithBody(["x".repeat(4 * 1024), "x"], {
      keepOpen: true,
      onCancel,
    });

    const result = await readJsonBody(request);

    expect(result.ok).toBe(false);
    expect(request.text).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
