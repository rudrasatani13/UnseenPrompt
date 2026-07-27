# Phase 1 Deployment Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Phase 1 deployment parsers, enforce release identity in smoke tests, and preserve automatic same-repository PR previews without exposing secrets to PR-controlled code.

**Architecture:** A credential-free `pull_request` workflow builds a tarred `.open-next` artifact. A
separate `workflow_run` workflow loaded from `main` safely extracts that artifact, then uses trusted
main-branch Wrangler tooling with runner-only deployment credentials. The deployed preview Worker has
no secrets or Workflow binding. Shared tested scripts parse Wrangler NDJSON and verify the deployed
release SHA.

**Tech Stack:** GitHub Actions, Node.js 24 ESM, Vitest 4, pnpm 11, Wrangler 4.114.0, OpenNext Cloudflare 1.20.2, Python `tarfile` safe extraction.

## Global Constraints

- Same-repository, non-draft pull requests deploy previews automatically before review.
- The privileged deployment workflow and every executable input it uses come from `main`.
- Pull-request-controlled code receives no repository or environment secrets.
- The PR artifact is treated as untrusted data, cannot overwrite trusted checkout files, and is never
  executed on the deployment runner.
- Preview has no runtime secret or Workflow bindings; staging and production keep separate health
  tokens and Cloudflare authority.
- Every deployment smoke test requires the exact expected 40-character lowercase release SHA.
- All third-party GitHub Actions remain pinned to full commit SHAs.
- Do not add runtime dependencies; `yaml@2.9.0` may be added only as a direct dev dependency for workflow-policy tests.
- Preserve the existing Node `>=24 <25` and pnpm `>=11 <12` contracts.

---

## File Map

- Create `scripts/wrangler-output.mjs`: parse Wrangler NDJSON and write validated GitHub outputs.
- Create `scripts/wrangler-output.test.ts`: parser and CLI-independent regression coverage.
- Modify `scripts/assert-cloudflare-deployment.mjs`: export testable deployment verification and require release identity.
- Create `scripts/assert-cloudflare-deployment.test.ts`: health/release/Workflow probe tests.
- Create `scripts/assert-preview-workflow-trust.mjs`: parsed workflow-policy checker and CLI.
- Create `scripts/assert-preview-workflow-trust.test.ts`: security-boundary regression tests.
- Create `scripts/extract-preview-artifact.py`: allowlist and safely extract the untrusted Worker archive.
- Create `scripts/extract-preview-artifact.test.ts`: archive-overwrite and link regression coverage.
- Create `scripts/assert-preview-secret-isolation.mjs`: fail deployment unless the preview Worker has
  zero Cloudflare secret bindings.
- Create `.github/workflows/build-preview.yml`: credential-free PR build and artifact upload.
- Modify `.github/workflows/deploy-preview.yml`: trusted `workflow_run` preview deployment from `main`.
- Modify `.github/workflows/deploy-release.yml`: use the shared parser and release verifier.
- Modify `.github/workflows/ci.yml`: run the preview trust policy.
- Modify `package.json` and `pnpm-lock.yaml`: register the policy check and direct test-only YAML parser.
- Modify `docs/deployment/cloudflare-runbook.md`: document the two-workflow preview pipeline and rotation.
- Modify `docs/architecture/phase-1-cloudflare-topology.md`: document the trusted-main boundary.
- Write the existing scan bundle's `artifacts/fix_report.md`: record security-finding remediation and verification.

---

### Task 1: Tested Wrangler NDJSON Parser

**Files:**

- Create: `scripts/wrangler-output.test.ts`
- Create: `scripts/wrangler-output.mjs`
- Modify: `.github/workflows/deploy-release.yml`

**Interfaces:**

- Produces: `parseWranglerEvents(text: string): object[]`
- Produces: `resolvePreviewUrl(events: object[]): string`
- Produces: `resolveDeploymentUrl(events: object[]): string`
- Produces: `resolveVersionId(events: object[]): string`
- Produces CLI: `node scripts/wrangler-output.mjs <preview-url|deployment-url|version-id>`
- CLI consumes: `OUTPUT_FILE`, `GITHUB_OUTPUT`, and `GITHUB_STEP_SUMMARY`

- [ ] **Step 1: Write failing parser tests**

Create `scripts/wrangler-output.test.ts` with literal Wrangler 4.114.0 fixtures:

