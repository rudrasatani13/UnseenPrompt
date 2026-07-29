import type { TokenCodec } from "@/domain/waitlist/contracts";

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length === 0) {
    return null;
  }

  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const withPad = padded + "=".repeat(padLength);

  try {
    const binary = atob(withPad);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hmacSign(key: CryptoKey, message: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

/**
 * Web Crypto token codec with domain-separated HMAC inputs.
 * Confirmation: `confirmation:${deliveryIdempotencyKey}`
 * Management: `management:${entryId}:${managementVersion}`
 */
export class WebCryptoTokenCodec implements TokenCodec {
  readonly #secret: string;

  constructor(secret: string) {
    if (secret.length < 32) {
      throw new Error("token secret must be at least 32 characters");
    }
    this.#secret = secret;
  }

  async deriveConfirmation(idempotencyKey: string): Promise<string> {
    const key = await importHmacKey(this.#secret);
    const signature = await hmacSign(key, `confirmation:${idempotencyKey}`);
    return toBase64Url(signature);
  }

  async hashConfirmation(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async signManagement(entryId: string, managementVersion: number): Promise<string> {
    const payload = `${entryId}:${managementVersion}`;
    const key = await importHmacKey(this.#secret);
    const signature = await hmacSign(key, `management:${payload}`);
    return `${toBase64Url(new TextEncoder().encode(payload))}.${toBase64Url(signature)}`;
  }

  async verifyManagement(
    token: string,
  ): Promise<{ readonly entryId: string; readonly managementVersion: number } | null> {
    if (typeof token !== "string") {
      return null;
    }

    const parts = token.split(".");
    if (parts.length !== 2) {
      return null;
    }

    const [payloadPart, signaturePart] = parts as [string, string];
    const payloadBytes = fromBase64Url(payloadPart);
    const signatureBytes = fromBase64Url(signaturePart);
    if (!payloadBytes || !signatureBytes) {
      return null;
    }

    let payload: string;
    try {
      payload = new TextDecoder().decode(payloadBytes);
    } catch {
      return null;
    }

    const match = /^(?<entryId>[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):(?<version>[1-9][0-9]*)$/iu.exec(
      payload,
    );
    if (!match?.groups) {
      return null;
    }

    const key = await importHmacKey(this.#secret);
    const expectedMessage = `management:${payload}`;
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as BufferSource,
      new TextEncoder().encode(expectedMessage),
    );

    if (!valid) {
      return null;
    }

    return {
      entryId: match.groups.entryId!.toLowerCase(),
      managementVersion: Number.parseInt(match.groups.version!, 10),
    };
  }
}
