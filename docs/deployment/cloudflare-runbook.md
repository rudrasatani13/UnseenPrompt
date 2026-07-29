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

Automatic after **Continuous Integration succeeds** for a push to `main` (`workflow_run`, same commit SHA):

1. Quality gates on the release SHA
2. Require all staging Supabase secrets (fail closed if any are missing)
3. Staging database dry-run + apply pending migrations (`supabase db push`)
4. `pnpm cf:build`
5. `wrangler deploy --env staging --var RELEASE_SHA:<sha>`
6. Resolve URL with `node scripts/wrangler-output.mjs deployment-url`
7. `DEPLOYMENT_URL=... HEALTHCHECK_TOKEN=... GITHUB_SHA=... pnpm test:cf-deployment`

Database migration must succeed before the Worker deploy for the same commit. Never run `supabase/seed.sql` against staging.
Staging secrets are mandatory; the job does not skip migration and deploy the Worker alone.

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

1. Continuous Integration must finish successfully for the push SHA on `main`.
2. Deploy Release starts via `workflow_run` for that exact SHA (not a parallel `push` race).
3. Staging migrates and deploys that SHA.
4. The production job starts only after staging succeeds and the repository variable
   `PRODUCTION_DEPLOY_ENABLED` is exactly `true`.
5. Production database dry-run + apply the same already-tested migration set (never seed).
6. Production Environment variable `PRODUCTION_DB_RECOVERY_CONFIRMED` must be exactly `true`
   (operator confirms backup/PITR coverage for this project) before `db push`.
7. The pipeline dry-runs, uploads a tagged production version for the same release SHA, promotes
   `VERSION_ID@100`, then smokes `https://unseenprompt.com`.

Keep `PRODUCTION_DEPLOY_ENABLED=false` while production promotion is paused. Enabling it affects
future `Deploy Release` runs; it does not deploy by itself. Change the variable only after the
production artifact and release timing are approved. Set `PRODUCTION_DB_RECOVERY_CONFIRMED=false`
again after a promote window if you want the next production migrate to re-require confirmation.

### Database failure and forward repair

Do **not** automatically roll back a failed production database migration with destructive down SQL.
Stop deployment, preserve evidence, and ship a reviewed forward repair migration. Worker rollback does
not roll back PostgreSQL or Storage. Every migration must remain backward-compatible with the
currently running Worker so a Worker-only rollback remains valid.

Required production Environment secrets:

- `PRODUCTION_SUPABASE_ACCESS_TOKEN`
- `PRODUCTION_SUPABASE_PROJECT_REF`
- `PRODUCTION_SUPABASE_DB_PASSWORD`

Required production Environment variable:

- `PRODUCTION_DB_RECOVERY_CONFIRMED` = `true` only after operator-reviewed backup/PITR readiness

Staging Environment secrets use the `STAGING_` prefix with the same shapes and are required
(fail closed).

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

## Production waitlist release notes

- Production Worker secrets: `TURNSTILE_SECRET_KEY`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `WAITLIST_TOKEN_SECRET`.
- Production vars: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `SUPABASE_URL`, `WAITLIST_FROM_EMAIL`.
- Rate limit binding `WAITLIST_RATE_LIMITER` is best-effort (5 / 60s per `CF-Connecting-IP`).
- Turnstile remains the primary abuse control.
- Owner-only removal link helper: `pnpm exec tsx scripts/create-waitlist-removal-link.ts ENTRY_UUID MANAGEMENT_VERSION` (never CI; never log the token).
- Keep `PRODUCTION_DEPLOY_ENABLED=false` except during an explicit promote window.