```ts
import { describe, expect, test } from "vitest";

import {
  parseWranglerEvents,
  resolveDeploymentUrl,
  resolvePreviewUrl,
  resolveVersionId,
} from "./wrangler-output.mjs";

describe("Wrangler output parsing", () => {
  test("resolves the preview alias emitted by Wrangler 4.114.0", () => {
    const events = parseWranglerEvents(
      '{"type":"version-upload","preview_url":"https://version.example.workers.dev","preview_alias_url":"https://pr-42.example.workers.dev"}\\n',
    );
    expect(resolvePreviewUrl(events)).toBe("https://pr-42.example.workers.dev");
  });

  test("falls back to Wrangler's singular preview URL", () => {
    expect(
      resolvePreviewUrl([
        { type: "version-upload", preview_url: "https://version.example.workers.dev" },
      ]),
    ).toBe("https://version.example.workers.dev");
  });

  test("resolves string deployment targets", () => {
    expect(
      resolveDeploymentUrl([{ type: "deploy", targets: ["https://staging.example.workers.dev"] }]),
    ).toBe("https://staging.example.workers.dev");
  });

  test("rejects non-HTTPS and missing deployment URLs", () => {
    expect(() =>
      resolveDeploymentUrl([{ type: "deploy", targets: ["http://example.test"] }]),
    ).toThrow("must use HTTPS");
    expect(() => resolveDeploymentUrl([{ type: "deploy", targets: [] }])).toThrow("did not report");
  });

  test("resolves production version IDs", () => {
    expect(resolveVersionId([{ type: "version-upload", version_id: "version-123" }])).toBe(
      "version-123",
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm vitest run scripts/wrangler-output.test.ts
```

Expected: FAIL because `scripts/wrangler-output.mjs` does not exist.

- [ ] **Step 3: Implement the minimal parser**

Create `scripts/wrangler-output.mjs`. It must:

```js
export function parseWranglerEvents(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length === 0) throw new Error("Wrangler output file is empty");
  return lines.map((line) => JSON.parse(line));
}

function requireHttpsUrl(value, label) {
  if (!value) throw new Error(`Wrangler did not report ${label}`);
  const url = new URL(String(value));
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return url.href;
}
```

`resolvePreviewUrl` must prefer `preview_alias_url`, then `preview_url`, then supported legacy
`preview_urls` entries. `resolveDeploymentUrl` must accept `url`, string `targets` entries, legacy object
target URLs, `worker.url`, and legacy preview URLs in that order. `resolveVersionId` must accept
`version_id` or `id`.

The CLI reads `OUTPUT_FILE`, resolves the selected mode, and appends exactly one output plus one summary:

```text
preview-url    -> url=<https-url>, summary label Preview
deployment-url -> url=<https-url>, summary label Staging
version-id     -> version_id=<id>, summary label Production version
```

Use a `pathToFileURL(process.argv[1]).href === import.meta.url` guard so importing the module has no side
effects.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run the focused Vitest command from Step 2.

Expected: 5 tests PASS.

- [ ] **Step 5: Replace release-workflow inline parsers**

In `.github/workflows/deploy-release.yml`:

- after staging deploy, set `OUTPUT_FILE` and run
  `node scripts/wrangler-output.mjs deployment-url`;
- after production version upload, set `OUTPUT_FILE` and run
  `node scripts/wrangler-output.mjs version-id`;
- delete both inline `node --input-type=module -e` parsers.

- [ ] **Step 6: Re-run parser and workflow-format checks**

Run:

```bash
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm vitest run scripts/wrangler-output.test.ts
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm prettier --check scripts/wrangler-output.mjs scripts/wrangler-output.test.ts .github/workflows/deploy-release.yml
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/wrangler-output.mjs scripts/wrangler-output.test.ts .github/workflows/deploy-release.yml
git commit -m "fix: parse current Wrangler deployment output"
```

---

### Task 2: Enforce Release Identity in Deployment Smoke Tests

**Files:**

- Create: `scripts/assert-cloudflare-deployment.test.ts`
- Modify: `scripts/assert-cloudflare-deployment.mjs`
- Modify: `.github/workflows/deploy-preview.yml` in Task 3

**Interfaces:**

- Produces: `assertCloudflareDeployment(options): Promise<void>`
- `options`: `{ deploymentUrl, expectedReleaseSha, healthcheckToken, fetchImpl?, sleep? }`
- CLI consumes: `DEPLOYMENT_URL`, required `GITHUB_SHA`, and optional `HEALTHCHECK_TOKEN`

- [ ] **Step 1: Write failing release-verification tests**

