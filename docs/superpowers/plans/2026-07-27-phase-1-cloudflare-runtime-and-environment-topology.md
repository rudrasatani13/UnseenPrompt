# Phase 1 — Cloudflare Runtime and Environment Topology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Security amendment:** Preview deployment steps in this original plan are superseded by
> `2026-07-27-phase-1-deployment-review-fixes.md`. Do not provision a preview health token or Workflow
> binding, and do not execute PR-controlled code or artifacts with deployment credentials.

**Goal:** Run UnseenPrompt reproducibly on Cloudflare Workers in isolated local, preview, staging, and production environments, with safe deployment controls, non-sensitive readiness checks, and a verified Cloudflare Workflows binding.

**Architecture:** Keep the existing single Next.js/OpenNext Worker. Use Wrangler named environments to create separate preview, staging, and production Workers; use version preview aliases for pull requests, deploy staging automatically from `main`, and promote production only through a protected manual GitHub Actions job. Add a small custom Worker entry point that delegates HTTP traffic to OpenNext and exports one no-op health Workflow, while Next.js route handlers expose public runtime readiness and a token-protected workflow probe.

**Tech Stack:** Node.js 24 LTS, pnpm 11.17.0, Next.js 16 App Router, strict TypeScript, OpenNext Cloudflare 1.20.2, Wrangler 4.114.0, Cloudflare Workers, Cloudflare Workflows, Vitest, GitHub Actions.

## Global Constraints

- The MVP supports websites and web applications only.
- The MVP supports personal accounts only.
- The application UI is English.
- User input may be multilingual.
- Coding-agent prompts are technical English.
- The interface presents one question or one active prompt at a time.
- Models propose state changes; deterministic code validates them; users confirm them.
- Claude Code, Codex, and Cursor share one canonical project state.
- Files are private, bounded, and treated as untrusted.
- No direct repository, IDE, or local-machine access exists in the MVP.
- No lifecycle mode is publicly enabled before its release gates pass.
- All state-changing operations are owner-scoped and idempotent.
- Cloudflare runtime compatibility is verified before production deployment.
- Keep the direct dependency versions already pinned in `package.json`; Phase 1 adds no runtime package.
- Keep GitHub Actions permissions at `contents: read`; Phase 1 does not post pull-request comments or request repository write access.
- Never commit Cloudflare account IDs, API tokens, health tokens, `.dev.vars`, credentials, or generated `.open-next` output.
- The Worker uses the Next.js Node.js runtime through OpenNext; do not add `export const runtime = "edge"`.
- `unseenprompt.com` and `www.unseenprompt.com` remain production deployment gates until Cloudflare zone ownership and DNS verification are complete.

---

## Execution Contract

### Preconditions

- Run from `/Users/rudrasatani/Desktop/UnseenPrompt`.
- Read:
  - `docs/UnseenPrompt – Stateful Project Copilot.md`
  - `docs/UnseenPrompt – DEVELOPMENT_PLAN.md`
  - `docs/architecture/phase-0-foundations.md`
  - `docs/development/environment-contract.md`
  - `CONTRIBUTING.md`
- Use an isolated `codex/phase-1-cloudflare-runtime` branch or worktree. Do not implement on `main`.
- Require Node.js 24.x and pnpm 11.17.0. The current host reported Node 22.23.1 during planning, so the executor must switch to Node 24 before running package or build gates.
- Preserve unrelated changes. Stop if a dirty worktree overlaps a planned file.
- A Cloudflare account is required only for Tasks 7–9. Tasks 1–6 and all local verification remain executable without remote credentials.
- Before Task 7, a maintainer must provide:
  - a least-privilege `CLOUDFLARE_API_TOKEN`;
  - `CLOUDFLARE_ACCOUNT_ID`;
  - the account's non-sensitive Workers subdomain;
  - permission to create the `unseenprompt-preview`, `unseenprompt-staging`, and `unseenprompt-production` Worker environments and their health Workflows.
- Before the first remote deployment, a maintainer must generate separate random `HEALTHCHECK_TOKEN` values for preview, staging, and production. A token must contain at least 32 random bytes and must not be reused across environments.
- Before Task 9 can deploy production, Cloudflare must verify the `unseenprompt.com` zone and the repository variable `PRODUCTION_DOMAIN_VERIFIED` must be exactly `true`.

### Locked Topology

| Logical environment | Cloudflare target         | Trigger                                                       | Public URL behavior                               | Data/resource policy                                 |
| ------------------- | ------------------------- | ------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Local               | Wrangler local simulator  | Developer command                                             | `http://127.0.0.1:8787`                           | Local bindings only                                  |
| Preview             | `unseenprompt-preview`    | Pull request open/update                                      | Versioned URL plus alias `pr-<number>`            | Shared non-production Phase 1 bindings; no user data |
| Staging             | `unseenprompt-staging`    | Push to `main`                                                | Workers.dev URL; later `staging.unseenprompt.com` | Staging-only bindings and secret                     |
| Production          | `unseenprompt-production` | Manual dispatch from `main` after GitHub Environment approval | `unseenprompt.com` and `www.unseenprompt.com`     | Production-only bindings and secret                  |

Wrangler named environments create separate Workers. Preview aliases isolate code versions and URLs, but they share the preview Worker's bindings. This is acceptable in Phase 1 because no database, authentication, uploads, or user-controlled state exists yet. Phase 3 must revisit preview data isolation when Supabase resources are introduced.

### Deployment Decisions Considered

1. **Selected — Wrangler environments plus GitHub Actions.** It preserves repository-controlled configuration, supports per-PR Worker version URLs, and permits an explicit production approval gate with minimal new machinery.
2. **Rejected for Phase 1 — Cloudflare native Git integration.** It simplifies preview comments, but moves build and release policy partly outside the repository and makes the staging/production promotion contract less explicit.
3. **Rejected for Phase 1 — Infrastructure as code.** Terraform or Pulumi would improve account-level reproducibility, but adding state storage and provider credentials before the application has durable resources is unnecessary scope.

