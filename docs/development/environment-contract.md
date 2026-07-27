# Environment contract

## Phase 0 variables

| Variable              | Visibility | Local                   | Preview             | Staging           | Production              | Owner    |
| --------------------- | ---------- | ----------------------- | ------------------- | ----------------- | ----------------------- | -------- |
| `APP_ENV`             | Server     | `local`                 | `preview`           | `staging`         | `production`            | Platform |
| `NEXT_PUBLIC_APP_URL` | Public     | `http://localhost:3000` | ephemeral HTTPS URL | staging HTTPS URL | verified production URL | Platform |

Test runners may use `APP_ENV=test` with `NEXT_PUBLIC_APP_URL=http://localhost:3000`.

## Dummy template

Committed template: `.env.example` (safe defaults only). Copy to `.env.local` for local development. Never put credentials in `.env.example`.

## Adding variables later

Future variables are added only in the phase that introduces their consumer. Every addition requires:

1. Schema and schema tests in `src/config/env`
2. Dummy values in `.env.example` where safe
3. CI and deployment configuration updates
4. Documentation in this matrix

Secrets must never receive dummy-looking production-shaped values in a public (`NEXT_PUBLIC_`) variable.

## Database environment note

Local developer machines are not required to run Supabase via Docker. Database configuration under `supabase/` is exercised in GitHub Actions or staging. Remote Supabase projects are provisioned in later phases, not Phase 0.
