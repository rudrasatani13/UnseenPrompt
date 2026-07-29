import { readFile } from "node:fs/promises";

import { parse } from "yaml";
import { describe, expect, test } from "vitest";

describe("sequential main release workflow", () => {
  test("runs only after CI succeeds and gates production on staging of the same SHA", async () => {
    const workflow = parse(await readFile(".github/workflows/deploy-release.yml", "utf8"));

    expect(workflow.on.workflow_run.workflows).toEqual(["Continuous Integration"]);
    expect(workflow.on.workflow_run.types).toEqual(["completed"]);
    expect(workflow.on.workflow_run.branches).toEqual(["main"]);
    expect(workflow.on.push).toBeUndefined();

    expect(workflow.jobs.gate.if).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow.jobs.gate.if).toContain("github.event.workflow_run.event == 'push'");
    expect(workflow.jobs.gate.if).toContain("github.event.workflow_run.head_branch == 'main'");

    expect(workflow.jobs.staging.needs).toBe("gate");
    expect(workflow.jobs.production.needs).toEqual(["gate", "staging"]);
    expect(workflow.jobs.production.if).toBe("${{ vars.PRODUCTION_DEPLOY_ENABLED == 'true' }}");
    expect(workflow.jobs.production.env.RELEASE_SHA).toBe("${{ needs.gate.outputs.release_sha }}");

    const releaseCheckout = workflow.jobs.production.steps.find(
      (step: { name?: string }) => step.name === "Check out release SHA",
    );
    expect(releaseCheckout.with.ref).toBe("${{ needs.gate.outputs.release_sha }}");

    const stagingRequireSecrets = workflow.jobs.staging.steps.find(
      (step: { name?: string }) => step.name === "Require staging database credentials",
    );
    expect(stagingRequireSecrets).toBeDefined();

    const recoveryGate = workflow.jobs.production.steps.find(
      (step: { name?: string }) => step.name === "Require backup/PITR confirmation",
    );
    expect(recoveryGate.env.PRODUCTION_DB_RECOVERY_CONFIRMED).toBe(
      "${{ vars.PRODUCTION_DB_RECOVERY_CONFIRMED }}",
    );
  });
});
