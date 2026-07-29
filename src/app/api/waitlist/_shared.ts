import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnvironment } from "@/config/env/server";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

const MAX_BODY_BYTES = 4 * 1024;

function invalidRequest() {
  return {
    ok: false as const,
    response: NextResponse.json(
      { kind: "invalid_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    ),
  };
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (
      !/^\d+$/.test(contentLength) ||
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes > MAX_BODY_BYTES
    ) {
      return null;
    }
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { kind: "method_not_allowed" },
    {
      status: 405,
      headers: {
        ...NO_STORE_HEADERS,
        Allow: "POST",
      },
    },
  );
}

export function productionOnlyOr404(): NextResponse | null {
  const environment = getServerEnvironment();
  if (environment.APP_ENV !== "production") {
    return NextResponse.json({ kind: "not_found" }, { status: 404, headers: NO_STORE_HEADERS });
  }
  return null;
}

export async function readJsonBody(
  request: Request,
): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly response: NextResponse }
> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return invalidRequest();
  }

  const raw = await readBoundedBody(request);
  if (raw === null) {
    return invalidRequest();
  }

  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return invalidRequest();
  }
}

export const waitlistRequestBodySchema = z
  .object({
    email: z.string().max(254),
    turnstileToken: z.string().min(1).max(1024),
    requestId: z.string().uuid(),
  })
  .strict();

export const waitlistTokenBodySchema = z
  .object({
    token: z.string().min(1).max(1024),
  })
  .strict();
