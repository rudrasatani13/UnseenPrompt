import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnvironment } from "@/config/env/server";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

const MAX_BODY_BYTES = 4 * 1024;

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

export async function readJsonBody(request: Request): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly response: NextResponse }
> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: NextResponse.json(
        { kind: "invalid_request" },
        { status: 400, headers: NO_STORE_HEADERS },
      ),
    };
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { kind: "invalid_request" },
        { status: 400, headers: NO_STORE_HEADERS },
      ),
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { kind: "invalid_request" },
        { status: 400, headers: NO_STORE_HEADERS },
      ),
    };
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
