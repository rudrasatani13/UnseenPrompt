import { NextResponse } from "next/server";

import {
  methodNotAllowed,
  NO_STORE_HEADERS,
  productionOnlyOr404,
  readJsonBody,
  waitlistTokenBodySchema,
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

  const parsed = waitlistTokenBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { kind: "invalid_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const service = getProductionWaitlistService();
    const result = await service.confirm(parsed.data.token);

    if (result === "confirmed" || result === "already_confirmed") {
      return NextResponse.json({ kind: "confirmed" }, { status: 200, headers: NO_STORE_HEADERS });
    }

    if (result === "expired") {
      return NextResponse.json({ kind: "expired" }, { status: 400, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ kind: "invalid" }, { status: 400, headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { kind: "temporary_failure" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
