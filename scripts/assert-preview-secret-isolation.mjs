import { pathToFileURL } from "node:url";

const PREVIEW_WORKER_NAME = "unseenprompt-preview";
const PROTECTED_WORKER_NAMES = ["unseenprompt-staging", "unseenprompt-production"];

export function assertPreviewSecretIsolation(output) {
  let bindings;
  try {
    bindings = JSON.parse(output);
  } catch {
    throw new Error("Cloudflare secret list did not return valid JSON");
  }

  if (!Array.isArray(bindings)) {
    throw new Error("Cloudflare secret list must return an array");
  }
  if (bindings.length > 0) {
    const names = bindings.map((binding) => binding?.name ?? "unknown").join(", ");
    throw new Error(`Preview Worker must not have secret bindings: ${names}`);
  }
}

async function requestCloudflareResult({ accountId, apiToken, path, fetchImpl }) {
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${path}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
    },
  );
  const payload = await response.json();
  if (!response.ok || payload?.success !== true || !Array.isArray(payload.result)) {
    throw new Error(
      `Cloudflare preview secret isolation check failed with HTTP ${response.status}`,
    );
  }
  return payload.result;
}

export async function verifyPreviewSecretIsolation({
  accountId,
  apiToken,
  fetchImpl = fetch,
  protectedAccountIds,
}) {
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");
  }
  if (
    !Array.isArray(protectedAccountIds) ||
    protectedAccountIds.length !== 2 ||
    protectedAccountIds.some((value) => !value)
  ) {
    throw new Error("Staging and production Cloudflare account IDs are required");
  }
  if (protectedAccountIds.includes(accountId)) {
    throw new Error("Preview Cloudflare account must differ from staging and production");
  }

  const scripts = await requestCloudflareResult({
    accountId,
    apiToken,
    path: "/workers/scripts",
    fetchImpl,
  });
  const protectedWorker = scripts.find((script) => PROTECTED_WORKER_NAMES.includes(script?.id));
  if (protectedWorker) {
    throw new Error(`Preview Cloudflare account contains protected Worker ${protectedWorker.id}`);
  }
  if (!scripts.some((script) => script?.id === PREVIEW_WORKER_NAME)) {
    return;
  }

  const secrets = await requestCloudflareResult({
    accountId,
    apiToken,
    path: `/workers/scripts/${PREVIEW_WORKER_NAME}/secrets`,
    fetchImpl,
  });
  assertPreviewSecretIsolation(JSON.stringify(secrets));
}

export async function main(env = process.env) {
  await verifyPreviewSecretIsolation({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    protectedAccountIds: [env.STAGING_CLOUDFLARE_ACCOUNT_ID, env.PRODUCTION_CLOUDFLARE_ACCOUNT_ID],
  });
}

const entryPath = process.argv[1];
if (entryPath && pathToFileURL(entryPath).href === import.meta.url) {
  await main();
}
