# UnseenPrompt — Stateful Project Copilot

**Status:** Phase 1 — Cloudflare runtime and environment topology

**Primary domain:** `https://unseenprompt.com` (Cloudflare Worker Custom Domain)

## What this is not

UnseenPrompt does **not** currently provide:

- Direct repository, IDE, or local-machine access
- Autonomous execution of coding agents
- Team accounts
- Production user authentication or durable product data

Phase 1 establishes Workers environments, readiness probes, and controlled deploy gates on top of Phase 0 foundations.

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

## Canonical quality commands

Run these locally (no Docker):

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
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
pnpm test:db
```

Negative environment test:

```bash
pnpm test:unit -- src/config/env/schema.test.ts
```

## Phase 1 status

| Gate                                      | State                                           |
| ----------------------------------------- | ----------------------------------------------- |
| Local Worker topology + Workflows binding | Implemented                                     |
| Public `/api/health`                      | Implemented                                     |
| Token-protected Workflow probe            | Implemented                                     |
| PR preview + staging/production workflows | Defined in GitHub Actions                       |
| Remote preview/staging deploy             | Requires Cloudflare + GitHub secrets            |
| Production traffic                        | Blocked until zone DNS verification is complete |

Operator procedures: [docs/deployment/cloudflare-runbook.md](docs/deployment/cloudflare-runbook.md).

## Documentation

| Document                                                                                                           | Purpose                         |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| [docs/UnseenPrompt – Stateful Project Copilot.md](docs/UnseenPrompt%20%E2%80%93%20Stateful%20Project%20Copilot.md) | Product master plan             |
| [docs/UnseenPrompt – DEVELOPMENT_PLAN.md](docs/UnseenPrompt%20%E2%80%93%20DEVELOPMENT_PLAN.md)                     | Development roadmap             |
| [docs/architecture/phase-0-foundations.md](docs/architecture/phase-0-foundations.md)                               | Phase 0 architecture decisions  |
| [docs/architecture/phase-1-cloudflare-topology.md](docs/architecture/phase-1-cloudflare-topology.md)               | Phase 1 Workers topology        |
| [docs/deployment/cloudflare-runbook.md](docs/deployment/cloudflare-runbook.md)                                     | Deploy, smoke, rollback         |
| [docs/conventions/naming.md](docs/conventions/naming.md)                                                           | Naming conventions              |
| [docs/development/environment-contract.md](docs/development/environment-contract.md)                               | Environment variable contract   |
| [docs/development/workers-dependencies.md](docs/development/workers-dependencies.md)                               | Workers dependency policy       |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                                                                 | Contribution workflow           |
| [SECURITY.md](SECURITY.md)                                                                                         | Vulnerability and secret policy |
