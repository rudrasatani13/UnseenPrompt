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
  if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha)) {
    throw new Error("GITHUB_SHA must be a 40-character lowercase commit SHA");
  }

  const baseUrl = new URL(deploymentUrl);
  let healthResponse;
  let health;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    healthResponse = await fetchImpl(new URL("/api/health", baseUrl), {
      headers: { Accept: "application/json" },
    });

    try {
      health = await healthResponse.json();
    } catch {
      if (attempt === 19) {
        throw new Error(`Runtime health returned invalid JSON with HTTP ${healthResponse.status}`);
      }

      await sleep(1_000);
      continue;
    }

    const isHealthy =
      healthResponse.ok && health.service === "unseenprompt" && health.status === "ok";

    if (isHealthy && health.release === expectedReleaseSha) {
      break;
    }

    if (isHealthy && attempt < 19) {
      await sleep(1_000);
      continue;
    }

    if (healthResponse.ok) {
      break;
    }

    if (healthResponse.status < 500 || attempt === 19) {
      throw new Error(`Runtime health failed with HTTP ${healthResponse.status}`);
    }

    await sleep(1_000);
  }

  if (!healthResponse?.ok || health.service !== "unseenprompt" || health.status !== "ok") {
    throw new Error(`Runtime health failed with HTTP ${healthResponse?.status ?? "unknown"}`);
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

    try {
      workflow = await response.json();
    } catch {
      if (attempt === 19) {
        throw new Error(`Workflow probe returned invalid JSON with HTTP ${response.status}`);
      }

      await sleep(1_000);
      continue;
    }

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
