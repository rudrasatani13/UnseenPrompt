import "server-only";

import { timingSafeEqual } from "node:crypto";

function asBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

export function hasValidHealthToken(
  authorization: string | null,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || expectedToken.length < 32 || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = asBuffer(authorization.slice("Bearer ".length));
  const expected = asBuffer(expectedToken);

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
