# Cloudflare deployment runbook

Operational procedures for UnseenPrompt Workers. Do **not** put real account IDs, API tokens, health tokens, or version IDs in this document.

## Environment mapping

| Logical environment | Worker name               | Workflow name                    | Trigger                                         |
| ------------------- | ------------------------- | -------------------------------- | ----------------------------------------------- |
| Local               | `unseenprompt-local`      | `unseenprompt-health-local`      | Developer command                               |
| Preview             | `unseenprompt-preview`    | `unseenprompt-health-preview`    | Pull request open/update (`deploy-preview.yml`) |
| Staging             | `unseenprompt-staging`    | `unseenprompt-health-staging`    | Push to `main` (`deploy-release.yml`)           |
| Production          | `unseenprompt-production` | `unseenprompt-health-production` | Manual dispatch + GitHub Environment approval   |

Wrangler named environments create separate Workers. Preview version aliases isolate code and URLs, but they share the preview Worker's bindings. Phase 3 must revisit data isolation when Supabase resources appear.

## Secret ownership and rotation

| Secret                         | Where stored                    | Owner    | Rotation                                                   |
| ------------------------------ | ------------------------------- | -------- | ---------------------------------------------------------- |
| `HEALTHCHECK_TOKEN` (per env)  | Cloudflare Worker secret        | Platform | Generate ≥32 random bytes; never reuse across environments |
| `CLOUDFLARE_API_TOKEN`         | GitHub repository secret        | Platform | Least-privilege; revoke on suspicion                       |
| `CLOUDFLARE_ACCOUNT_ID`        | GitHub repository secret        | Platform | Account constant; not a credential by itself               |
| `PREVIEW_HEALTHCHECK_TOKEN`    | GitHub repository secret        | Platform | Must match preview Worker secret                           |
| `STAGING_HEALTHCHECK_TOKEN`    | GitHub repository secret        | Platform | Must match staging Worker secret                           |
| `PRODUCTION_HEALTHCHECK_TOKEN` | GitHub Environment `production` | Platform | Must match production Worker secret                        |

**Never copy production secrets into preview or staging.**

Generate a local token for Wrangler:

```bash
openssl rand -base64 48
pnpm exec wrangler secret put HEALTHCHECK_TOKEN --env preview
pnpm exec wrangler secret put HEALTHCHECK_TOKEN --env staging
pnpm exec wrangler secret put HEALTHCHECK_TOKEN --env production
```

## Local commands

```bash
cp .dev.vars.example .dev.vars
# Replace HEALTHCHECK_TOKEN with ≥32 random bytes

pnpm cf:types:check
pnpm check:workers-deps
pnpm cf:build
pnpm test:cf-preview
```

Local preview URL: `http://127.0.0.1:8787`.

## Remote preview

Handled by `.github/workflows/deploy-preview.yml` for same-repository, non-draft PRs. Outputs:

- versioned Workers preview URL
- alias `pr-<number>`
- remote smoke via `pnpm test:cf-deployment`

Fork PRs skip remote deploy (secrets unavailable); CI still runs.

## Staging

Automatic on push to `main`:

1. Quality gates + `pnpm cf:build`
2. `wrangler deploy --env staging --var RELEASE_SHA:<sha>`
3. `DEPLOYMENT_URL=... HEALTHCHECK_TOKEN=... pnpm test:cf-deployment`

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
5. Pipeline dry-runs, uploads a tagged version, promotes `VERSION_ID@100`, then smokes `https://unseenprompt.com`.

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

After rollback, re-run runtime and Workflow smoke against `https://unseenprompt.com`. Worker version rollback does **not** roll back databases, object storage, or external state.

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
2. Rotate preview, staging, and production `HEALTHCHECK_TOKEN` values (new random values; update GitHub secrets to match).
3. Audit recent Worker versions and deployments.
4. Re-issue least-privilege tokens only after access is restored.
