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
  return stepUses(step).includes("actions/checkout@");
}

function isSecretBearingRun(step) {
  const run = stepRun(step);
  if (!run) {
    return false;
  }
  return (
    /\$\{\{\s*secrets\./.test(run) ||
    Boolean(step.env && JSON.stringify(step.env).includes("secrets."))
  );
}

function isTrustedWranglerUpload(step) {
  const run = stepRun(step);
  return run.includes("wrangler versions upload") && run.includes("--env preview");
}

function isTrustedDeploymentSmoke(step) {
  const run = stepRun(step);
  return run.includes("pnpm test:cf-deployment") || run.includes("test:cf-deployment");
}

export function assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow }) {
  if (typeof buildWorkflow !== "string" || typeof deployWorkflow !== "string") {
    throw new Error("buildWorkflow and deployWorkflow YAML strings are required");
  }

  if (buildWorkflow.includes("${{ secrets.")) {
    throw new Error("Build Preview Artifact must not reference secrets");
  }

  const build = parse(buildWorkflow);
  const deploy = parse(deployWorkflow);

  const buildTriggers = build?.on ?? {};
  if (!Object.prototype.hasOwnProperty.call(buildTriggers, "pull_request")) {
    throw new Error("Build Preview Artifact must trigger on pull_request");
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
  if (deployJobs.length === 0) {
    throw new Error("Deploy Preview must define a deploy job");
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
    if (!isSecretBearingRun(step)) {
      continue;
    }
    if (isTrustedWranglerUpload(step) || isTrustedDeploymentSmoke(step)) {
      continue;
    }
    // Secret-bearing env on a step whose run is trusted wrangler/smoke is allowed via env block
    const envText = step.env ? JSON.stringify(step.env) : "";
    const run = stepRun(step);
    if (
      envText.includes("secrets.") &&
      (run.includes("wrangler versions upload") ||
        run.includes("pnpm test:cf-deployment") ||
        run.includes("test:cf-deployment"))
    ) {
      continue;
    }
    throw new Error("Deploy Preview secret-bearing steps must be trusted upload or smoke only");
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
