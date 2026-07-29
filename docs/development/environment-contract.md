# Environment contract

## Phase 0–1 variables

| Variable              | Visibility | Local                   | Preview                 | Staging           | Production                 | Owner               |
| --------------------- | ---------- | ----------------------- | ----------------------- | ----------------- | -------------------------- | ------------------- |
| `APP_ENV`             | Server     | `local`                 | `preview`               | `staging`         | `production`               | Platform            |
| `NEXT_PUBLIC_APP_URL` | Public     | `http://localhost:3000` | canonical preview HTTPS | staging HTTPS URL | `https://unseenprompt.com` | Platform            |
| `RELEASE_SHA`         | Server     | `local`                 | Git commit SHA          | Git commit SHA    | Git commit SHA             | Deployment pipeline |
| `HEALTHCHECK_TOKEN`   | Secret     | `.dev.vars`             | Cloudflare secret       | Cloudflare secret | Cloudflare secret          | Platform            |

Test runners may use `APP_ENV=test` with `NEXT_PUBLIC_APP_URL=http://localhost:3000` and `RELEASE_SHA=test`.

`NEXT_PUBLIC_APP_URL` is the canonical environment URL (for example `https://preview.unseenprompt.com` or the staging/production host), not a per-version preview URL. Authentication callback URLs are deferred to Phase 4.

`HEALTHCHECK_TOKEN` must be at least 32 random bytes, unique to local, staging, or production, and never
committed. Preview intentionally has no health token. Local copies live only in ignored `.dev.vars`.

## Dummy template

Committed templates:

- `.env.example` — safe defaults only; copy to `.env.local` for local Next.js development
- `.dev.vars.example` — local Wrangler secret shape only; copy to `.dev.vars` and replace the token

Never put credentials in `.env.example` or real tokens in `.dev.vars.example`.

## Adding variables later

Future variables are added only in the phase that introduces their consumer. Every addition requires:

1. Schema and schema tests in `src/config/env`
2. Dummy values in `.env.example` where safe
3. CI and deployment configuration updates
4. Documentation in this matrix

Secrets must never receive dummy-looking production-shaped values in a public (`NEXT_PUBLIC_`) variable.

## Database environment note

Local developer machines do not run Supabase via Docker. Database configuration under `supabase/` is exercised against an isolated database on a GitHub-hosted Actions runner. Shared staging and production are not unit-test targets. Remote Supabase projects and isolated Preview Branches are provisioned in later phases, not Phase 0.

## Production waitlist (production only)

These values must never be configured on preview or staging:

| Name                             | Visibility                                       |
| -------------------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public                                           |
| `TURNSTILE_SECRET_KEY`           | Secret                                           |
| `SUPABASE_URL`                   | Server                                           |
| `SUPABASE_SECRET_KEY`            | Secret                                           |
| `RESEND_API_KEY`                 | Secret                                           |
| `WAITLIST_TOKEN_SECRET`          | Secret                                           |
| `WAITLIST_FROM_EMAIL`            | Server (`UnseenPrompt <hello@unseenprompt.com>`) |
