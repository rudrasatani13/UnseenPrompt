export interface NormalizedEmail {
  readonly email: string;
  readonly normalized: string;
}

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Trims the display email, lowercases for lookup, and rejects hostile/malformed input.
 */
export function normalizeEmail(raw: string): NormalizedEmail | null {
  if (typeof raw !== "string") {
    return null;
  }

  // Reject control characters and non-printable Unicode before any other work.
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(raw)) {
    return null;
  }

  const email = raw.trim();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
    return null;
  }

  // Reject characters outside common email ASCII to avoid homoglyph surprises.
  if (!/^[\x21-\x7e]+$/u.test(email)) {
    return null;
  }

  if (!EMAIL_PATTERN.test(email)) {
    return null;
  }

  return {
    email,
    normalized: email.toLowerCase(),
  };
}
