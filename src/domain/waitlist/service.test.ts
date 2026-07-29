import { describe, expect, it, vi } from "vitest";

import type {
  ConfirmationMailer,
  RequestConfirmationDecision,
  TurnstileVerifier,
  WaitlistRepository,
} from "@/domain/waitlist/contracts";
import { createWaitlistService } from "@/domain/waitlist/service";
import { WebCryptoTokenCodec } from "@/domain/waitlist/tokens";

const SECRET = "local_test_token_secret_0000000000000000";
const FIXED_NOW = new Date("2026-07-29T12:00:00.000Z");

function createMocks() {
  const tokens = new WebCryptoTokenCodec(SECRET);
  const repository: WaitlistRepository = {
    requestConfirmation: vi.fn(async (): Promise<RequestConfirmationDecision> => ({
      kind: "send",
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    })),
    markConfirmationSent: vi.fn(async () => undefined),
    confirm: vi.fn(async () => "confirmed" as const),
    remove: vi.fn(async () => "removed" as const),
  };
  const turnstile: TurnstileVerifier = {
    verify: vi.fn(async () => "verified" as const),
  };
  const mailer: ConfirmationMailer = {
    send: vi.fn(async () => "sent" as const),
  };

  const service = createWaitlistService({
    repository,
    turnstile,
    mailer,
    tokens,
    clock: { now: () => FIXED_NOW },
    idempotencyKeys: {
      create: () => "660e8400-e29b-41d4-a716-446655440000",
    },
    appUrl: new URL("https://unseenprompt.com"),
    hostname: "unseenprompt.com",
  });

  return { service, repository, turnstile, mailer, tokens };
}

const validInput = {
  email: "Person@Example.COM",
  turnstileToken: "turnstile-token",
  requestId: "770e8400-e29b-41d4-a716-446655440000",
};

describe("createWaitlistService", () => {
  it("accepts a new request, sends mail, and marks sent", async () => {
    const { service, mailer, repository } = createMocks();

    await expect(service.request(validInput)).resolves.toEqual({ kind: "accepted" });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(repository.markConfirmationSent).toHaveBeenCalledTimes(1);

    const sendArg = vi.mocked(mailer.send).mock.calls[0]![0];
    expect(sendArg.confirmationUrl).toMatch(
      /^https:\/\/unseenprompt\.com\/waitlist\/confirm#token=/,
    );
    expect(sendArg.idempotencyKey).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("returns accepted without mail for already confirmed", async () => {
    const { service, mailer, repository } = createMocks();
    vi.mocked(repository.requestConfirmation).mockResolvedValue({ kind: "confirmed" });

    await expect(service.request(validInput)).resolves.toEqual({ kind: "accepted" });
    expect(mailer.send).toHaveBeenCalledTimes(0);
  });

  it("returns accepted without mail during cooldown", async () => {
    const { service, mailer, repository } = createMocks();
    vi.mocked(repository.requestConfirmation).mockResolvedValue({ kind: "cooldown" });

    await expect(service.request(validInput)).resolves.toEqual({ kind: "accepted" });
    expect(mailer.send).toHaveBeenCalledTimes(0);
  });

  it("maps invalid email without calling Turnstile", async () => {
    const { service, turnstile } = createMocks();

    await expect(service.request({ ...validInput, email: "not-an-email" })).resolves.toEqual({
      kind: "invalid_email",
    });
    expect(turnstile.verify).not.toHaveBeenCalled();
  });

  it("maps Turnstile rejection and outage", async () => {
    const { service, turnstile, mailer } = createMocks();
    vi.mocked(turnstile.verify).mockResolvedValueOnce("rejected");
    await expect(service.request(validInput)).resolves.toEqual({ kind: "verification_failed" });

    vi.mocked(turnstile.verify).mockResolvedValueOnce("unavailable");
    await expect(service.request(validInput)).resolves.toEqual({ kind: "temporary_failure" });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("retries one Resend timeout then accepts on success", async () => {
    const { service, mailer } = createMocks();
    vi.mocked(mailer.send).mockResolvedValueOnce("unavailable").mockResolvedValueOnce("sent");

    await expect(service.request(validInput)).resolves.toEqual({ kind: "accepted" });
    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mailer.send).mock.calls[0]![0].idempotencyKey).toBe(
      vi.mocked(mailer.send).mock.calls[1]![0].idempotencyKey,
    );
  });

  it("maps Resend failure to temporary_failure", async () => {
    const { service, mailer } = createMocks();
    vi.mocked(mailer.send).mockResolvedValue("misconfigured");
    await expect(service.request(validInput)).resolves.toEqual({ kind: "temporary_failure" });
  });

  it("maps repository outage to temporary_failure", async () => {
    const { service, repository } = createMocks();
    vi.mocked(repository.requestConfirmation).mockRejectedValue(new Error("db down"));
    await expect(service.request(validInput)).resolves.toEqual({ kind: "temporary_failure" });
  });

  it("confirms by hash and maps invalid tokens", async () => {
    const { service, repository, tokens } = createMocks();
    const token = await tokens.deriveConfirmation("delivery-key");
    const hash = await tokens.hashConfirmation(token);

    await expect(service.confirm(token)).resolves.toBe("confirmed");
    expect(repository.confirm).toHaveBeenCalledWith({ tokenHash: hash, now: FIXED_NOW });
    await expect(service.confirm("")).resolves.toBe("invalid");
  });

  it("removes after management verification and rejects bad signatures", async () => {
    const { service, repository, tokens } = createMocks();
    const token = await tokens.signManagement("11111111-2222-4333-8444-555555555555", 2);

    await expect(service.remove(token)).resolves.toBe("removed");
    expect(repository.remove).toHaveBeenCalledWith({
      entryId: "11111111-2222-4333-8444-555555555555",
      managementVersion: 2,
      now: FIXED_NOW,
    });
    await expect(service.remove("bad")).resolves.toBe("invalid");
  });
});
