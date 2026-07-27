# Phase 0 — Architecture Foundations

## Decision: single deployable Next.js repository

UnseenPrompt is one App Router application, not a monorepo or premature service split. Domain rules, features, shared infrastructure, UI, and routes live as import layers under `src/`. Supabase migrations/tests, Cloudflare adapter config, scripts, and docs stay at repository root.

## Dependency direction and trust boundaries

| Layer              | Role                               | May import                                | Must not import                     |
| ------------------ | ---------------------------------- | ----------------------------------------- | ----------------------------------- |
| `src/domain`       | Pure types and deterministic rules | other domain modules                      | app, features, components, lib      |
| `src/lib`          | Technical adapters and utilities   | domain                                    | app, features, components           |
| `src/components`   | Reusable presentation              | components, shared UI                     | app, features                       |
| `src/features`     | Feature orchestration              | domain, lib, components                   | app routes                          |
| `src/config`       | Validated configuration            | pure parsers; server modules may read env | client importing server-only config |
| `src/app`          | Routes and composition             | all lower layers                          | —                                   |
| `supabase`         | Migrations and database tests      | SQL only                                  | application source                  |
| External providers | Later phases                       | via `lib` adapters                        | domain types named after providers  |

## Server-only secret boundary

Only server modules may read non-`NEXT_PUBLIC_` values. `getServerEnvironment()` is marked `server-only`. Client bundles must never import server configuration modules.

## State boundary (later phases)

Models will propose state changes. Deterministic application code and the database will validate and own state. Users confirm state-changing operations. Phase 0 does not implement the state engine.

## Runtime boundary

Local Node builds (`pnpm build`) are necessary but insufficient. Cloudflare Workers packaging via OpenNext (`pnpm cf:build`) and a local Wrangler preview (`pnpm test:cf-preview`) are mandatory gates for Workers compatibility.

## Database verification boundary

Local Supabase Docker is **not** a required developer-machine dependency. Disk cost of the full Supabase stack is high.

| Verification                                  | Environment                                          |
| --------------------------------------------- | ---------------------------------------------------- |
| Unit, lint, typecheck, Next build, CF preview | Developer machine + CI                               |
| `pnpm test:db` (pgTAP)                        | **GitHub Actions CI or shared cloud/staging runner** |

`supabase/config.toml`, empty `migrations/`, and `tests/database/00000_smoke.test.sql` remain in-repo so CI/staging can run the suite without inventing schema early.

## Deferred decisions

| Topic                                  | Phase |
| -------------------------------------- | ----- |
| Remote Cloudflare environment topology | 1     |
| Warm Editorial visual system           | 2     |
| Application schema and RLS             | 3     |
| Auth and profile                       | 4     |
| AI providers                           | 5     |

## Failure modes Phase 0 must surface

- Missing environment values (fail-closed Zod parse)
- Cross-layer imports (ESLint `no-restricted-imports`)
- Database unavailability when tests are intentionally run (CI)
- Incompatible Worker dependencies (OpenNext build)
- Preview startup failure (HTTP smoke assertion)
