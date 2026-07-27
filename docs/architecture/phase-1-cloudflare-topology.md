# Phase 1 — Cloudflare runtime and environment topology

## Goal

Run UnseenPrompt reproducibly on Cloudflare Workers in isolated local, preview, staging, and production environments, with safe deployment controls, non-sensitive readiness checks, and a verified Cloudflare Workflows binding.

## Four-environment topology

| Logical environment | Cloudflare target         | Trigger                                                       | Public URL behavior                               |
| ------------------- | ------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| Local               | Wrangler local simulator  | Developer command                                             | `http://127.0.0.1:8787`                           |
| Preview             | `unseenprompt-preview`    | PR build artifact + trusted `workflow_run` deployer           | Versioned URL plus alias `pr-<number>`            |
| Staging             | `unseenprompt-staging`    | Push to `main`                                                | Workers.dev URL; later `staging.unseenprompt.com` |
| Production          | `unseenprompt-production` | Manual dispatch from `main` after GitHub Environment approval | `unseenprompt.com` and `www.unseenprompt.com`     |

Wrangler named environments create separate Workers. Preview is hosted in a preview-only Cloudflare
account because Workers Scripts permissions are account-scoped. Local, staging, and production have
distinct Workflow names bound as `RUNTIME_HEALTH_WORKFLOW`; preview intentionally has no Workflow or
secret bindings.

The trusted preview preflight compares the preview account against repository variables for staging and
production and rejects any preview account containing the protected Worker names.

## Preview code isolation

Pull-request previews upload Worker **versions** with alias `pr-<number>`. Because every PR version can
read its Worker's bindings, `unseenprompt-preview` has no secrets, Workflow capability, database,
authentication, uploads, or user-controlled state. The trusted deployer fails before upload if
Cloudflare reports any preview secret binding.

**Phase 3 requirement:** introduce per-PR data isolation when Supabase resources appear.

## Trusted-main preview boundary

Automatic same-repository PR previews use a two-workflow design:

```text
PR head -> credential-free OpenNext build -> untrusted artifact
        -> trusted main workflow_run deployer -> preview version -> release-identity smoke
```

- **`Build Preview Artifact`** runs on `pull_request` with no repository secrets. It dereferences links and produces a tarred `.open-next` artifact only.
- **`Deploy Preview`** is a `workflow_run` definition loaded from `main`. It checks out exactly `main`, installs trusted tooling, rejects archive members outside `.open-next` and all non-regular entries, applies Python `tarfile` `filter="data"`, and never executes files from the artifact.
- PR head SHA is used only as data (`RELEASE_SHA`, tags, smoke expectation), never as the checkout or script source for secret-bearing steps.
- Preview smoke is public and requires `GITHUB_SHA` to match `/api/health` `release`; authenticated
  Workflow smoke remains limited to staging and production.

Policy gate: `pnpm check:preview-workflow-trust`.

## Trust boundaries

| Surface                                | Trust                               | Notes                                                         |
| -------------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `GET /api/health`                      | Public                              | Non-sensitive readiness only                                  |
| `POST /api/internal/health/workflow`   | Bearer token (non-preview only)     | Timing-safe compare; no token in payload or logs              |
| OpenNext HTTP entry                    | Public origin for that environment  | Application routes remain unauthenticated until later phases  |
| Workflow class `RuntimeHealthWorkflow` | Worker-internal                     | No-op health step; product Workflows arrive later             |
| Preview deployment credentials         | GitHub repository secrets           | Preview-only Cloudflare account; no zone or route authority   |
| Release deployment credentials         | `staging`/`production` Environments | Separate from preview credentials                             |
| PR preview build                       | Credential-free                     | No secrets; artifact is untrusted data                        |
| PR preview deploy                      | Trusted main only                   | Cloudflare deploy credential stays on runner; Worker has none |

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

1. **PR** → credential-free build artifact → trusted-main preview version upload + release-identity smoke
2. **Merge to main** → staging deploy + release-identity smoke
3. **Manual production** → domain verification gate + dry-run + version upload + 100% promote + smoke

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
