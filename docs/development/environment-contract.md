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

Local developer machines do not run Supabase via Docker. Database configuration under `supabase/` is exercised against an isolated database on a GitHub-hosted Actions runner. Shared staging and production are not unit-test targets.

PR CI never receives remote Supabase credentials. Forked PR code must never be able to write a remote database.

## Phase 3 data realms

| Realm       | Implementation                                         | Data rule                    | Mutation source            |
| ----------- | ------------------------------------------------------ | ---------------------------- | -------------------------- |
| CI/PR       | Ephemeral local Supabase stack on GitHub-hosted runner | Synthetic seed only          | CI `database` job          |
| Development | Persistent Supabase branch or separate project         | Synthetic data only          | Explicit migration job     |
| Staging     | Persistent Supabase branch or separate project         | Synthetic/staging data only  | Release workflow           |
| Production  | Existing production Supabase project                   | Real waitlist + product data | Protected release workflow |

Prefer persistent Supabase branches when the account supports them; otherwise use separate projects with the same migrations. This repository uses a custom GitHub Actions migration gate ordered with the Cloudflare release (not Supabase automatic production deploy from GitHub).

## Phase 3 remote migration secrets (environment-scoped)

Store these only in protected GitHub Environments. Never commit values or put them in PR jobs.

| Name                               | Environment  | Purpose                                    |
| ---------------------------------- | ------------ | ------------------------------------------ |
| `STAGING_SUPABASE_ACCESS_TOKEN`    | `staging`    | Supabase CLI access token for staging      |
| `STAGING_SUPABASE_PROJECT_REF`     | `staging`    | Staging project reference                  |
| `STAGING_SUPABASE_DB_PASSWORD`     | `staging`    | Database password when required by the CLI |
| `PRODUCTION_SUPABASE_ACCESS_TOKEN` | `production` | Supabase CLI access token for production   |
| `PRODUCTION_SUPABASE_PROJECT_REF`  | `production` | Production project reference               |
| `PRODUCTION_SUPABASE_DB_PASSWORD`  | `production` | Database password when required by the CLI |

| Variable / secret                  | Environment  | Purpose                                                              |
| ---------------------------------- | ------------ | -------------------------------------------------------------------- |
| `PRODUCTION_DB_RECOVERY_CONFIRMED` | `production` | GitHub Environment variable; must be exactly `true` before `db push` |

Staging and production migration steps fail closed when any required Supabase credential is missing.
`Deploy Release` runs only after `Continuous Integration` succeeds for the same commit SHA
(`workflow_run`), not on an independent `push` race.

Seed SQL runs only on ephemeral CI reset / local non-production reset. Release workflows must never execute seed against staging or production.

Application Supabase clients for product auth remain Phase 4. Production waitlist continues to use server-only `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (do not rename or expose those as public client keys).

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

## Phase 4 application auth

| Variable                               | Visibility | Local                    | Preview                   | Staging                   | Production         | Owner    |
| -------------------------------------- | ---------- | ------------------------ | ------------------------- | ------------------------- | ------------------ | -------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Public     | `http://127.0.0.1:54321` | preview project HTTPS URL | staging project HTTPS URL | unset until launch | Platform |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public     | local publishable key    | preview publishable key   | staging publishable key   | unset until launch | Platform |

Validated in `src/config/supabase` (not `src/config/env`). HTTPS is required when `APP_ENV` is
`staging` or `production`; HTTP loopback is allowed for `local` and `test`. The publishable key
must be non-empty, at most 255 characters, and must never start with `sb_secret` — a pasted
secret key fails validation rather than shipping to the client bundle.

Production values stay unset until the launch phase enables the product surface. Validation is
lazy: only consumers parse these values, so the production coming-soon path does not require
them.

Supabase Auth dashboard prerequisites are operator-owned and configured outside this repository:
redirect URLs per environment, the Google provider, the magic-link email template, and custom
SMTP for staging and production.

The waitlist variables above are unchanged: `SUPABASE_URL` and `SUPABASE_SECRET_KEY` remain
server-only production waitlist credentials and are never exposed as public client keys.

## Phase 5 typed model gateway

