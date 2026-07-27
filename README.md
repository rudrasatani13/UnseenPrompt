# UnseenPrompt — Stateful Project Copilot

**Status:** Pre-development; Phase 0 foundation

## What this is not

UnseenPrompt does **not** currently provide:

- Direct repository, IDE, or local-machine access
- Autonomous execution of coding agents
- Team accounts
- Production service connections (Cloudflare, Supabase, AI providers, billing)

Phase 0 establishes the repository, toolchain, and quality gates only.

## Prerequisites

- Node.js 24.x
- pnpm 11.17.0
- Git

**Docker is not required on developer machines.** Database tests (`pnpm test:db`) are verified in GitHub Actions CI or a shared staging environment, not by pulling local Supabase Docker images.

## Bootstrap

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

## Canonical quality commands

Run these locally (no Docker):

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm cf:build
pnpm test:cf-preview
```

Database gate (CI / cloud / staging only):

```bash
# Do not run against local Docker on developer Macs by default.
# Verified in GitHub Actions `database` job or a shared staging runner.
pnpm test:db
```

Negative environment test:

```bash
pnpm test:unit -- src/config/env/schema.test.ts
```

## Documentation

| Document | Purpose |
|---|---|
| [docs/UnseenPrompt – Stateful Project Copilot.md](docs/UnseenPrompt%20%E2%80%93%20Stateful%20Project%20Copilot.md) | Product master plan |
| [docs/UnseenPrompt – DEVELOPMENT_PLAN.md](docs/UnseenPrompt%20%E2%80%93%20DEVELOPMENT_PLAN.md) | Development roadmap |
| [docs/architecture/phase-0-foundations.md](docs/architecture/phase-0-foundations.md) | Phase 0 architecture decisions |
| [docs/conventions/naming.md](docs/conventions/naming.md) | Naming conventions |
| [docs/development/environment-contract.md](docs/development/environment-contract.md) | Environment variable contract |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution workflow |
| [SECURITY.md](SECURITY.md) | Vulnerability and secret policy |
