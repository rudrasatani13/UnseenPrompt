import { readFile } from "node:fs/promises";

import { parse } from "yaml";
import { describe, expect, test } from "vitest";

describe("sequential main release workflow", () => {
  test("gates production on a successful staging deployment of the same main SHA", async () => {
    const workflow = parse(await readFile(".github/workflows/deploy-release.yml", "utf8"));

    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(workflow.jobs.production.needs).toBe("staging");
    expect(workflow.jobs.production.if).toBe("${{ vars.PRODUCTION_DEPLOY_ENABLED == 'true' }}");
    expect(workflow.jobs.production.env.RELEASE_SHA).toBe("${{ github.sha }}");

    const releaseCheckout = workflow.jobs.production.steps.find(
      (step: { name?: string }) => step.name === "Check out release SHA",
    );
    expect(releaseCheckout.with.ref).toBe("${{ github.sha }}");
  });
});
