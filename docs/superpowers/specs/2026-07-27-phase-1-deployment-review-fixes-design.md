# Phase 1 Deployment Review Fixes Design

## Scope

Fix the four findings from the Phase 1 Cloudflare implementation review:

1. Preview URL parsing does not match Wrangler 4.114.0 output.
2. Staging URL parsing treats `targets` entries as objects instead of URL strings.
3. Remote deployment smoke tests do not verify the deployed release SHA.
4. A same-repository pull-request workflow executes PR-controlled code with Cloudflare and health-check
   secrets.

Same-repository, non-draft pull requests must continue to deploy previews automatically before review.
The privileged deployment workflow and all code it executes must come from `main`, while the deployed
Worker must represent the pull request head SHA.

## Security Invariants

- Pull-request-controlled code runs only in a credential-free build job.
- A secret-bearing job never checks out or executes dependencies, package scripts, actions, or
  configuration from a pull-request revision.
- The privileged preview deployer is loaded from the default branch and checks out `main`.
- The PR build output crosses into the privileged workflow only as an inert `.open-next` artifact.
- The trusted deployer does not execute files from the artifact; trusted Wrangler tooling only bundles
  and uploads them.
- The deployed preview Worker has no secret or Workflow bindings; PR code cannot receive runtime
  credentials or capabilities.
- Preview deployment credentials target a separate preview-only Cloudflare account because Workers
  Scripts permissions are account-scoped; they cannot authorize staging or production resources.
- The deployer compares preview, staging, and production account IDs and rejects protected Worker names
  before uploading PR code.
- A deployment smoke test succeeds only when `/api/health` reports the expected release SHA.

## Architecture

### Credential-free PR build workflow

`build-preview.yml` (`Build Preview Artifact`) is the `pull_request` workflow for same-repository,
non-draft pull requests. It:

1. checks out the PR head SHA;
2. installs dependencies and builds the Worker without repository secrets;
3. packages only `.open-next` as a uniquely named GitHub Actions artifact.

This workflow does not deploy, run a remote health probe, or reference Cloudflare credentials.
The trusted deployer obtains the PR number and head SHA from the authoritative `workflow_run` event,
not from artifact-controlled metadata.

### Trusted preview deployment workflow

`deploy-preview.yml` (`Deploy Preview`) is a `workflow_run` workflow stored on `main` and reacts to
successful completions of `Build Preview Artifact`. Because `workflow_run` loads its workflow
definition from the default branch, pull requests cannot modify the privileged job before merge.

The trusted workflow:

1. verifies that the upstream run succeeded and represents a same-repository, non-draft pull request;
2. checks out `main`, including trusted `package.json`, lockfile, Wrangler configuration, and scripts;
3. installs dependencies from `main` on a fresh runner;
4. downloads the exact artifact produced by the triggering workflow run;
5. validates that every tar member stays under `.open-next` and is a regular file or directory, then
   extracts with Python's `tarfile` `data` filter and validates the expected `.open-next/worker.js`
   layout;
6. invokes trusted Wrangler with the preview environment and PR head SHA;
7. resolves the preview alias URL through a tested repository script; and
8. runs the trusted deployment smoke script with the expected PR head SHA.

The deploy workflow uses `actions: read` only to download the upstream artifact and `contents: read` for
the trusted checkout.

## Wrangler Output Parsing

Inline JavaScript parsing is replaced with a small tested module under `scripts/`.

The parser accepts newline-delimited Wrangler events and exposes explicit functions:

- preview upload URL: prefer `preview_alias_url`, then `preview_url`;
- staging deployment URL: accept `url`, a string entry in `targets`, or supported legacy fields;
- production version ID: accept `version_id` or `id`.

All returned deployment URLs must use HTTPS. Missing, malformed, or unsupported output fails with an
actionable error. Workflow wrappers write validated values to `GITHUB_OUTPUT` and
`GITHUB_STEP_SUMMARY`.

## Release Identity Verification

`assert-cloudflare-deployment.mjs` requires a full lowercase `GITHUB_SHA` for remote CI deployment
checks and compares it with `health.release` before any optional authenticated Workflow probe. Preview
uses release-identity smoke only; staging and production additionally run the authenticated probe.

Manual smoke checks remain supported when operators provide the expected SHA, as already documented in
the deployment runbook. The preview trusted workflow supplies the PR head SHA; staging supplies
`github.sha`; production supplies the approved release SHA.

## Failure Handling

- A failed or canceled PR build does not trigger deployment.
- Missing PR metadata, a fork-origin run, unsafe tar members, an invalid artifact layout, or unexpected
  Wrangler output fails before credentials are used for an upload.
- URL parsing never falls back to an unvalidated non-HTTPS value.
- A release mismatch fails before the Workflow probe, preventing a stale deployment from satisfying the
  gate.
- GitHub concurrency groups remain keyed by PR number so newer preview deployments cancel older ones.

## Testing

Tests are added before implementation and must demonstrate the existing failures:

- Wrangler 4.114.0 `version-upload` fixtures resolve `preview_alias_url` and `preview_url`.
- Wrangler deploy fixtures resolve string entries in `targets`.
- malformed and non-HTTPS output is rejected.
- deployment smoke fails when `health.release` differs from `GITHUB_SHA`.
- deployment smoke proceeds for a matching release and valid Workflow completion.
- a workflow policy test proves no `pull_request` job references secrets and that the privileged
  `workflow_run` job uses trusted `main` tooling.
- a safe static regression check based on the original security finding no longer finds a PR-head to
  secret-bearing-process path.

Full validation includes formatting, linting, type checking, unit tests, Next.js build, OpenNext build,
Workers type drift, dependency policy, local Workers preview, and workflow syntax inspection. Remote
Cloudflare execution remains an operator validation because credentials and live infrastructure are not
available locally.

## Documentation And Operations

The Cloudflare runbook and Phase 1 topology document will describe the two-workflow preview pipeline,
trusted-main boundary, expected release assertion, artifact retention, zero-secret preview requirement,
and credential rotation requirement for credentials previously exposed to unmerged same-repository code.

Deploying the workflow files does not remove an existing Cloudflare secret automatically. Platform
operators must delete the preview health secret and obsolete GitHub copy, rotate the old token into
`PREVIEW_CLOUDFLARE_API_TOKEN`, configure a separate preview account, verify the preview secret list is
empty, and prove that account contains no staging or production resources.
