import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function collectSteps(workflow) {
  const jobs = workflow?.jobs ?? {};
  return Object.values(jobs).flatMap((job) => asArray(job?.steps));
}

function stepUses(step) {
  return typeof step?.uses === "string" ? step.uses : "";
}

function stepRun(step) {
  return typeof step?.run === "string" ? step.run : "";
}

function isCheckoutStep(step) {
  return stepUses(step).startsWith("actions/checkout@");
}

function collectStrings(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

function secretReferences(step) {
  return collectStrings(step).filter((value) => /\$\{\{[^}]*\bsecrets\b[^}]*\}\}/.test(value));
}

function isTrustedWranglerUpload(step) {
  return (
    stepRun(step).trim() ===
    'pnpm exec wrangler versions upload --env preview --strict --preview-alias pr-${{ env.PR_NUMBER }} --tag ${{ env.PR_HEAD_SHA }} --message "PR ${{ env.PR_NUMBER }}" --var RELEASE_SHA:${{ env.PR_HEAD_SHA }}'
  );
}

function isTrustedDeploymentSmoke(step) {
  const run = stepRun(step);
  return run.includes("pnpm test:cf-deployment") || run.includes("test:cf-deployment");
}

function isTrustedSecretIsolation(step) {
  const run = stepRun(step);
  return run.trim() === "node scripts/assert-preview-secret-isolation.mjs";
}

function isTrustedArtifactDownload(step, references) {
  return (
    stepUses(step).startsWith("actions/download-artifact@") &&
    step?.with?.["github-token"] === "${{ secrets.GITHUB_TOKEN }}" &&
    references.length === 1 &&
    references[0] === "${{ secrets.GITHUB_TOKEN }}"
  );
}