Create `scripts/assert-cloudflare-deployment.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

import { assertCloudflareDeployment } from "./assert-cloudflare-deployment.mjs";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("deployment verification", () => {
  test("rejects a healthy deployment with the wrong release", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        service: "unseenprompt",
        status: "ok",
        release: "old-release",
      }),
    );

    await expect(
      assertCloudflareDeployment({
        deploymentUrl: "https://preview.example.test",
        expectedReleaseSha: "a".repeat(40),
        fetchImpl,
      }),
    ).rejects.toThrow("release mismatch");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("accepts a matching release and completed Workflow probe", async () => {
    const expectedReleaseSha = "b".repeat(40);
    const responses = [
      jsonResponse({ service: "unseenprompt", status: "ok", release: expectedReleaseSha }),
      jsonResponse({ status: "complete", output: { ok: true } }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);

    await assertCloudflareDeployment({
      deploymentUrl: "https://preview.example.test",
      expectedReleaseSha,
      healthcheckToken: "test-token",
      fetchImpl,
      sleep: async () => undefined,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm vitest run scripts/assert-cloudflare-deployment.test.ts
```

Expected: FAIL because the existing module does not export `assertCloudflareDeployment`.

- [ ] **Step 3: Refactor and implement the minimal verifier**

Move current top-level behavior into `assertCloudflareDeployment`. Require:

```js
if (!expectedReleaseSha) throw new Error("GITHUB_SHA is required");
if (health.release !== expectedReleaseSha) {
  throw new Error(
    `Runtime release mismatch: expected ${expectedReleaseSha}, received ${health.release ?? "missing"}`,
  );
}
```

Perform the release check after the public health/service/status check and before reading or using the
health-check token. Inject `fetchImpl` and `sleep` only for deterministic tests; defaults remain global
`fetch` and a one-second timer. Keep the existing 20-attempt Workflow behavior and idempotency key based
on `expectedReleaseSha`.

Add a guarded CLI `main` which passes `process.env.GITHUB_SHA`. Importing the module must not make network
requests.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the focused Vitest command from Step 2.

Expected: 2 tests PASS.

- [ ] **Step 5: Run existing health-route tests**

Run:

```bash
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm vitest run src/app/api/health/route.test.ts src/app/api/internal/health/workflow/route.test.ts scripts/assert-cloudflare-deployment.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/assert-cloudflare-deployment.mjs scripts/assert-cloudflare-deployment.test.ts
git commit -m "fix: require deployed release identity"
```

---

### Task 3: Split PR Build from Trusted Preview Deployment

**Files:**