### Definition of Done

All local commands must exit with status `0` on Node 24:

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

Remote gates:

- A pull request uploads a version to `unseenprompt-preview`, produces a versioned preview URL and `pr-<number>` alias, and passes the remote smoke script.
- A merge to `main` deploys `unseenprompt-staging` and passes runtime and Workflow probes.
- The preview, staging, and production Worker configurations use distinct names, variables, Workflow names, and secrets.
- The public health response contains only service, environment, release, version, and readiness fields.
- An invalid or absent Workflow health token receives HTTP `401`; a valid token starts or reuses one bounded Workflow probe and reaches `complete`.
- Production deployment cannot run from a non-`main` commit, without GitHub Environment approval, or while `PRODUCTION_DOMAIN_VERIFIED != true`.
- `pnpm exec wrangler deploy --env production --dry-run` succeeds before a production promotion.
- Production deployment itself is not required for Phase 1 exit while DNS/zone verification remains incomplete; the controlled workflow and dry-run gate are required.

### Scope Boundary

| Included                                                 | Deferred                                           |
| -------------------------------------------------------- | -------------------------------------------------- |
| OpenNext Worker configuration and compatibility settings | Application features and UI design system          |
| Local/preview/staging/production Worker topology         | Supabase resources and per-PR data branches        |
| Public runtime health                                    | Sentry, PostHog, alert routing, and SLO dashboards |
| Minimal Workflows export, binding, and probe             | Product generation/upload/lifecycle Workflows      |
| Least-privilege deployment secrets and release gates     | Authentication and user authorization              |
| Per-PR preview versions                                  | Cloudflare Access for preview URLs                 |
| Custom-domain configuration and verification gate        | DNS changes before ownership approval              |
| Dependency compatibility policy                          | Dependency upgrades or framework migrations        |

---

## Planned File Map

```text
.
├── .dev.vars.example
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-preview.yml
│       └── deploy-release.yml
├── CONTRIBUTING.md
├── README.md
├── custom-worker.ts
├── docs/
│   ├── architecture/phase-1-cloudflare-topology.md
│   ├── deployment/cloudflare-runbook.md
│   ├── development/environment-contract.md
│   ├── development/workers-dependencies.md
│   └── superpowers/plans/2026-07-27-phase-1-cloudflare-runtime-and-environment-topology.md
├── package.json
├── scripts/
│   ├── assert-cloudflare-deployment.mjs
│   ├── assert-cloudflare-preview.mjs
│   └── assert-workers-dependencies.mjs
├── src/
│   ├── app/api/health/route.test.ts
│   ├── app/api/health/route.ts
│   ├── app/api/internal/health/workflow/route.test.ts
│   ├── app/api/internal/health/workflow/route.ts
│   ├── config/env/schema.test.ts
│   ├── config/env/schema.ts
│   ├── config/env/server.ts
│   ├── lib/cloudflare/context.ts
│   └── lib/security/health-token.ts
├── tsconfig.json
├── worker-configuration.d.ts
└── wrangler.jsonc
```

Responsibility boundaries:

- `custom-worker.ts` is the Cloudflare entry point. It delegates fetches to generated OpenNext output and exports Workflow classes.
- `src/lib/cloudflare/context.ts` is the only application adapter that reads Cloudflare bindings.
- `src/app/api/health/route.ts` is public, read-only, and non-sensitive.
- `src/app/api/internal/health/workflow/route.ts` is an operational endpoint protected by an environment-specific bearer token.
- `scripts/assert-cloudflare-preview.mjs` validates the local Worker simulator.
- `scripts/assert-cloudflare-deployment.mjs` validates a deployed URL and optionally executes the Workflow probe.
- `worker-configuration.d.ts` is generated from `wrangler.jsonc`; never hand-edit it.

---

### Task 1: Lock the Cloudflare Environment and Type Contract

**Files:**

- Modify: `wrangler.jsonc`
- Create: `custom-worker.ts`
- Create: `worker-configuration.d.ts` by generation
- Modify: `tsconfig.json`
- Modify: `package.json`

**Interfaces:**

- Consumes: existing `.open-next/worker.js`, OpenNext 1.20.2, Wrangler 4.114.0.
- Produces: global `CloudflareEnv`, `RUNTIME_HEALTH_WORKFLOW`, `CF_VERSION_METADATA`, environment-specific Worker/Workflow names, and canonical Cloudflare scripts.

- [ ] **Step 1: Verify branch, runtime, and package versions**

Run:

```bash
git status --short --branch
git branch --show-current
node --version
pnpm --version
pnpm exec wrangler --version
pnpm exec opennextjs-cloudflare --version
```

Expected: isolated Phase 1 branch, no overlapping edits, Node `v24.x`, pnpm `11.17.0`, Wrangler `4.114.0`, and OpenNext `1.20.2`.

- [ ] **Step 2: Replace the single-environment Wrangler configuration**

