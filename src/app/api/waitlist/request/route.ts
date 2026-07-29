import { NextResponse } from "next/server";

import {
  methodNotAllowed,
  NO_STORE_HEADERS,
  productionOnlyOr404,
  readJsonBody,
  waitlistRequestBodySchema,
} from "@/app/api/waitlist/_shared";
import { getProductionWaitlistService } from "@/lib/waitlist/runtime";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return methodNotAllowed();
}

export function PUT(): NextResponse {
  return methodNotAllowed();
}

export function DELETE(): NextResponse {
  return methodNotAllowed();
}

export async function POST(request: Request): Promise<NextResponse> {
  const notProduction = productionOnlyOr404();
  if (notProduction) {
    return notProduction;
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.response;
  }

  const parsed = waitlistRequestBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { kind: "invalid_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const service = getProductionWaitlistService();
    const result = await service.request({
      email: parsed.data.email,
      turnstileToken: parsed.data.turnstileToken,
      requestId: parsed.data.requestId,
    });

    if (result.kind === "accepted") {
      return NextResponse.json({ kind: "accepted" }, { status: 200, headers: NO_STORE_HEADERS });
    }

    if (result.kind === "invalid_email") {
      return NextResponse.json(
        { kind: "invalid_email" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    if (result.kind === "verification_failed") {
      return NextResponse.json(
        { kind: "verification_failed" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { kind: "temporary_failure" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { kind: "temporary_failure" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
