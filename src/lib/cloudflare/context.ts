import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface RuntimeBindings {
  version: string;
  workflow: Workflow | undefined;
}

export function getRuntimeBindings(): RuntimeBindings {
  const { env } = getCloudflareContext();

  return {
    version: env.CF_VERSION_METADATA?.id ?? "local",
    workflow: env.RUNTIME_HEALTH_WORKFLOW,
  };
}