Implement `wrangler.jsonc` with these effective values:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "unseenprompt-local",
  "main": "custom-worker.ts",
  "compatibility_date": "2026-07-27",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "workers_dev": true,
  "preview_urls": false,
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS",
  },
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1,
  },
  "version_metadata": {
    "binding": "CF_VERSION_METADATA",
  },
  "secrets": {
    "required": ["HEALTHCHECK_TOKEN"],
  },
  "vars": {
    "APP_ENV": "local",
    "NEXT_PUBLIC_APP_URL": "http://127.0.0.1:8787",
    "RELEASE_SHA": "local",
  },
  "workflows": [
    {
      "name": "unseenprompt-health-local",
      "binding": "RUNTIME_HEALTH_WORKFLOW",
      "class_name": "RuntimeHealthWorkflow",
    },
  ],
  "env": {
    "preview": {
      "name": "unseenprompt-preview",
      "workers_dev": true,
      "preview_urls": true,
      "observability": {
        "enabled": true,
        "head_sampling_rate": 1,
      },
      "version_metadata": {
        "binding": "CF_VERSION_METADATA",
      },
      "secrets": {
        "required": ["HEALTHCHECK_TOKEN"],
      },
      "vars": {
        "APP_ENV": "preview",
        "NEXT_PUBLIC_APP_URL": "https://preview.unseenprompt.com",
        "RELEASE_SHA": "preview",
      },
      "workflows": [
        {
          "name": "unseenprompt-health-preview",
          "binding": "RUNTIME_HEALTH_WORKFLOW",
          "class_name": "RuntimeHealthWorkflow",
        },
      ],
    },
    "staging": {
      "name": "unseenprompt-staging",
      "workers_dev": true,
      "preview_urls": false,
      "observability": {
        "enabled": true,
        "head_sampling_rate": 1,
      },
      "version_metadata": {
        "binding": "CF_VERSION_METADATA",
      },
      "secrets": {
        "required": ["HEALTHCHECK_TOKEN"],
      },
      "vars": {
        "APP_ENV": "staging",
        "NEXT_PUBLIC_APP_URL": "https://staging.unseenprompt.com",
        "RELEASE_SHA": "staging",
      },
      "workflows": [
        {
          "name": "unseenprompt-health-staging",
          "binding": "RUNTIME_HEALTH_WORKFLOW",
          "class_name": "RuntimeHealthWorkflow",
        },
      ],
    },
    "production": {
      "name": "unseenprompt-production",
      "workers_dev": false,
      "preview_urls": false,
      "routes": [
        {
          "pattern": "unseenprompt.com/*",
          "zone_name": "unseenprompt.com",
        },
        {
          "pattern": "www.unseenprompt.com/*",
          "zone_name": "unseenprompt.com",
        },
      ],
      "observability": {
        "enabled": true,
        "head_sampling_rate": 0.1,
      },
      "version_metadata": {
        "binding": "CF_VERSION_METADATA",
      },
      "secrets": {
        "required": ["HEALTHCHECK_TOKEN"],
      },
      "vars": {
        "APP_ENV": "production",
        "NEXT_PUBLIC_APP_URL": "https://unseenprompt.com",
        "RELEASE_SHA": "production",
      },
      "workflows": [
        {
          "name": "unseenprompt-health-production",
          "binding": "RUNTIME_HEALTH_WORKFLOW",
          "class_name": "RuntimeHealthWorkflow",
        },
      ],
    },
  },
}
```

Do not add `HEALTHCHECK_TOKEN` to `vars`; it is a Wrangler secret.

- [ ] **Step 3: Add the custom Worker and health Workflow**

Create `custom-worker.ts`:

```ts
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

// @ts-expect-error Generated by `pnpm cf:build`; absent before the first build.
import openNextWorker from "./.open-next/worker.js";

export interface RuntimeHealthParams {
  requestId: string;
}

export interface RuntimeHealthResult {
  appEnv: CloudflareEnv["APP_ENV"];
  ok: true;
  requestId: string;
}

export class RuntimeHealthWorkflow extends WorkflowEntrypoint<CloudflareEnv, RuntimeHealthParams> {
  override async run(
    event: WorkflowEvent<RuntimeHealthParams>,
    step: WorkflowStep,
  ): Promise<RuntimeHealthResult> {
    return step.do("confirm-runtime", async () => ({
      appEnv: this.env.APP_ENV,
      ok: true as const,
      requestId: event.payload.requestId,
    }));
  }
}

export default {
  fetch: openNextWorker.fetch,
} satisfies ExportedHandler<CloudflareEnv>;
```

- [ ] **Step 4: Generate and include binding types**

Run:

```bash
pnpm exec wrangler types worker-configuration.d.ts --env-interface CloudflareEnv
```

Add `worker-configuration.d.ts` to `tsconfig.json`'s `include` array. Do not edit generated declarations.

- [ ] **Step 5: Add canonical scripts**

Add these `package.json` scripts:

```json
{
  "scripts": {
    "cf:types": "wrangler types worker-configuration.d.ts --env-interface CloudflareEnv",
    "cf:types:check": "wrangler types worker-configuration.d.ts --env-interface CloudflareEnv --check",
    "check:workers-deps": "node scripts/assert-workers-dependencies.mjs",
    "cf:dry-run:preview": "opennextjs-cloudflare build --env preview && wrangler deploy --env preview --dry-run",
    "cf:dry-run:staging": "opennextjs-cloudflare build --env staging && wrangler deploy --env staging --dry-run",
    "cf:dry-run:production": "opennextjs-cloudflare build --env production && wrangler deploy --env production --dry-run"
  }
}
```

Retain all Phase 0 scripts.

- [ ] **Step 6: Verify configuration and types**

Run:

```bash
pnpm cf:types:check
pnpm typecheck
pnpm exec wrangler deploy --env preview --dry-run
pnpm exec wrangler deploy --env staging --dry-run
pnpm exec wrangler deploy --env production --dry-run
```

Expected: all commands exit `0`; no remote upload occurs.

- [ ] **Step 7: Commit**

```bash
git add wrangler.jsonc custom-worker.ts worker-configuration.d.ts tsconfig.json package.json
git commit -m "feat: define Cloudflare environment topology"
```

---

### Task 2: Extend the Validated Runtime Environment

**Files:**

- Modify: `.env.example`
- Create: `.dev.vars.example`
- Modify: `src/config/env/schema.ts`
- Modify: `src/config/env/schema.test.ts`
- Modify: `src/config/env/server.ts`
- Modify: `docs/development/environment-contract.md`

**Interfaces:**

- Consumes: `APP_ENV`, `NEXT_PUBLIC_APP_URL`, and `RELEASE_SHA`.
- Produces: `AppEnvironment` with a non-empty release identifier and documented `HEALTHCHECK_TOKEN` secret ownership.

- [ ] **Step 1: Write failing schema tests**

Add tests that:

```ts
it("accepts a deployed release identifier", () => {
  expect(
    parseEnvironment({
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_URL: "https://staging.unseenprompt.com",
      RELEASE_SHA: "3546ac4f0c7c",
    }),
  ).toMatchObject({ APP_ENV: "staging", RELEASE_SHA: "3546ac4f0c7c" });
});