Model gateway configuration is server-only and is read exclusively by
`src/config/model/server.ts`. Provider credentials are operator-owned protected secrets. They must
never use a `NEXT_PUBLIC_` name, appear in `.env.example`, enter client bundles, or be written to
logs, fixtures, snapshots, or deployment artifacts.

| Name                                                   | Visibility | Contract                                                                    | Owner          |
| ------------------------------------------------------ | ---------- | --------------------------------------------------------------------------- | -------------- |
| `ANTHROPIC_API_KEY`                                    | Secret     | Required when an Anthropic route is referenced; unused keys may be omitted  | Model operator |
| `OPENAI_API_KEY`                                       | Secret     | Required when an OpenAI route is referenced; unused keys may be omitted     | Model operator |
| `GEMINI_API_KEY`                                       | Secret     | Required when a Gemini route is referenced; unused keys may be omitted      | Model operator |
| `MODEL_PRIMARY_PROVIDER`                               | Server     | `anthropic`, `openai`, or `gemini`                                          | Model operator |
| `MODEL_PRIMARY_MODEL`                                  | Server     | 1–160 characters: letters, digits, `.`, `_`, `:`, `/`, or `-`               | Model operator |
| `MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS`   | Server     | Nonnegative integer, at most `1_000_000_000_000`                            | Model operator |
| `MODEL_PRIMARY_OUTPUT_COST_MICROS_PER_MILLION_TOKENS`  | Server     | Nonnegative integer, at most `1_000_000_000_000`                            | Model operator |
| `MODEL_FALLBACK_PROVIDER`                              | Server     | Required and must differ from `MODEL_PRIMARY_PROVIDER`                      | Model operator |
| `MODEL_FALLBACK_MODEL`                                 | Server     | Same bounded identifier contract as the primary model                       | Model operator |
| `MODEL_FALLBACK_INPUT_COST_MICROS_PER_MILLION_TOKENS`  | Server     | Nonnegative integer, at most `1_000_000_000_000`                            | Model operator |
| `MODEL_FALLBACK_OUTPUT_COST_MICROS_PER_MILLION_TOKENS` | Server     | Nonnegative integer, at most `1_000_000_000_000`                            | Model operator |
| `MODEL_REVIEWER_PROVIDER`                              | Server     | Optional; reviewer fields must be configured as one complete group          | Model operator |
| `MODEL_REVIEWER_MODEL`                                 | Server     | Optional; required with the reviewer provider and both rates                | Model operator |
| `MODEL_REVIEWER_INPUT_COST_MICROS_PER_MILLION_TOKENS`  | Server     | Optional; nonnegative integer when reviewer is enabled                      | Model operator |
| `MODEL_REVIEWER_OUTPUT_COST_MICROS_PER_MILLION_TOKENS` | Server     | Optional; nonnegative integer when reviewer is enabled                      | Model operator |
| `MODEL_TOTAL_DEADLINE_MS`                              | Server     | Integer `1_000`–`120_000`; default `30_000`                                 | Model operator |
| `MODEL_ATTEMPT_TIMEOUT_MS`                             | Server     | Integer `500`–`60_000`, never greater than total deadline; default `12_000` | Model operator |
| `MODEL_MAX_OUTPUT_TOKENS`                              | Server     | Integer `64`–`65_536`; default `4_096`                                      | Model operator |

The parser is strict and rejects unknown model settings. Callers cannot configure execution
budgets: production calls are capped at three, with one transport retry, one structured repair,
one fallback entry, and one reviewer call (four provider calls absolute when the reviewer is
enabled). These limits are code-owned invariants.

Rates are estimates used for safe generation metadata, not billing authority. Model catalogs and
provider prices drift independently of this repository. The model operator must update the
route-specific micros-per-million-token rates in protected environment settings when provider
pricing or the selected model changes; historical estimates are not rewritten. A missing or stale
rate must be handled as an operator configuration issue, never by trusting a caller-supplied rate.

The committed `.env.example` contains only commented non-secret route examples; it never contains
provider-key names or values. `.dev.vars.example` may show commented secret placeholders solely to
document the local secret shape. For local or test execution, copy the route shape into the ignored
`.env.local` or `.dev.vars` file and use synthetic credentials supplied through the local secret
mechanism. Never place a real provider key in either committed template, and never configure
production-shaped credentials for preview or staging while Phase 5 remains infrastructure-only.
