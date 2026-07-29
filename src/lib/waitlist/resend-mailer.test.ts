import { describe, expect, it, vi } from "vitest";

import { createResendMailer } from "@/lib/waitlist/resend-mailer";

const options = {
  apiKey: "re_local_test_value_0000000000000000",
  fromEmail: "UnseenPrompt <hello@unseenprompt.com>" as const,
  appOrigin: "https://unseenprompt.com",
};

const input = {
  email: "person@example.com",
  confirmationUrl: "https://unseenprompt.com/waitlist/confirm#token=abc",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
};

describe("createResendMailer", () => {
  it("sends the approved payload with Idempotency-Key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "msg" }), { status: 200 }));
    const mailer = createResendMailer({ ...options, fetchImpl: fetchImpl as typeof fetch });

    await expect(mailer.send(input)).resolves.toBe("sent");

    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    expect(init.headers).toMatchObject({
      "Idempotency-Key": input.idempotencyKey,
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.from).toBe(options.fromEmail);
    expect(body.subject).toBe("Confirm your UnseenPrompt waitlist email");
    expect(String(body.html)).toContain("Confirm my email");
    expect(String(body.text)).toContain(input.confirmationUrl);
  });

  it("treats 409 as idempotent success", async () => {
    const mailer = createResendMailer({
      ...options,
      fetchImpl: vi.fn(async () => new Response("conflict", { status: 409 })) as typeof fetch,
    });
    await expect(mailer.send(input)).resolves.toBe("sent");
  });

  it("maps timeout and 5xx to unavailable", async () => {
    const timeout = createResendMailer({
      ...options,
      fetchImpl: vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      }) as typeof fetch,
    });
    await expect(timeout.send(input)).resolves.toBe("unavailable");

    const server = createResendMailer({
      ...options,
      fetchImpl: vi.fn(async () => new Response("no", { status: 503 })) as typeof fetch,
    });
    await expect(server.send(input)).resolves.toBe("unavailable");
  });

  it("rejects confirmation URLs outside the app origin", async () => {
    const mailer = createResendMailer({
      ...options,
      fetchImpl: vi.fn() as typeof fetch,
    });
    await expect(
      mailer.send({
        ...input,
        confirmationUrl: "https://evil.example/waitlist/confirm#token=x",
      }),
    ).resolves.toBe("misconfigured");
  });

  it("maps 4xx configuration failures to misconfigured", async () => {
    const mailer = createResendMailer({
      ...options,
      fetchImpl: vi.fn(async () => new Response("bad", { status: 422 })) as typeof fetch,
    });
    await expect(mailer.send(input)).resolves.toBe("misconfigured");
  });
});
