# Cloudflare deployment runbook

Operational procedures for UnseenPrompt Workers. Do **not** put real account IDs, API tokens, health tokens, or version IDs in this document.

## Environment mapping

| Logical environment | Worker name               | Workflow name                    | Trigger                                                                 |
| ------------------- | ------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| Local               | `unseenprompt-local`      | `unseenprompt-health-local`      | Developer command                                                       |
| Preview             | `unseenprompt-preview`    | None                             | `Build Preview Artifact` then trusted `Deploy Preview` (`workflow_run`) |
| Staging             | `unseenprompt-staging`    | `unseenprompt-health-staging`    | Push to `main` (`deploy-release.yml`)                                   |
| Production          | `unseenprompt-production` | `unseenprompt-health-production` | Manual dispatch + GitHub Environment approval                           |

Wrangler named environments create separate Workers. Preview version aliases isolate code and URLs, but they share the preview Worker's bindings. Phase 3 must revisit data isolation when Supabase resources appear.

## Secret ownership and rotation

| Secret                          | Where stored                        | Owner    | Rotation                                                   |
| ------------------------------- | ----------------------------------- | -------- | ---------------------------------------------------------- |
| `HEALTHCHECK_TOKEN`             | Local, staging, production only     | Platform | Generate ≥32 random bytes; never reuse across environments |
| `PREVIEW_CLOUDFLARE_API_TOKEN`  | GitHub repository secret            | Platform | Workers Scripts access in preview-only account             |
| `PREVIEW_CLOUDFLARE_ACCOUNT_ID` | GitHub repository secret            | Platform | Must differ from staging/production account                |
| `CLOUDFLARE_API_TOKEN`          | `staging`/`production` Environments | Platform | Separate non-preview deployment credentials                |
| `CLOUDFLARE_ACCOUNT_ID`         | `staging`/`production` Environments | Platform | Non-preview account identifier                             |
| `STAGING_HEALTHCHECK_TOKEN`     | GitHub repository secret            | Platform | Must match staging Worker secret                           |
| `PRODUCTION_HEALTHCHECK_TOKEN`  | GitHub Environment `production`     | Platform | Must match production Worker secret                        |

**The preview Worker must have no secret or Workflow bindings. Never copy production secrets into
preview or staging.**

### Operator rotation after Phase 1 review

After any suspected exposure or after adopting the trusted-preview pipeline:

1. Revoke the old repository-level `CLOUDFLARE_API_TOKEN`. Create
   `PREVIEW_CLOUDFLARE_API_TOKEN` in a preview-only Cloudflare account and configure
   `PREVIEW_CLOUDFLARE_ACCOUNT_ID`.
2. Delete `HEALTHCHECK_TOKEN` from `unseenprompt-preview` and delete the obsolete
   `PREVIEW_HEALTHCHECK_TOKEN` GitHub secret.
3. Confirm `wrangler secret list --env preview --format json` returns `[]`.
4. Prove the preview account ID differs from staging/production and the preview token has no zone,
   route, storage, or non-Worker permissions. Workers Scripts permissions are account-scoped, so
   same-account isolation is insufficient.

Generate a local token for Wrangler:

```bash
openssl rand -base64 48
pnpm exec wrangler secret put HEALTHCHECK_TOKEN --env staging
pnpm exec wrangler secret put HEALTHCHECK_TOKEN --env production
```

Do not provision a health token for preview. If one exists from the earlier design, remove it:

```bash
pnpm exec wrangler secret delete HEALTHCHECK_TOKEN --env preview
pnpm exec wrangler secret list --env preview --format json
```

## Local commands

```bash
cp .dev.vars.example .dev.vars
# Replace HEALTHCHECK_TOKEN with ≥32 random bytes

pnpm cf:types:check
pnpm check:workers-deps
pnpm check:preview-workflow-trust
pnpm cf:build
pnpm test:cf-preview
```

Local preview URL: `http://127.0.0.1:8787`.

## Remote preview (two-workflow pipeline)

Same-repository, non-draft PRs still get automatic previews, with a hard trust boundary:

1. **`Build Preview Artifact`** (`.github/workflows/build-preview.yml`) runs on `pull_request`.
   - Checks out the PR head and runs `pnpm cf:build` **without secrets**.
   - Dereferences build-time links, packages `.open-next` as `preview-worker.tar`, and uploads artifact
     `preview-worker-<run_id>`.
