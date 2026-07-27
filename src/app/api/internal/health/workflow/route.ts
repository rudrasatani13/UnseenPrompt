import { NextResponse } from "next/server";

import { getRuntimeBindings } from "@/lib/cloudflare/context";
import { hasValidHealthToken } from "@/lib/security/health-token";

export const dynamic = "force-dynamic";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._-]{8,80}$/;

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "unauthorized" },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function resolveInstanceId(request: Request): string | null {
  const header = request.headers.get("idempotency-key");

  if (header === null) {
    return `health-${crypto.randomUUID()}`;
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(header)) {
    return null;
  }

  const instanceId = `health-${header}`;
  if (instanceId.length >= 100) {
    return null;
  }

  return instanceId;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasValidHealthToken(request.headers.get("authorization"), process.env.HEALTHCHECK_TOKEN)) {
    return unauthorized();
  }

  const instanceId = resolveInstanceId(request);
  if (instanceId === null) {
    return NextResponse.json(
      { error: "invalid_idempotency_key" },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const { workflow } = getRuntimeBindings();
  const created = await workflow.createBatch([
    {
      id: instanceId,
      params: {
        requestId: instanceId,
      },
    },
  ]);

  const instance = created[0] ?? (await workflow.get(instanceId));
  const details = await instance.status();
  const responseStatus =
    details.status === "complete" ? 200 : details.status === "errored" ? 503 : 202;

  console.info("workflow-health-probe", {
    id: instanceId,
    status: details.status,
  });

  return NextResponse.json(
    {
      id: instanceId,
      status: details.status,
      output: details.output ?? null,
    },
    {
      status: responseStatus,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
