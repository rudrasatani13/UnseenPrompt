const deploymentUrl = process.env.DEPLOYMENT_URL;

if (!deploymentUrl) {
  throw new Error("DEPLOYMENT_URL is required");
}

const baseUrl = new URL(deploymentUrl);
const healthResponse = await fetch(new URL("/api/health", baseUrl), {
  headers: { Accept: "application/json" },
});
const health = await healthResponse.json();

if (!healthResponse.ok || health.service !== "unseenprompt" || health.status !== "ok") {
  throw new Error(`Runtime health failed with HTTP ${healthResponse.status}`);
}

const token = process.env.HEALTHCHECK_TOKEN;

if (token) {
  const idempotencyKey = `deploy-${process.env.GITHUB_SHA ?? "manual"}`.slice(0, 80);
  let workflow;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(new URL("/api/internal/health/workflow", baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  if (workflow?.status !== "complete" || workflow.output?.ok !== true) {
    throw new Error(`Workflow did not complete: ${workflow?.status ?? "unknown"}`);
  }
}
