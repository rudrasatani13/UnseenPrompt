import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { assertPreviewWorkflowTrust } from "./assert-preview-workflow-trust.mjs";

describe("preview workflow trust boundary", () => {
  test("keeps PR execution credential-free and deployment tooling on main", async () => {
    const [buildWorkflow, deployWorkflow] = await Promise.all([
      readFile(".github/workflows/build-preview.yml", "utf8"),
      readFile(".github/workflows/deploy-preview.yml", "utf8"),
    ]);

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).not.toThrow();
  });

  test("rejects a pull-request workflow that references secrets", () => {
    const buildWorkflow = `on: { pull_request: {} }\njobs:\n  build:\n    steps:\n      - run: echo \${{ secrets.CLOUDFLARE_API_TOKEN }}`;
    const deployWorkflow = `on: { workflow_run: { workflows: [Build Preview Artifact], types: [completed] } }\njobs:\n  deploy:\n    steps:\n      - uses: actions/checkout@pinned\n        with: { ref: main }`;
    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "must not reference secrets",
    );
  });
});
