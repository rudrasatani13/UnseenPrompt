import { NextResponse } from "next/server";

import { getServerEnvironment } from "@/config/env/server";
import { getRuntimeBindings } from "@/lib/cloudflare/context";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const environment = getServerEnvironment();
  const runtime = getRuntimeBindings();

  return NextResponse.json(
    {
      checks: {
        runtime: "ok",
        workflowBinding: runtime.workflow ? "ok" : "missing",
      },
      environment: environment.APP_ENV,
      release: environment.RELEASE_SHA,
      service: "unseenprompt",
      status: runtime.workflow ? "ok" : "degraded",
      version: runtime.version,
    },
    {
      status: runtime.workflow ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
