# Phase 1 — Cloudflare runtime and environment topology

## Goal

Run UnseenPrompt reproducibly on Cloudflare Workers in isolated local, preview, staging, and production environments, with safe deployment controls, non-sensitive readiness checks, and a verified Cloudflare Workflows binding.

## Four-environment topology

| Logical environment | Cloudflare target         | Trigger                                         | Public URL behavior                               |
| ------------------- | ------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Local               | Wrangler local simulator  | Developer command                               | `http://127.0.0.1:8787`                           |
| Preview validation  | Local Wrangler simulator  | Pull-request CI                                 | No remote deployment                              |
| Staging             | `unseenprompt-staging`    | Push to `main`                                  | Workers.dev URL; later `staging.unseenprompt.com` |
| Production          | `unseenprompt-production` | After staging succeeds for the same `main` push | `unseenprompt.com` and `www.unseenprompt.com`     |

Pull requests run the OpenNext build and local Wrangler preview smoke without deployment credentials.
Only pushes to `main` enter the staging-to-production release workflow.

## Trust boundaries

| Surface                                | Trust                               | Notes                                                        |
| -------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `GET /api/health`                      | Public                              | Non-sensitive readiness only                                 |
| `POST /api/internal/health/workflow`   | Bearer token (non-preview only)     | Timing-safe compare; no token in payload or logs             |
| OpenNext HTTP entry                    | Public origin for that environment  | Application routes remain unauthenticated until later phases |
| Workflow class `RuntimeHealthWorkflow` | Worker-internal                     | No-op health step; product Workflows arrive later            |
| Release deployment credentials         | `staging`/`production` Environments | Separate from preview credentials                            |
| PR Worker validation                   | Credential-free                     | Local build and smoke only; no remote deployment             |

## Custom Worker entry point

`custom-worker.ts` is the Cloudflare `main` module. It:

1. Delegates `fetch` to OpenNext-generated `.open-next/worker.js`
2. Exports `RuntimeHealthWorkflow` for the Workflows binding

Without a custom entry point, Workflow classes cannot be exported alongside the OpenNext Worker.

`src/lib/cloudflare/context.ts` is the **only** application adapter that reads Cloudflare bindings (`CF_VERSION_METADATA`, `RUNTIME_HEALTH_WORKFLOW`).

## Health surfaces

### Public runtime health

Response fields only:

- `service`, `environment`, `release`, `version`, `status`, `checks`

Never returns secrets, account IDs, or tokens. Preview reports `workflowBinding: not_configured`;
environments that require the binding return `503` when it is missing.

### Authenticated Workflow probe

- Validates bearer token before create/get
- Optional `Idempotency-Key` (`^[A-Za-z0-9._-]{8,80}$`)
- Instance IDs prefixed with `health-` and under 100 characters
- Uses `createBatch` for idempotent creation; falls back to `get` when skipped
- Status mapping: `complete` → 200, `errored` → 503, otherwise 202

## Release flow and rollback limits

1. **PR** → credential-free Worker build and local preview smoke
2. **Merge or push to main** → staging deploy + smoke
3. **Successful staging** → production dry-run + version upload + 100% promote + smoke for the same SHA

Rollback restores a previous Worker version only. It does not roll back external state (databases, storage, third-party systems).

## Observability sampling

- Non-production: `head_sampling_rate` `1`
- Production: `head_sampling_rate` `0.1`

## Failure modes

| Mode                   | Symptom / gate                                             |
| ---------------------- | ---------------------------------------------------------- |
| Preview secret present | Trusted deployer fails before uploading PR code            |
| Missing secret         | Non-preview Workflow probe `401`; deploy secret steps fail |
| Invalid binding        | Health `status: degraded`, HTTP `503`                      |
| Failed upload          | Preview/release job fails before smoke                     |
| Failed Workflow        | Probe returns `503` / non-complete after retries           |
| DNS failure            | Production smoke fails; `PRODUCTION_DOMAIN_VERIFIED` gate  |
| Stale version          | Wrong `RELEASE_SHA` in health payload                      |
| Rollback external skew | Worker rolled back but data layers remain advanced         |

## Deferred reviews

- **Phase 3:** per-PR database isolation
- **Phase 16:** rate limits, Cloudflare Access for previews, log retention, alerting

## Compatibility policy

See [workers-dependencies.md](../development/workers-dependencies.md). Runtime deps must pass unit tests, Next build, OpenNext build, and local Worker preview. Phase 1 adds no new runtime packages.