it("rejects an absent or malformed release identifier", () => {
  expect(() =>
    parseEnvironment({
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_URL: "https://staging.unseenprompt.com",
      RELEASE_SHA: undefined,
    }),
  ).toThrow(/RELEASE_SHA/);

  expect(() =>
    parseEnvironment({
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_URL: "https://staging.unseenprompt.com",
      RELEASE_SHA: "contains spaces",
    }),
  ).toThrow(/RELEASE_SHA/);
});
```

Update every existing test input to pass `RELEASE_SHA: "local"` so each test continues to isolate the field it intends to validate.

- [ ] **Step 2: Confirm failure**

Run:

```bash
pnpm test:unit -- src/config/env/schema.test.ts
```

Expected: FAIL because `RELEASE_SHA` is not parsed.

- [ ] **Step 3: Implement the schema**

Add this field to the Zod object in `src/config/env/schema.ts`:

```ts
RELEASE_SHA: z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, "RELEASE_SHA contains unsupported characters"),
```

Pass `process.env.RELEASE_SHA` from `getServerEnvironment()` in `src/config/env/server.ts`.

- [ ] **Step 4: Update safe templates**

Append to `.env.example`:

```dotenv
RELEASE_SHA=local
```

Create `.dev.vars.example`:

```dotenv
# Safe local examples only. Copy to `.dev.vars` and replace the token.
HEALTHCHECK_TOKEN=replace-with-at-least-32-random-bytes
```

The literal example must never be accepted by staging or production setup.

- [ ] **Step 5: Update the environment matrix**

In `docs/development/environment-contract.md`, document:

| Variable            | Visibility | Local       | Preview           | Staging           | Production        | Owner               |
| ------------------- | ---------- | ----------- | ----------------- | ----------------- | ----------------- | ------------------- |
| `RELEASE_SHA`       | Server     | `local`     | Git commit SHA    | Git commit SHA    | Git commit SHA    | Deployment pipeline |
| `HEALTHCHECK_TOKEN` | Secret     | `.dev.vars` | Cloudflare secret | Cloudflare secret | Cloudflare secret | Platform            |

State that `NEXT_PUBLIC_APP_URL` is the canonical environment URL, not a per-version preview URL. Authentication callback URLs are deferred to Phase 4.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm test:unit -- src/config/env/schema.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .env.example .dev.vars.example src/config/env docs/development/environment-contract.md
git commit -m "feat: validate Cloudflare release environment"
```

---

### Task 3: Add a Non-Sensitive Runtime Health Surface

**Files:**

- Create: `src/lib/cloudflare/context.ts`
- Create: `src/app/api/health/route.ts`
- Create: `src/app/api/health/route.test.ts`

**Interfaces:**

- Produces: `GET /api/health`.
- Response:

```ts
interface RuntimeHealthResponse {
  checks: { runtime: "ok"; workflowBinding: "missing" | "ok" };
  environment: AppEnvironment["APP_ENV"];
  release: string;
  service: "unseenprompt";
  status: "degraded" | "ok";
  version: string;
}
```

- [ ] **Step 1: Write failing route tests**

Mock the Cloudflare adapter and assert:

```ts
expect(response.status).toBe(200);
expect(response.headers.get("cache-control")).toBe("no-store");
expect(await response.json()).toEqual({
  checks: { runtime: "ok", workflowBinding: "ok" },
  environment: "test",
  release: "test-release",
  service: "unseenprompt",
  status: "ok",
  version: "local",
});
```

Also serialize the response and assert it contains none of:

```ts
["HEALTHCHECK_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
```

- [ ] **Step 2: Confirm failure**

Run:

```bash
pnpm test:unit -- src/app/api/health/route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Add the Cloudflare context adapter**

Create `src/lib/cloudflare/context.ts`:

```ts
import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface RuntimeBindings {
  version: string;
  workflow: Workflow;
}