- Create: `scripts/assert-preview-workflow-trust.test.ts`
- Create: `scripts/assert-preview-workflow-trust.mjs`
- Create: `.github/workflows/build-preview.yml`
- Modify: `.github/workflows/deploy-preview.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces artifact: `preview-worker-<github.run_id>` containing `preview-worker.tar`
- Trusted deploy consumes: upstream `workflow_run.id`, `workflow_run.head_sha`, and
  `workflow_run.pull_requests[0].number`
- Produces CLI: `node scripts/assert-preview-workflow-trust.mjs`

- [ ] **Step 1: Add the direct test-only YAML parser**

Run:

```bash
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm add --save-dev --save-exact yaml@2.9.0
```

Expected: `package.json` and `pnpm-lock.yaml` record only the direct dev dependency.

- [ ] **Step 2: Write the failing trust-boundary test**

Create `scripts/assert-preview-workflow-trust.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm vitest run scripts/assert-preview-workflow-trust.test.ts
```

Expected: FAIL because the checker and build workflow do not exist.

- [ ] **Step 4: Implement the parsed workflow-policy checker**

Create `scripts/assert-preview-workflow-trust.mjs` using `parse` from `yaml`.

`assertPreviewWorkflowTrust` must reject unless:

- build workflow trigger contains `pull_request`;
- serialized build workflow contains no `${{ secrets.` reference;
- deploy workflow trigger contains `workflow_run` for `Build Preview Artifact`;
- deploy job has a checkout step whose `with.ref` is exactly `main`;
- no deploy checkout selects `github.event.workflow_run.head_sha`;
- deploy job contains no `pnpm cf:build`;
- secret-bearing run steps are only the trusted Wrangler upload and trusted
  preview-secret isolation commands;
- build archive creation dereferences symbolic and hard links;
- deploy job invokes the trusted preview artifact extractor exactly once;
- preview smoke receives no health token.

The guarded CLI reads the two repository workflow paths and prints:

```text
Preview workflow trust boundary is valid.
```

- [ ] **Step 5: Implement credential-free `.github/workflows/build-preview.yml`**

Use:

```yaml
name: Build Preview Artifact

on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]

permissions:
  contents: read
```

The single `build` job keeps the current same-repository/non-draft gate, Node/pnpm setup, frozen install,
and `pnpm cf:build`, but contains no secret references. Then:

```yaml
- name: Package preview Worker
  run: >-
    tar --dereference --hard-dereference
    --create --file preview-worker.tar .open-next
- name: Upload preview Worker
  uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
  with:
    name: preview-worker-${{ github.run_id }}
    path: preview-worker.tar
    if-no-files-found: error
    retention-days: 1
    compression-level: 0
```

- [ ] **Step 6: Replace `.github/workflows/deploy-preview.yml` with trusted deployment**

Use:

```yaml
name: Deploy Preview

on:
  workflow_run:
    workflows: [Build Preview Artifact]
    types: [completed]

permissions:
  actions: read
  contents: read
```

The job gate requires:

```yaml
github.event.workflow_run.conclusion == 'success' &&
github.event.workflow_run.head_repository.full_name == github.repository &&
github.event.workflow_run.pull_requests[0].number != null
```

Set `PR_NUMBER` from `pull_requests[0].number`, `PR_HEAD_SHA` and `RELEASE_SHA` from
`workflow_run.head_sha`, and concurrency from the PR number.

On a fresh runner:

1. checkout `ref: main` with the existing pinned checkout action;
2. set up Node and pnpm from trusted main;
3. run `pnpm install --frozen-lockfile --ignore-scripts`;
4. download the run-scoped artifact using
   `actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` (`v8.0.1`), `run-id`,
   `github-token`, and destination `preview-artifact`;
5. extract with the trusted allowlisting script:

```bash
python3 scripts/extract-preview-artifact.py preview-artifact/preview-worker.tar .
```

The extractor rejects paths outside `.open-next`, duplicate names, links, devices, and other
non-regular members before extracting anything. It then applies `tarfile` `filter="data"` and requires
`.open-next/worker.js`.

6. run trusted `pnpm exec wrangler versions upload` with runner-only deployment credentials, PR alias, and
   `--var RELEASE_SHA:${PR_HEAD_SHA}`;
7. run `node scripts/wrangler-output.mjs preview-url`;
8. run trusted public `pnpm test:cf-deployment` with `GITHUB_SHA: ${PR_HEAD_SHA}` and no health token.

- [ ] **Step 7: Register and run the policy check**

Add:

```json
"check:preview-workflow-trust": "node scripts/assert-preview-workflow-trust.mjs"
```

Add a CI step after dependency policy:

```yaml
- name: Check preview workflow trust boundary
  run: pnpm check:preview-workflow-trust
```

Run:

```bash
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm vitest run scripts/assert-preview-workflow-trust.test.ts
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm check:preview-workflow-trust
```

Expected: both PASS.

- [ ] **Step 8: Re-run the original security reproducer**

Adapt the scan PoC to inspect the current two-workflow design, or run the new parsed policy checker with
an intentionally vulnerable fixture.

Expected: the current repository passes; the fixture which references secrets from `pull_request`
execution fails with `must not reference secrets`.

- [ ] **Step 9: Commit**

```bash
git add .github/workflows/build-preview.yml .github/workflows/deploy-preview.yml .github/workflows/ci.yml scripts/assert-preview-workflow-trust.mjs scripts/assert-preview-workflow-trust.test.ts package.json pnpm-lock.yaml
git commit -m "fix: isolate preview deployment credentials"
```

---

### Task 4: Documentation and Operational Migration

**Files:**

- Modify: `docs/deployment/cloudflare-runbook.md`
- Modify: `docs/architecture/phase-1-cloudflare-topology.md`
- Modify: `docs/superpowers/specs/2026-07-27-phase-1-deployment-review-fixes-design.md`

**Interfaces:**

- Documents the exact names `Build Preview Artifact` and `Deploy Preview`.
- Records operator-only credential rotation and token-scope checks.

- [ ] **Step 1: Update the runbook**

Document:

- PR code builds without secrets in `build-preview.yml`;
- `deploy-preview.yml` is a `workflow_run` definition loaded from `main`;
- `.open-next` crosses the boundary as a tar artifact and is extracted with `tarfile` `data` filtering;
- trusted main Wrangler and smoke scripts deploy the PR head SHA;
- all remote smoke commands require `GITHUB_SHA`;
- operators must replace the old repository token with `PREVIEW_CLOUDFLARE_API_TOKEN`, configure
  `PREVIEW_CLOUDFLARE_ACCOUNT_ID` for a preview-only Cloudflare account, delete the preview Worker
  health secret and obsolete `PREVIEW_HEALTHCHECK_TOKEN`, and verify the preview secret list is empty;
- the preview account must contain no staging or production resources because Workers Scripts
  permissions are account-scoped.

- [ ] **Step 2: Update the topology document**

Replace the direct PR deploy flow with:

```text
PR head -> credential-free OpenNext build -> untrusted artifact
        -> trusted main workflow_run deployer -> preview version -> release-identity smoke
```

State that the artifact is never executed on the privileged runner.

- [ ] **Step 3: Validate documentation consistency**

Run:

```bash
rg -n "deploy-preview|build-preview|workflow_run|GITHUB_SHA|rotate" \
  docs/deployment/cloudflare-runbook.md \
  docs/architecture/phase-1-cloudflare-topology.md
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm prettier --check docs/deployment/cloudflare-runbook.md docs/architecture/phase-1-cloudflare-topology.md
```

Expected: both workflow names, release identity, and rotation appear; formatting PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/deployment/cloudflare-runbook.md docs/architecture/phase-1-cloudflare-topology.md docs/superpowers/specs/2026-07-27-phase-1-deployment-review-fixes-design.md
git commit -m "docs: record trusted preview deployment flow"
```

---

### Task 5: Full Verification and Security Fix Report

**Files:**

- Create outside repository: `<scan_dir>/artifacts/fix_report.md`
- Inspect: all changed files and commits from Tasks 1-4

**Interfaces:**

- Scan directory:
  `/private/var/folders/zp/b9gcl9w96lzg5k856kgm090c0000gn/T/codex-security-scans-BJskqM/UnseenPrompt/3fda909fcd75268bebfd3d29d25a3b820acfb878_20260727T174450Z_u8i97v_g`

- [ ] **Step 1: Inspect scope and patch integrity**

Run:

```bash
git status --short
git diff 3fda909fcd75268bebfd3d29d25a3b820acfb878..HEAD --check
git diff --stat 3fda909fcd75268bebfd3d29d25a3b820acfb878..HEAD
git diff 3fda909fcd75268bebfd3d29d25a3b820acfb878..HEAD -- \
  .github scripts package.json pnpm-lock.yaml docs
```

Confirm every changed line maps to one of the four findings or its tests/documentation.

- [ ] **Step 2: Run focused security and parser verification**

```bash
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm vitest run \
  scripts/wrangler-output.test.ts \
  scripts/assert-cloudflare-deployment.test.ts \
  scripts/assert-preview-workflow-trust.test.ts
PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm check:preview-workflow-trust
```

Expected: all tests and policy checks PASS.

- [ ] **Step 3: Run full repository checks**

Use explicit local Phase 1 values so the ignored local `.env.local` cannot mask repository behavior:

```bash
export PATH=/Users/rudrasatani/.nvm/versions/node/v24.18.0/bin:$PATH
export APP_ENV=local
export NEXT_PUBLIC_APP_URL=http://127.0.0.1:8787
export RELEASE_SHA=local
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm cf:build
pnpm cf:types:check
pnpm check:workers-deps
pnpm check:preview-workflow-trust
pnpm test:cf-preview
```

Expected: every command exits 0. Treat any warning or failure as unresolved until diagnosed.

- [ ] **Step 4: Perform change-aware bypass review**

Re-read the original security finding and verify:

- no `pull_request` workflow references `secrets`;
- the secret-bearing workflow is `workflow_run` and checks out exactly `main`;
- PR head SHA is used only as data/metadata, not as a checkout or executed script source;
- the downloaded artifact is extracted with `tarfile` `data` filtering;
- the deployer never runs `pnpm cf:build` after artifact extraction;
- Wrangler config, parser, and smoke script are from main;
- preview/staging/production smoke steps all pass `GITHUB_SHA`;
- no equivalent inline Wrangler output parser remains.

Run:

```bash
rg -n "secrets\\.|pull_request:|workflow_run:|head_sha|pnpm cf:build|preview_urls|targets.*url" \
  .github/workflows scripts
```

Inspect every match; do not accept search absence alone as proof.

- [ ] **Step 5: Write the scan-local fix report**

Write `<scan_dir>/artifacts/fix_report.md` with:

- outcome `fixed`;
- original PR-head -> secret-bearing process path;
- restored invariant and trusted-main strategy;
- changed repository files;
- red/green evidence for each regression;
- exact verification commands and results;
- statement that the original vulnerable path no longer reproduces;
- statement that automatic same-repository PR preview behavior remains;
- remaining operational work: live GitHub run, Cloudflare token-scope verification, and credential
  rotation.

If verification requires a repository change, return to the owning task, add a failing regression when
behavior changes, implement the narrow correction, rerun that task's gates, and repeat this entire final
verification task. Do not commit scan artifacts or generated local build output.
