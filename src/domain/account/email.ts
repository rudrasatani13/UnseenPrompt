const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Sign-in address normalization. Returns the canonical lookup form or null for anything Supabase
 * Auth should never be asked to send to. Deliberately duplicates the waitlist semantics rather
 * than importing them — the two domains version their address rules independently.
 */
export function normalizeAccountEmail(raw: string): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const email = raw.normalize("NFC").trim().toLowerCase();

  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
    return null;
  }

  // Printable ASCII only, so a homoglyph cannot masquerade as an existing account.
  if (!/^[\x21-\x7e]+$/u.test(email)) {
    return null;
  }

  if (!EMAIL_PATTERN.test(email)) {
    return null;
  }

  return email;
}