export function assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow }) {
  if (typeof buildWorkflow !== "string" || typeof deployWorkflow !== "string") {
    throw new Error("buildWorkflow and deployWorkflow YAML strings are required");
  }

  if (/\$\{\{[^}]*\bsecrets\b[^}]*\}\}/.test(buildWorkflow)) {
    throw new Error("Build Preview Artifact must not reference secrets");
  }

  const build = parse(buildWorkflow);
  const deploy = parse(deployWorkflow);

  const buildTriggers = build?.on ?? {};
  if (!Object.prototype.hasOwnProperty.call(buildTriggers, "pull_request")) {
    throw new Error("Build Preview Artifact must trigger on pull_request");
  }

  const buildSteps = collectSteps(build);
  const packageSteps = buildSteps.filter((step) => {
    const run = stepRun(step);
    return run.includes("preview-worker.tar") && run.includes(".open-next");
  });
  if (
    packageSteps.length !== 1 ||
    !stepRun(packageSteps[0]).includes("--dereference") ||
    !stepRun(packageSteps[0]).includes("--hard-dereference")
  ) {
    throw new Error("Build Preview Artifact must dereference symbolic and hard links");
  }

  const deployTriggers = deploy?.on ?? {};
  const workflowRun = deployTriggers.workflow_run;
  if (!workflowRun) {
    throw new Error("Deploy Preview must trigger on workflow_run");
  }

  const watched = asArray(workflowRun.workflows);
  if (!watched.includes("Build Preview Artifact")) {
    throw new Error("Deploy Preview must watch Build Preview Artifact");
  }

  const deployJobs = Object.values(deploy?.jobs ?? {});
  if (deployJobs.length !== 1) {
    throw new Error("Deploy Preview must define exactly one deploy job");
  }

  const deploySteps = collectSteps(deploy);
  const checkoutSteps = deploySteps.filter(isCheckoutStep);

  if (checkoutSteps.length === 0) {
    throw new Error("Deploy Preview must check out the repository");
  }

  for (const step of checkoutSteps) {
    const ref = step?.with?.ref;
    if (ref !== "main") {
      throw new Error("Deploy Preview checkout must use with.ref main");
    }
    if (step?.with?.["persist-credentials"] !== false) {
      throw new Error("Deploy Preview checkout must not persist credentials");
    }
  }

  const serializedDeploy = deployWorkflow;
  if (serializedDeploy.includes("github.event.workflow_run.head_sha")) {
    // head_sha is allowed as data (RELEASE_SHA) but never as a checkout ref
    for (const step of checkoutSteps) {
      const ref = String(step?.with?.ref ?? "");
      if (ref.includes("head_sha") || ref.includes("workflow_run.head_sha")) {
        throw new Error("Deploy Preview must not check out workflow_run.head_sha");
      }
    }
  }

  for (const step of deploySteps) {
    if (
      stepRun(step).includes("pnpm cf:build") ||
      stepRun(step).includes("opennextjs-cloudflare build")
    ) {
      throw new Error("Deploy Preview must not run pnpm cf:build");
    }
  }

  for (const step of deploySteps) {
    const references = secretReferences(step);
    if (references.length === 0) {
      continue;
    }

    if (isTrustedDeploymentSmoke(step)) {
      throw new Error("Deploy Preview preview smoke must not receive secrets");
    }

    if (stepUses(step)) {
      if (isTrustedArtifactDownload(step, references)) {
        continue;
      }
      throw new Error("Deploy Preview secret-bearing action is not allowed");
    }

    if (isTrustedWranglerUpload(step) || isTrustedSecretIsolation(step)) {
      continue;
    }
    throw new Error("Deploy Preview secret-bearing steps must be trusted upload or isolation only");
  }

  const trustedExtraction =
    "python3 scripts/extract-preview-artifact.py \\\n" +
    '  preview-artifact/preview-worker.tar "$PREVIEW_EXTRACT_DIR"\n' +
    "test ! -e .open-next\n" +
    'mv "$PREVIEW_EXTRACT_DIR/.open-next" .open-next';
  const trustedExtractionSteps = deploySteps.filter(
    (step) => stepRun(step).trim() === trustedExtraction,
  );
  if (trustedExtractionSteps.length !== 1 || deployWorkflow.includes("extractall(")) {
    throw new Error("Deploy Preview must use the exact trusted preview artifact extraction");
  }

  const allSteps = [...buildSteps, ...deploySteps];
  for (const step of allSteps) {
    const uses = stepUses(step);
    if (uses.startsWith("./")) {
      throw new Error("Preview workflows must not use local actions");
    }
    if (uses && !/@[0-9a-f]{40}$/.test(uses)) {
      throw new Error("Preview workflows must pin third-party actions to full commit SHAs");
    }
  }

  const downloadSteps = deploySteps.filter((step) =>
    stepUses(step).startsWith("actions/download-artifact@"),
  );
  if (downloadSteps.length !== 1) {
    throw new Error("Deploy Preview must download exactly one preview artifact");
  }
  const download = downloadSteps[0];
  if (
    download?.with?.["run-id"] !== "${{ github.event.workflow_run.id }}" ||
    download?.with?.name !== "preview-worker-${{ github.event.workflow_run.id }}"
  ) {
    throw new Error("Deploy Preview must bind the artifact to workflow_run.id");
  }

  if (
    deploy?.permissions?.actions !== "read" ||
    deploy?.permissions?.contents !== "read" ||
    Object.keys(deploy.permissions).length !== 2
  ) {
    throw new Error("Deploy Preview permissions must be actions: read and contents: read only");
  }

  if (
    !deployWorkflow.includes("secrets.PREVIEW_CLOUDFLARE_ACCOUNT_ID") ||
    !deployWorkflow.includes("secrets.PREVIEW_CLOUDFLARE_API_TOKEN") ||
    deployWorkflow.includes("${{ secrets.CLOUDFLARE_ACCOUNT_ID") ||
    deployWorkflow.includes("${{ secrets.CLOUDFLARE_API_TOKEN") ||
    !deployWorkflow.includes("vars.STAGING_CLOUDFLARE_ACCOUNT_ID") ||
    !deployWorkflow.includes("vars.PRODUCTION_CLOUDFLARE_ACCOUNT_ID")
  ) {
    throw new Error("Deploy Preview must use preview-specific Cloudflare credentials");
  }

  const deployCondition = String(deployJobs[0]?.if ?? "");
  for (const requiredCondition of [
    "workflow_run.conclusion == 'success'",
    "workflow_run.head_repository.full_name == github.repository",
    "workflow_run.pull_requests[0].number != null",
  ]) {
    if (!deployCondition.includes(requiredCondition)) {
      throw new Error("Deploy Preview must gate successful same-repository pull request runs");
    }
  }

  return true;
}

export function main() {
  const buildWorkflow = readFileSync(".github/workflows/build-preview.yml", "utf8");
  const deployWorkflow = readFileSync(".github/workflows/deploy-preview.yml", "utf8");
  assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow });
  console.log("Preview workflow trust boundary is valid.");
}

const entryPath = process.argv[1];
if (entryPath && pathToFileURL(entryPath).href === import.meta.url) {
  main();
}
