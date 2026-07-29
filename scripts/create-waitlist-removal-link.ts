/**
 * Owner-only local helper. Never run in CI. Prints one fragment URL to stdout.
 *
 * Usage:
 *   WAITLIST_TOKEN_SECRET=... pnpm exec tsx scripts/create-waitlist-removal-link.ts ENTRY_UUID MANAGEMENT_VERSION
 */

import { WebCryptoTokenCodec } from "../src/domain/waitlist/tokens";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main(): Promise<void> {
  const [, , entryId, versionRaw] = process.argv;
  const secret = process.env.WAITLIST_TOKEN_SECRET;

  if (!entryId || !versionRaw) {
    throw new Error("Usage: create-waitlist-removal-link.ts ENTRY_UUID MANAGEMENT_VERSION");
  }

  if (!UUID_PATTERN.test(entryId)) {
    throw new Error("ENTRY_UUID must be a UUID");
  }

  const managementVersion = Number.parseInt(versionRaw, 10);
  if (!Number.isInteger(managementVersion) || managementVersion < 1) {
    throw new Error("MANAGEMENT_VERSION must be a positive integer");
  }

  if (!secret || secret.length < 32) {
    throw new Error("WAITLIST_TOKEN_SECRET must be set (min 32 characters)");
  }

  const token = await new WebCryptoTokenCodec(secret).signManagement(entryId, managementVersion);
  const url = `https://unseenprompt.com/waitlist/remove#token=${encodeURIComponent(token)}`;
  process.stdout.write(`${url}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
