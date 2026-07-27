import { NextResponse } from "next/server";

import { getServerEnvironment } from "@/config/env/server";
import { getRuntimeBindings } from "@/lib/cloudflare/context";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const environment = getServerEnvironment();
  const runtime = getRuntimeBindings();
  const workflowRequired = environment.APP_ENV !== "preview";
  const workflowReady = !workflowRequired || Boolean(runtime.workflow);
  const workflowStatus = runtime.workflow ? "ok" : workflowRequired ? "missing" : "not_configured";

  return NextResponse.json(
    {
      checks: {
        runtime: "ok",
        workflowBinding: workflowStatus,
      },
      environment: environment.APP_ENV,
      release: environment.RELEASE_SHA,
      service: "unseenprompt",
      status: workflowReady ? "ok" : "degraded",
      version: runtime.version,
    },
    {
      status: workflowReady ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
