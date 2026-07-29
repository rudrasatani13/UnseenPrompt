import { describe, expect, it } from "vitest";

import { WebCryptoTokenCodec } from "@/domain/waitlist/tokens";

const SECRET = "local_test_token_secret_0000000000000000";
const OTHER_SECRET = "local_test_token_secret_1111111111111111";
const DELIVERY_KEY = "550e8400-e29b-41d4-a716-446655440000";
const ENTRY_ID = "11111111-2222-4333-8444-555555555555";

describe("WebCryptoTokenCodec", () => {
  const codec = new WebCryptoTokenCodec(SECRET);

  it("derives confirmation tokens deterministically with domain separation", async () => {
    const first = await codec.deriveConfirmation(DELIVERY_KEY);
    const second = await codec.deriveConfirmation(DELIVERY_KEY);
    const otherKey = await codec.deriveConfirmation("660e8400-e29b-41d4-a716-446655440000");

    expect(first).toBe(second);
    expect(first).not.toBe(otherKey);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.includes("=")).toBe(false);
  });

  it("hashes confirmation tokens to lowercase hex SHA-256", async () => {
    const token = await codec.deriveConfirmation(DELIVERY_KEY);
    const hash = await codec.hashConfirmation(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await codec.hashConfirmation(token)).toBe(hash);
  });

  it("round-trips management tokens", async () => {
    const token = await codec.signManagement(ENTRY_ID, 3);
    const verified = await codec.verifyManagement(token);

    expect(verified).toEqual({ entryId: ENTRY_ID, managementVersion: 3 });
  });

  it("rejects modified signatures and wrong secrets", async () => {
    const token = await codec.signManagement(ENTRY_ID, 1);
    const [payload, signature] = token.split(".") as [string, string];
    const tampered = `${payload}.${signature.slice(0, -2)}aa`;

    expect(await codec.verifyManagement(tampered)).toBeNull();
    expect(await new WebCryptoTokenCodec(OTHER_SECRET).verifyManagement(token)).toBeNull();
  });

  it("returns null for malformed management tokens without throwing", async () => {
    await expect(codec.verifyManagement("")).resolves.toBeNull();
    await expect(codec.verifyManagement("not-valid")).resolves.toBeNull();
    await expect(codec.verifyManagement("@@@.@@@")).resolves.toBeNull();
    await expect(codec.verifyManagement("a.b.c")).resolves.toBeNull();
  });

  it("uses domain separation so confirmation and management digests differ", async () => {
    const confirmation = await codec.deriveConfirmation(DELIVERY_KEY);
    const management = await codec.signManagement(ENTRY_ID, 1);
    expect(confirmation).not.toBe(management.split(".")[1]);
  });
});
