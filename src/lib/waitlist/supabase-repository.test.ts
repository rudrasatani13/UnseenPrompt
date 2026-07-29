import { describe, expect, it, vi } from "vitest";

import {
  createSupabaseWaitlistRepository,
  WaitlistProviderError,
} from "@/lib/waitlist/supabase-repository";

function createRpcClient(rpcImpl: ReturnType<typeof vi.fn>) {
  return {
    rpc: rpcImpl,
  } as never;
}

const environment = {
  supabaseUrl: "https://waitlist.invalid",
  supabaseSecretKey: "sb_secret_local_test_value_000000000000",
};

describe("createSupabaseWaitlistRepository", () => {
  it("calls request_waitlist_confirmation with exact arguments", async () => {
    const rpc = vi.fn(async () => ({
      data: { kind: "send", idempotency_key: "550e8400-e29b-41d4-a716-446655440000" },
      error: null,
    }));
    const repository = createSupabaseWaitlistRepository(environment, createRpcClient(rpc));
    const now = new Date("2026-07-29T12:00:00.000Z");

    await expect(
      repository.requestConfirmation({
        email: "Person@Example.COM",
        emailNormalized: "person@example.com",
        consentAt: now,
        candidateTokenHash: "a".repeat(64),
        candidateExpiresAt: new Date("2026-07-30T12:00:00.000Z"),
        candidateIdempotencyKey: "660e8400-e29b-41d4-a716-446655440000",
      }),
    ).resolves.toEqual({
      kind: "send",
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(rpc).toHaveBeenCalledWith("request_waitlist_confirmation", {
      p_email: "Person@Example.COM",
      p_email_normalized: "person@example.com",
      p_consent_at: now.toISOString(),
      p_candidate_token_hash: "a".repeat(64),
      p_candidate_expires_at: "2026-07-30T12:00:00.000Z",
      p_candidate_idempotency_key: "660e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("maps confirmation and removal enums", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: "already_confirmed", error: null })
      .mockResolvedValueOnce({ data: "already_removed", error: null });
    const repository = createSupabaseWaitlistRepository(environment, createRpcClient(rpc));
    const now = new Date("2026-07-29T12:00:00.000Z");

    await expect(repository.confirm({ tokenHash: "b".repeat(64), now })).resolves.toBe(
      "already_confirmed",
    );
    await expect(
      repository.remove({
        entryId: "11111111-2222-4333-8444-555555555555",
        managementVersion: 1,
        now,
      }),
    ).resolves.toBe("already_removed");
  });

  it("throws provider errors without embedding payloads", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "permission denied for table waitlist_entries" },
    }));
    const repository = createSupabaseWaitlistRepository(environment, createRpcClient(rpc));

    await expect(
      repository.markConfirmationSent({
        emailNormalized: "person@example.com",
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
        sentAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(WaitlistProviderError);

    try {
      await repository.markConfirmationSent({
        emailNormalized: "person@example.com",
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
        sentAt: new Date(),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(WaitlistProviderError);
      expect((error as Error).message).toBe("supabase:rpc_error");
      expect((error as Error).message).not.toContain("person@");
      expect((error as Error).message).not.toContain("permission denied");
    }
  });

  it("rejects unexpected provider payloads", async () => {
    const rpc = vi.fn(async () => ({ data: { kind: "surprise" }, error: null }));
    const repository = createSupabaseWaitlistRepository(environment, createRpcClient(rpc));

    await expect(
      repository.requestConfirmation({
        email: "a@b.co",
        emailNormalized: "a@b.co",
        consentAt: new Date(),
        candidateTokenHash: "c".repeat(64),
        candidateExpiresAt: new Date(),
        candidateIdempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({ category: "unexpected_payload" });
  });
});
