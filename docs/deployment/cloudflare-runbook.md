# Cloudflare deployment runbook

Operational procedures for UnseenPrompt Workers. Do **not** put real account IDs, API tokens, health tokens, or version IDs in this document.

## Environment mapping

| Logical environment | Worker name               | Workflow name                    | Trigger                                                     |
| ------------------- | ------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Local               | `unseenprompt-local`      | `unseenprompt-health-local`      | Developer command                                           |
| Staging             | `unseenprompt-staging`    | `unseenprompt-health-staging`    | Push to `main` (`deploy-release.yml`)                       |
| Production          | `unseenprompt-production` | `unseenprompt-health-production` | After staging succeeds and `PRODUCTION_DEPLOY_ENABLED=true` |

## Secret ownership and rotation

| Secret                         | Where stored                        | Owner    | Rotation                                                   |
| ------------------------------ | ----------------------------------- | -------- | ---------------------------------------------------------- |
| `HEALTHCHECK_TOKEN`            | Local, staging, production only     | Platform | Generate ≥32 random bytes; never reuse across environments |
| `CLOUDFLARE_API_TOKEN`         | `staging`/`production` Environments | Platform | Separate credentials for each deployment environment       |
| `CLOUDFLARE_ACCOUNT_ID`        | `staging`/`production` Environments | Platform | Cloudflare account identifier                              |
| `STAGING_HEALTHCHECK_TOKEN`    | GitHub Environment `staging`        | Platform | Must match staging Worker secret                           |
| `PRODUCTION_HEALTHCHECK_TOKEN` | GitHub Environment `production`     | Platform | Must match production Worker secret                        |

Generate a local token for Wrangler:

```bash
openssl rand -base64 48
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

Pull requests run the local `cloudflare-preview` CI job but do not deploy a remote Worker.

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

### Gated promotion (GitHub Actions)

1. A push or merge to `main` deploys and smokes staging.
2. The production job starts only after staging succeeds and the repository variable
   `PRODUCTION_DEPLOY_ENABLED` is exactly `true`.
3. The pipeline dry-runs, uploads a tagged production version for the same `github.sha`, promotes
   `VERSION_ID@100`, then smokes `https://unseenprompt.com`.

Keep `PRODUCTION_DEPLOY_ENABLED=false` while production promotion is paused. Enabling it affects
future `Deploy Release` runs; it does not deploy by itself. Change the variable only after the
production artifact and release timing are approved.

Production Custom Domains:

- `unseenprompt.com`
- `www.unseenprompt.com`

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
- [ ] Repository variable `PRODUCTION_DEPLOY_ENABLED` set to `true` only during approved promotion windows
- [ ] Staging custom hostname (optional later): `staging.unseenprompt.com`

## Incident: suspected secret exposure

1. Revoke the Cloudflare API token immediately.
2. Rotate local, staging, and production health tokens and update the matching GitHub secrets.
3. Audit recent Worker versions and deployments.
4. Re-issue least-privilege tokens only after access is restored.
