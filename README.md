# UnseenPrompt

**Status:** Phase 3 — Supabase data platform and ownership model

**Primary domain:** `https://unseenprompt.com` (Cloudflare Worker Custom Domain)

## What this is not

UnseenPrompt does **not** currently provide:

- Direct repository, IDE, or local-machine access
- Autonomous execution of coding agents
- Team accounts
- Production user authentication clients (Phase 4) — schema and RLS are in place

Phase 3 delivers versioned product schema, personal-account isolation, immutable history, atomic
project writes, and private Storage foundations.

## Prerequisites

- Node.js 24.x
- pnpm 11.17.0
- Git

**Docker is not required on developer machines.** Database tests (`pnpm test:db`) run against an isolated database on a GitHub-hosted Actions runner, not against local Docker or shared staging.

## Bootstrap

```bash
cp .env.example .env.local
cp .dev.vars.example .dev.vars
# Replace HEALTHCHECK_TOKEN in .dev.vars with ≥32 random bytes (file is gitignored)
pnpm install --frozen-lockfile
pnpm dev
```

`.dev.vars` is ignored; never commit real tokens.

## Design system

See [docs/development/design-system.md](docs/development/design-system.md) for
the monochrome tokens, component ownership, shell dimensions, gallery exposure,
and brand regeneration (`pnpm brand:assets` and `pnpm brand:social`).

Public product copy follows [docs/development/product-copy.md](docs/development/product-copy.md).

## Canonical quality commands

Run these locally (no Docker):

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm test:e2e:maintenance
pnpm test:e2e:production
pnpm build
pnpm cf:types:check
pnpm check:workers-deps
pnpm cf:build
pnpm test:cf-preview
```

Cloudflare dry-runs (no remote upload):

```bash
pnpm cf:dry-run:preview
pnpm cf:dry-run:staging
pnpm cf:dry-run:production
```

Database gate (GitHub Actions only):

```bash
# Do not run against local Docker on developer Macs.
# The GitHub Actions `database` job supplies the isolated database.
pnpm exec supabase db start
pnpm exec supabase db reset --yes
pnpm db:lint
pnpm test:db
pnpm db:types:check
```

Committed types: `src/lib/supabase/database.types.ts` (regenerate with `pnpm db:types`).

Negative environment test:

```bash
pnpm test:unit -- src/config/env/schema.test.ts
```

## Phase status

| Gate                                              | State                                          |
| ------------------------------------------------- | ---------------------------------------------- |
| Local Worker topology + Workflows binding         | Implemented                                    |
| Public `/api/health`                              | Implemented                                    |
| Token-protected Workflow probe                    | Implemented                                    |
| PR validation                                     | Local Worker build + smoke in GitHub Actions   |
| Product schema + RLS + pgTAP                      | Implemented (CI `database` job)                |
| Atomic `create_project` / `commit_project_change` | Implemented                                    |
| Private `project-artifacts` bucket                | Implemented (read-only client policies)        |
| Staging deployment                                | DB migrate then Worker on push to `main`       |
| Production deployment                             | Paused unless `PRODUCTION_DEPLOY_ENABLED=true` |
| Production traffic                                | Live on `unseenprompt.com` and `www`           |

Operator procedures: [docs/deployment/cloudflare-runbook.md](docs/deployment/cloudflare-runbook.md).
Execution plan: [docs/architecture/phase-3-supabase-data-platform-execution-plan.md](docs/architecture/phase-3-supabase-data-platform-execution-plan.md).

## Documentation

| Document                                                                                                                                 | Purpose                         |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| [docs/UnseenPrompt – PRODUCT_PLAN.md](docs/UnseenPrompt%20%E2%80%93%20PRODUCT_PLAN.md)                                                   | Product master plan             |
| [docs/UnseenPrompt – DEVELOPMENT_PLAN.md](docs/UnseenPrompt%20%E2%80%93%20DEVELOPMENT_PLAN.md)                                           | Development roadmap             |
| [docs/architecture/phase-0-foundations.md](docs/architecture/phase-0-foundations.md)                                                     | Phase 0 architecture decisions  |
| [docs/architecture/phase-1-cloudflare-topology.md](docs/architecture/phase-1-cloudflare-topology.md)                                     | Phase 1 Workers topology        |
| [docs/architecture/phase-3-supabase-data-platform-execution-plan.md](docs/architecture/phase-3-supabase-data-platform-execution-plan.md) | Phase 3 agent execution plan    |
| [docs/deployment/cloudflare-runbook.md](docs/deployment/cloudflare-runbook.md)                                                           | Deploy, smoke, rollback         |
| [docs/conventions/naming.md](docs/conventions/naming.md)                                                                                 | Naming conventions              |
| [docs/development/environment-contract.md](docs/development/environment-contract.md)                                                     | Environment variable contract   |
| [docs/development/workers-dependencies.md](docs/development/workers-dependencies.md)                                                     | Workers dependency policy       |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                                                                                       | Contribution workflow           |
| [SECURITY.md](SECURITY.md)                                                                                                               | Vulnerability and secret policy |
