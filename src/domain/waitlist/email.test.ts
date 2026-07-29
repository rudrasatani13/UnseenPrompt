import { describe, expect, it } from "vitest";

import { normalizeEmail } from "@/domain/waitlist/email";

describe("normalizeEmail", () => {
  it("trims and lowercases the lookup form while preserving display casing", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toEqual({
      email: "Person@Example.COM",
      normalized: "person@example.com",
    });
  });

  it("rejects empty and oversized addresses", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(`${"a".repeat(250)}@x.com`)).toBeNull();
  });

  it("rejects malformed addresses", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("@example.com")).toBeNull();
    expect(normalizeEmail("person@")).toBeNull();
    expect(normalizeEmail("person@example")).toBeNull();
  });

  it("rejects control characters and non-ASCII", () => {
    expect(normalizeEmail("person\u0000@example.com")).toBeNull();
    expect(normalizeEmail("persón@example.com")).toBeNull();
  });

  it("accepts a 254-character address at the bound", () => {
    // 64 + 1 + 186 + 3 = 254 for local@label.tld
    const validAtBound = `${"a".repeat(64)}@${"b".repeat(186)}.co`;
    expect(validAtBound.length).toBe(254);
    expect(normalizeEmail(validAtBound)).toEqual({
      email: validAtBound,
      normalized: validAtBound.toLowerCase(),
    });
  });
});
