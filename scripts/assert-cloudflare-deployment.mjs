import { pathToFileURL } from "node:url";

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function assertCloudflareDeployment({
  deploymentUrl,
  expectedReleaseSha,
  healthcheckToken,
  fetchImpl = fetch,
  sleep = defaultSleep,
}) {
  if (!deploymentUrl) {
    throw new Error("DEPLOYMENT_URL is required");
  }
  if (!expectedReleaseSha) {
    throw new Error("GITHUB_SHA is required");
  }

  const baseUrl = new URL(deploymentUrl);
  const healthResponse = await fetchImpl(new URL("/api/health", baseUrl), {
    headers: { Accept: "application/json" },
  });
  const health = await healthResponse.json();

  if (!healthResponse.ok || health.service !== "unseenprompt" || health.status !== "ok") {
    throw new Error(`Runtime health failed with HTTP ${healthResponse.status}`);
  }

  if (health.release !== expectedReleaseSha) {
    throw new Error(
      `Runtime release mismatch: expected ${expectedReleaseSha}, received ${health.release ?? "missing"}`,
    );
  }

  if (!healthcheckToken) {
    return;
  }

  const idempotencyKey = `deploy-${expectedReleaseSha}`.slice(0, 80);
  let workflow;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetchImpl(new URL("/api/internal/health/workflow", baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${healthcheckToken}`,
        "Idempotency-Key": idempotencyKey,
      },
    });

    workflow = await response.json();

    if (response.status === 200 && workflow.status === "complete") {
      break;
    }

    if (response.status >= 400 && response.status !== 503) {
      throw new Error(`Workflow probe failed with HTTP ${response.status}`);
    }

    await sleep(1_000);
  }

  if (workflow?.status !== "complete" || workflow.output?.ok !== true) {
    throw new Error(`Workflow did not complete: ${workflow?.status ?? "unknown"}`);
  }
}

export async function main(env = process.env) {
  await assertCloudflareDeployment({
    deploymentUrl: env.DEPLOYMENT_URL,
    expectedReleaseSha: env.GITHUB_SHA,
    healthcheckToken: env.HEALTHCHECK_TOKEN,
  });
}

const entryPath = process.argv[1];
if (entryPath && pathToFileURL(entryPath).href === import.meta.url) {
  await main();
}