2. **`Deploy Preview`** (`.github/workflows/deploy-preview.yml`) runs on `workflow_run` for successful
   `Build Preview Artifact` completions.
   - Workflow definition is **loaded from `main`** (not from the PR branch).
   - Checks out **exactly** `ref: main` for Wrangler config, scripts, and lockfile.
   - Downloads the untrusted tar artifact and validates every member before extraction: paths must stay
     under `.open-next`, and only regular files and directories are accepted. Python `tarfile`
     `filter="data"` provides an additional extraction boundary.
   - Never executes files from the artifact; never runs `pnpm cf:build` on the privileged runner.
   - Fails before upload unless the preview Worker has zero Cloudflare secret bindings.
   - Uploads a preview Worker version with alias `pr-<number>` and `RELEASE_SHA` set to the PR head SHA.
   - Resolves the preview URL via `node scripts/wrangler-output.mjs preview-url`.
   - Runs public release-identity smoke with `pnpm test:cf-deployment`; preview receives no health token
     or Workflow binding.

Fork PRs skip remote deploy (no secrets on untrusted forks); normal CI still runs.

## Staging

Automatic on push to `main`:

1. Quality gates + `pnpm cf:build`
2. `wrangler deploy --env staging --var RELEASE_SHA:<sha>`
3. Resolve URL with `node scripts/wrangler-output.mjs deployment-url`
4. `DEPLOYMENT_URL=... HEALTHCHECK_TOKEN=... GITHUB_SHA=... pnpm test:cf-deployment`

All remote smoke commands **require** `GITHUB_SHA` (the exact expected 40-character release identity).

Manual smoke (values only via process environment, never committed):

```bash
DEPLOYMENT_URL="$STAGING_DEPLOYMENT_URL" \
HEALTHCHECK_TOKEN="$STAGING_HEALTHCHECK_TOKEN" \
GITHUB_SHA="$(git rev-parse HEAD)" \
pnpm test:cf-deployment
```

`STAGING_DEPLOYMENT_URL` must be HTTPS.

## Production dry-run and promotion

Production never uses `wrangler deploy` for live traffic. Upload and promote are separate.

### Dry-run (required before promotion)

```bash
pnpm cf:dry-run:production
# or after cf:build:
pnpm exec wrangler deploy --env production --dry-run
```

### Controlled promotion (GitHub Actions)

1. Ensure the commit is already on `main`.
2. Ensure GitHub Environment variable `PRODUCTION_DOMAIN_VERIFIED` is exactly `true`.
3. Run **Deploy Release** workflow_dispatch with `target=production` and the full 40-char SHA.
4. Approve the `production` environment gate.
5. Pipeline dry-runs, uploads a tagged version, promotes `VERSION_ID@100`, then smokes `https://unseenprompt.com` with `GITHUB_SHA` set to the release SHA.

Production routes:

- `unseenprompt.com/*`
- `www.unseenprompt.com/*`

Do not promote while zone ownership or DNS verification is incomplete.

## Rollback

```bash
pnpm exec wrangler deployments list --env production
# Copy the reviewed previous version ID into PREVIOUS_VERSION_ID, then:
pnpm exec wrangler versions deploy --env production "${PREVIOUS_VERSION_ID}@100" --yes
```

After rollback, re-run runtime and Workflow smoke against `https://unseenprompt.com` with the rolled-back release `GITHUB_SHA`. Worker version rollback does **not** roll back databases, object storage, or external state.

## Logs

```bash
pnpm exec wrangler tail --env staging
pnpm exec wrangler tail --env production
```

Log only instance IDs and terminal statuses for health probes. Never log `Authorization` headers or tokens.

## DNS and zone verification checklist

- [ ] Cloudflare owns/verifies the `unseenprompt.com` zone
- [ ] DNS records point at the production Worker routes as intended
- [ ] `www` and apex both resolve correctly
- [ ] Repository/environment variable `PRODUCTION_DOMAIN_VERIFIED` set to `true` only after verification
- [ ] Staging custom hostname (optional later): `staging.unseenprompt.com`

## Incident: suspected secret exposure

1. Revoke the Cloudflare API token immediately.
2. Delete any preview `HEALTHCHECK_TOKEN`; rotate local, staging, and production health tokens (new
   random values; update the matching non-preview GitHub secrets).
3. Audit recent Worker versions and deployments.
4. Re-issue least-privilege tokens only after access is restored.