export function getRuntimeBindings(): RuntimeBindings {
  const { env } = getCloudflareContext();

  return {
    version: env.CF_VERSION_METADATA?.id ?? "local",
    workflow: env.RUNTIME_HEALTH_WORKFLOW,
  };
}
```

- [ ] **Step 4: Implement the route**

Create `src/app/api/health/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getServerEnvironment } from "@/config/env/server";
import { getRuntimeBindings } from "@/lib/cloudflare/context";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const environment = getServerEnvironment();
  const runtime = getRuntimeBindings();

  return NextResponse.json(
    {
      checks: {
        runtime: "ok",
        workflowBinding: runtime.workflow ? "ok" : "missing",
      },
      environment: environment.APP_ENV,
      release: environment.RELEASE_SHA,
      service: "unseenprompt",
      status: runtime.workflow ? "ok" : "degraded",
      version: runtime.version,
    },
    {
      status: runtime.workflow ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
```

- [ ] **Step 5: Verify**

Run:

```bash
pnpm test:unit -- src/app/api/health/route.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cloudflare/context.ts src/app/api/health
git commit -m "feat: add Cloudflare runtime health endpoint"
```

---

### Task 4: Add the Authenticated Workflow Probe

**Files:**

- Create: `src/lib/security/health-token.ts`
- Create: `src/app/api/internal/health/workflow/route.ts`
- Create: `src/app/api/internal/health/workflow/route.test.ts`

**Interfaces:**

- Consumes: `Authorization: Bearer <HEALTHCHECK_TOKEN>` and optional `Idempotency-Key`.
- Produces: `POST /api/internal/health/workflow`.
- Returns HTTP `401` for bad credentials, `202` for queued/running probes, `200` for completed probes, and `503` for errored probes.

- [ ] **Step 1: Write failing authorization and idempotency tests**

Cover:

1. Missing authorization returns `401`.
2. Wrong scheme returns `401`.
3. Wrong token returns `401`.
4. Valid token calls `createBatch()` with one deterministic ID and `{ requestId }`.
5. Repeating the same `Idempotency-Key` calls `get()` when `createBatch()` skips the existing ID.
6. The response never contains the token.

Use `Idempotency-Key: test-probe-0001`; reject keys outside `^[A-Za-z0-9._-]{8,80}$`.

- [ ] **Step 2: Confirm failure**

Run:

```bash
pnpm test:unit -- src/app/api/internal/health/workflow/route.test.ts
```

Expected: FAIL because the route and token verifier do not exist.

- [ ] **Step 3: Implement timing-safe token verification**

Create `src/lib/security/health-token.ts`:

```ts
import "server-only";

import { timingSafeEqual } from "node:crypto";

function asBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

export function hasValidHealthToken(
  authorization: string | null,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || expectedToken.length < 32 || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = asBuffer(authorization.slice("Bearer ".length));
  const expected = asBuffer(expectedToken);

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
```

- [ ] **Step 4: Implement the Workflow route**

The route must:

1. Validate the bearer token before reading or creating a Workflow instance.
2. Read the expected value from `process.env.HEALTHCHECK_TOKEN`; never pass the token into the Workflow payload.
3. Validate `Idempotency-Key`; generate `crypto.randomUUID()` only when absent.
4. Prefix the instance ID with `health-` and keep the full ID below 100 characters.
5. Call `createBatch([{ id, params: { requestId: id } }])` so retries are idempotent.
6. If `createBatch()` returns an empty array, call `get(id)`.
7. Call `status()` once and return only `{ id, status, output }`.
8. Return `Cache-Control: no-store`.
9. Log only the instance ID and terminal status; never log headers or tokens.

Use this status mapping:

```ts
const responseStatus =
  details.status === "complete" ? 200 : details.status === "errored" ? 503 : 202;
```

- [ ] **Step 5: Verify**

Run:

```bash
pnpm test:unit -- src/app/api/internal/health/workflow/route.test.ts
pnpm lint
pnpm typecheck
```

Expected: PASS with no secret printed by tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security/health-token.ts src/app/api/internal/health/workflow
git commit -m "feat: add authenticated Workflow health probe"
```

---

### Task 5: Enforce the Workers Dependency Policy

**Files:**

- Create: `scripts/assert-workers-dependencies.mjs`
- Create: `docs/development/workers-dependencies.md`
- Modify: `CONTRIBUTING.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces: `pnpm check:workers-deps` and a mandatory OpenNext dry-build gate.

- [ ] **Step 1: Create the deterministic direct-dependency check**

Create `scripts/assert-workers-dependencies.mjs`:

```js
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const runtimeDependencies = Object.keys(manifest.dependencies ?? {});
const forbidden = new Set(["better-sqlite3", "canvas", "electron", "fs-ext", "node-gyp"]);
const violations = runtimeDependencies.filter((name) => forbidden.has(name));

if (violations.length > 0) {
  throw new Error(`Workers-incompatible direct dependencies: ${violations.sort().join(", ")}`);
}
```

This denylist is an early failure, not proof of compatibility. `cf:build` and Worker preview remain authoritative.

- [ ] **Step 2: Document the dependency admission policy**

Create `docs/development/workers-dependencies.md` with these mandatory checks for any new runtime dependency:

1. Confirm ESM or compatible bundling.
2. Confirm no required native `.node` addon or child process.
3. Confirm filesystem use is not required at runtime.
4. Check for a `workerd` export condition.
5. Add `serverExternalPackages` only when the package publishes a verified `workerd` entry.
6. Run unit, Next build, OpenNext build, and local Worker preview.
7. Record any compatibility flag or externalization rationale in the pull request.

- [ ] **Step 3: Add CI gates**

In `.github/workflows/ci.yml`, run:

```yaml
- name: Check generated Cloudflare types
  run: pnpm cf:types:check
- name: Check Workers dependency policy
  run: pnpm check:workers-deps
```

Place both before the OpenNext build. Retain `permissions: contents: read`.

- [ ] **Step 4: Update contribution requirements**

Link the new policy from `CONTRIBUTING.md` and add `pnpm cf:types:check` plus `pnpm check:workers-deps` to Cloudflare-touching changes.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm check:workers-deps
pnpm cf:types:check
pnpm cf:build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/assert-workers-dependencies.mjs docs/development/workers-dependencies.md CONTRIBUTING.md .github/workflows/ci.yml
git commit -m "ci: enforce Workers dependency compatibility"
```

---

### Task 6: Strengthen Local and Remote Deployment Smoke Tests

**Files:**

- Modify: `scripts/assert-cloudflare-preview.mjs`
- Create: `scripts/assert-cloudflare-deployment.mjs`
- Modify: `package.json`

**Interfaces:**

- Local script consumes no arguments and checks `http://127.0.0.1:8787`.
- Remote script consumes `DEPLOYMENT_URL` and optional `HEALTHCHECK_TOKEN`.

- [ ] **Step 1: Extend local preview assertions**

Update `scripts/assert-cloudflare-preview.mjs` to:

1. Retain the home-page identity check.
2. Fetch `/api/health`.
3. Require HTTP `200`.
4. Require `cache-control` to contain `no-store`.
5. Require `{ service: "unseenprompt", status: "ok", environment: "local" }`.
6. Assert the serialized response does not contain `token`, `secret`, or `account`.

- [ ] **Step 2: Add a remote smoke script**

Create `scripts/assert-cloudflare-deployment.mjs` with:

```js
const deploymentUrl = process.env.DEPLOYMENT_URL;

if (!deploymentUrl) {
  throw new Error("DEPLOYMENT_URL is required");
}

const baseUrl = new URL(deploymentUrl);
const healthResponse = await fetch(new URL("/api/health", baseUrl), {
  headers: { Accept: "application/json" },
});
const health = await healthResponse.json();

if (!healthResponse.ok || health.service !== "unseenprompt" || health.status !== "ok") {
  throw new Error(`Runtime health failed with HTTP ${healthResponse.status}`);
}

const token = process.env.HEALTHCHECK_TOKEN;

if (token) {
  const idempotencyKey = `deploy-${process.env.GITHUB_SHA ?? "manual"}`.slice(0, 80);
  let workflow;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(new URL("/api/internal/health/workflow", baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": idempotencyKey,
      },
    });

    workflow = await response.json();

    if (response.status === 200 && workflow.status === "complete") {
      break;
    }

    if (response.status >= 400 && response.status !== 503) {
      throw new Error(`Workflow probe failed with HTTP ${response.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  if (workflow?.status !== "complete" || workflow.output?.ok !== true) {
    throw new Error(`Workflow did not complete: ${workflow?.status ?? "unknown"}`);
  }
}
```

The script must never print response bodies because they may contain operational metadata.

- [ ] **Step 3: Add the script command**

Add:

```json
{
  "scripts": {
    "test:cf-deployment": "node scripts/assert-cloudflare-deployment.mjs"
  }
}
```

- [ ] **Step 4: Verify locally**

Copy `.dev.vars.example` to the ignored `.dev.vars`, replace its token with a 32+ character local value, then run:

```bash
pnpm cf:build
pnpm test:cf-preview
```

Expected: home, runtime health, and local Workflow binding checks pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/assert-cloudflare-preview.mjs scripts/assert-cloudflare-deployment.mjs package.json
git commit -m "test: verify Cloudflare runtime readiness"
```

---

### Task 7: Provision Remote Boundaries and Secrets

**Files:**

- Create: `docs/deployment/cloudflare-runbook.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: Cloudflare account access and maintainer-generated secrets.
- Produces: three isolated remote Worker/Workflow targets and GitHub secret/environment configuration.

- [ ] **Step 1: Authenticate without persisting credentials**

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the executor's secret environment, then run:

```bash
pnpm exec wrangler whoami
```

Expected: the intended account is shown. Do not print token values or write them to `.env`.

- [ ] **Step 2: Bootstrap environment secrets, preview, and staging**

Set different secrets interactively before the first deployment. If Wrangler asks to create the target Worker while storing its first secret, confirm only the exact Worker named by the selected environment:

```bash
pnpm exec wrangler secret put HEALTHCHECK_TOKEN --env preview
pnpm exec wrangler secret put HEALTHCHECK_TOKEN --env staging
pnpm exec wrangler secret put HEALTHCHECK_TOKEN --env production
```

Then build and deploy preview and staging once:

```bash
pnpm cf:build
pnpm exec wrangler deploy --env preview
pnpm exec wrangler deploy --env staging
```

Do not deploy production. Setting the production secret prepares its Worker configuration but must not route traffic.

- [ ] **Step 3: Configure repository secrets and environments**

Create repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `PREVIEW_HEALTHCHECK_TOKEN`
- `STAGING_HEALTHCHECK_TOKEN`

Create GitHub Environment `production` with required reviewer approval and:

- secret `PRODUCTION_HEALTHCHECK_TOKEN`;
- variable `PRODUCTION_DOMAIN_VERIFIED` set to `false`.

The Cloudflare API token must be restricted to the single UnseenPrompt account and only permissions needed for Workers Scripts, Workers Workflows, and routes.

- [ ] **Step 4: Write the runbook**

`docs/deployment/cloudflare-runbook.md` must contain:

- environment/Worker/Workflow name mapping;
- secret ownership and rotation process;
- local preview, remote preview, staging, and production commands;
- staging smoke procedure;
- production dry-run and promotion procedure;
- rollback command using the previous version ID;
- log inspection with `wrangler tail --env staging`;
- explicit prohibition on copying production secrets into preview/staging;
- DNS and zone verification checklist;
- incident instruction to revoke the API token and rotate health tokens after suspected exposure.

Do not include real IDs, subdomains, tokens, or version IDs.

- [ ] **Step 5: Verify staging**

Capture the staging deployment URL from Wrangler's structured output as `STAGING_DEPLOYMENT_URL`, then run with values supplied only through the process environment:

```bash
DEPLOYMENT_URL="$STAGING_DEPLOYMENT_URL" \
HEALTHCHECK_TOKEN="$STAGING_HEALTHCHECK_TOKEN" \
GITHUB_SHA="$(git rev-parse HEAD)" \
pnpm test:cf-deployment
```

Fail if `STAGING_DEPLOYMENT_URL` is absent or does not use HTTPS. Never commit the account-specific value unless the maintainer explicitly classifies it as public configuration.

Expected: runtime health is `ok` and Workflow reaches `complete`.

- [ ] **Step 6: Update README and commit**

Add a Phase 1 status section and link the runbook:

```bash
git add docs/deployment/cloudflare-runbook.md README.md
git commit -m "docs: add Cloudflare deployment runbook"
```

---

### Task 8: Add Pull-Request Preview Deployments

**Files:**

- Create: `.github/workflows/deploy-preview.yml`

**Interfaces:**

- Trigger: same-repository pull requests with `opened`, `reopened`, `synchronize`, or `ready_for_review`.
- Produces: preview Worker version, alias `pr-<number>`, remote runtime smoke result, and GitHub step summary URL.

- [ ] **Step 1: Create the read-only workflow**

Implement:

```yaml
name: Deploy Preview

on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]

permissions:
  contents: read

concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  preview:
    if: github.event.pull_request.draft == false && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      CI: "true"
      APP_ENV: preview
      NEXT_PUBLIC_APP_URL: https://preview.unseenprompt.com
      RELEASE_SHA: ${{ github.event.pull_request.head.sha }}
      NODE_VERSION: 24
      PNPM_VERSION: 11.17.0
    steps:
      - name: Check out pull request
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version: ${{ env.NODE_VERSION }}
      - name: Install pnpm
        run: npm install --global pnpm@${PNPM_VERSION}
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Build Worker
        run: pnpm cf:build
      - name: Upload preview version
        id: upload
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          WRANGLER_OUTPUT_FILE_PATH: ${{ runner.temp }}/wrangler-output.ndjson
        run: >-
          pnpm exec wrangler versions upload
          --env preview
          --strict
          --preview-alias pr-${{ github.event.pull_request.number }}
          --tag ${{ github.event.pull_request.head.sha }}
          --message "PR ${{ github.event.pull_request.number }}"
          --var RELEASE_SHA:${{ github.event.pull_request.head.sha }}
      - name: Resolve preview URL
        id: preview
        env:
          OUTPUT_FILE: ${{ runner.temp }}/wrangler-output.ndjson
        run: |
          node --input-type=module -e '
            import { appendFileSync, readFileSync } from "node:fs";
            const events = readFileSync(process.env.OUTPUT_FILE, "utf8")
              .trim().split("\n").map(JSON.parse);
            const upload = events.find((event) => event.type === "version-upload");
            const url = upload?.preview_urls?.find((value) => value.includes("pr-")) ??
              upload?.preview_urls?.[0];
            if (!url) throw new Error("Wrangler did not report a preview URL");
            appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`);
            appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Preview: ${url}\n`);
          '
      - name: Smoke-test preview
        env:
          DEPLOYMENT_URL: ${{ steps.preview.outputs.url }}
          HEALTHCHECK_TOKEN: ${{ secrets.PREVIEW_HEALTHCHECK_TOKEN }}
        run: pnpm test:cf-deployment
```

Fork pull requests intentionally skip deployment because repository secrets are unavailable to untrusted fork code. Their normal CI still runs.

- [ ] **Step 2: Validate workflow syntax locally**

Run:

```bash
pnpm exec prettier --check .github/workflows/deploy-preview.yml
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Validate on a same-repository pull request**

Push the Phase 1 branch and observe:

- CI passes before/alongside deployment;
- `unseenprompt-preview` receives a new version;
- alias begins `pr-`;
- the job summary contains an HTTPS URL;
- the smoke test passes.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-preview.yml
git commit -m "ci: deploy pull request Worker previews"
```

---

### Task 9: Add Staging Deployment and Controlled Production Promotion

**Files:**

- Create: `.github/workflows/deploy-release.yml`
- Modify: `docs/deployment/cloudflare-runbook.md`

**Interfaces:**

- Push to `main`: deploy staging and smoke-test it.
- Manual dispatch with `target=production`: verify the selected SHA is `main`, require production environment approval and domain verification, upload a tagged version, dry-run, then promote 100%.

- [ ] **Step 1: Create the release workflow**

Implement two jobs:

```yaml
name: Deploy Release

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      target:
        description: Deployment target
        required: true
        type: choice
        options: [production]
      release_sha:
        description: Full commit SHA already present on main
        required: true
        type: string

permissions:
  contents: read

concurrency:
  group: deploy-${{ github.event_name == 'push' && 'staging' || inputs.target }}
  cancel-in-progress: false
```

The `staging` job must:

1. Run only for `push`.
2. Check out `github.sha`.
3. Install Node 24 and pnpm 11.17.0.
4. Run `pnpm install --frozen-lockfile`.
5. Run `pnpm format:check`, `lint`, `typecheck`, `test:unit`, `cf:types:check`, `check:workers-deps`, and `cf:build`.
6. Run `wrangler deploy --env staging --var RELEASE_SHA:${{ github.sha }}` with Cloudflare credentials.
7. Read the deployed URL from `WRANGLER_OUTPUT_FILE_PATH`.
8. Run `pnpm test:cf-deployment` with `STAGING_HEALTHCHECK_TOKEN`.
9. Set `environment: staging` with the resolved URL.

The `production` job must:

1. Run only for `workflow_dispatch`.
2. Set `environment: production` so required reviewers must approve it.
3. Reject `release_sha` unless it matches `^[0-9a-f]{40}$`.
4. Fetch `origin/main` and require `git merge-base --is-ancestor "$RELEASE_SHA" origin/main`.
5. Require repository/environment variable `PRODUCTION_DOMAIN_VERIFIED` to equal `true`.
6. Check out the exact SHA and run the same quality/build gates.
7. Run `pnpm exec wrangler deploy --env production --dry-run`.
8. Upload with:

```bash
pnpm exec wrangler versions upload \
  --env production \
  --strict \
  --tag "release-${RELEASE_SHA}" \
  --message "Production ${RELEASE_SHA}" \
  --var "RELEASE_SHA:${RELEASE_SHA}"
```

9. Read the `version_id` from the Wrangler NDJSON `version-upload` event.
10. Promote exactly that ID:

```bash
pnpm exec wrangler versions deploy \
  --env production \
  "${VERSION_ID}@100" \
  --message "Production ${RELEASE_SHA}" \
  --yes
```

11. Smoke-test `https://unseenprompt.com` with `PRODUCTION_HEALTHCHECK_TOKEN`.

Never use `wrangler deploy` for production because upload and promotion must remain separate reviewable operations.

- [ ] **Step 2: Add rollback commands to the runbook**

Document:

```bash
pnpm exec wrangler deployments list --env production
pnpm exec wrangler versions deploy --env production "${PREVIOUS_VERSION_ID}@100" --yes
```

Require the operator to copy the reviewed previous version ID from the first command into `PREVIOUS_VERSION_ID`, then run a post-rollback runtime and Workflow smoke test. Do not claim rollback covers external state; Worker versions do not roll back databases or storage.

- [ ] **Step 3: Verify workflow and production dry-run**

Run:

```bash
pnpm exec prettier --check .github/workflows/deploy-release.yml
pnpm cf:dry-run:production
```

Expected: syntax and Worker dry-run pass without remote production deployment.

- [ ] **Step 4: Verify staging from `main`**

After review/merge, observe the staging job and confirm:

- exact merged SHA deployed;
- health environment is `staging`;
- release matches the merged SHA;
- Workflow probe completes;
- no production job starts.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy-release.yml docs/deployment/cloudflare-runbook.md
git commit -m "ci: control staging and production Worker releases"
```

---

### Task 10: Document Architecture, Validate Phase Exit, and Prepare Review

**Files:**

- Create: `docs/architecture/phase-1-cloudflare-topology.md`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

**Interfaces:**

- Produces: permanent architecture record, reproducible operator commands, and Phase 1 evidence.

- [ ] **Step 1: Write the architecture record**

Document:

- the four-environment topology;
- preview code isolation versus shared preview bindings;
- Worker and Workflow trust boundaries;
- public versus protected health surfaces;
- why the custom Worker entry point exists;
- release flow and rollback limits;
- observability sampling (`1.0` non-production, `0.1` production);
- failure modes: missing secret, invalid binding, failed upload, failed Workflow, DNS failure, stale version, and rollback with external-state skew;
- Phase 3 requirement to add per-PR database isolation;
- Phase 16 requirement to review rate limits, Access protection, log retention, and alerting.

- [ ] **Step 2: Update developer entry points**

In `README.md` and `CONTRIBUTING.md`, include:

```bash
cp .dev.vars.example .dev.vars
pnpm cf:types:check
pnpm check:workers-deps
pnpm cf:build
pnpm test:cf-preview
```

Explain that `.dev.vars` is ignored and its example token must be replaced.

- [ ] **Step 3: Run the complete local gate**

Run on Node 24:

```bash
pnpm install --frozen-lockfile
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm cf:types:check
pnpm check:workers-deps
pnpm cf:build
pnpm test:cf-preview
pnpm cf:dry-run:preview
pnpm cf:dry-run:staging
pnpm cf:dry-run:production
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 4: Scan for secret and generated-output leaks**

Run:

```bash
git status --short
git ls-files | rg '(^|/)(\.dev\.vars|\.env\.local|\.open-next|\.wrangler)(/|$)' && exit 1 || true
git grep -nE 'CLOUDFLARE_API_TOKEN=|HEALTHCHECK_TOKEN=[A-Za-z0-9+/=_-]{32,}' -- ':!docs/superpowers/plans/**'
```

Expected: no tracked secret files, generated output, or production-shaped secret values.

- [ ] **Step 5: Verify roadmap coverage**

Record evidence for every Phase 1 exit criterion:

| Exit criterion                              | Evidence                                                        |
| ------------------------------------------- | --------------------------------------------------------------- |
| Staging serves through Workers              | staging deployment URL and successful remote smoke job          |
| Environment values remain isolated          | Wrangler named-env config and distinct health outputs           |
| Runtime health passes                       | `/api/health` unit, local preview, and staging smoke            |
| Production bundle passes preview validation | production dry-run plus local Worker preview                    |
| Workflow binding works                      | authenticated probe reaches `complete`                          |
| Production is controlled                    | manual dispatch, protected environment, main ancestry, DNS gate |

- [ ] **Step 6: Commit documentation**

```bash
git add docs/architecture/phase-1-cloudflare-topology.md README.md CONTRIBUTING.md
git commit -m "docs: record Phase 1 Cloudflare architecture"
```

- [ ] **Step 7: Prepare pull-request handoff**

Report:

- commits and changed files;
- local validation output;
- preview deployment URL;
- staging deployment evidence if already merged/tested;
- production dry-run evidence;
- whether DNS/zone verification remains blocked;
- any Cloudflare resources created;
- confirmation that no production traffic was changed.

Do not mark Phase 1 complete until Tasks 1–8 and the local portion of Task 10 pass. Mark remote staging as a blocking exit gate; mark production deployment itself as deferred when DNS verification is not complete.

---

## External References Verified During Planning

- OpenNext Cloudflare setup and required `nodejs_compat`: https://opennext.js.org/cloudflare/get-started
- OpenNext custom Worker entry point: https://opennext.js.org/cloudflare/howtos/custom-worker
- OpenNext CLI behavior: https://opennext.js.org/cloudflare/cli
- Wrangler environments: https://developers.cloudflare.com/workers/wrangler/environments/
- Workers preview URLs and aliases: https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/
- Workers versions and deployments: https://developers.cloudflare.com/workers/versions-and-deployments/
- Cloudflare Workflows bindings: https://developers.cloudflare.com/workflows/build/trigger-workflows/
- Workflows Workers API and idempotency behavior: https://developers.cloudflare.com/workflows/build/workers-api/
- Workers observability configuration: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Cloudflare GitHub Actions authentication: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
