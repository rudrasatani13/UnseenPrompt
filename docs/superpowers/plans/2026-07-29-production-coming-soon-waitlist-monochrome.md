# Production Coming-Soon, Waitlist, and Monochrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active Powder Pink identity with the approved Pure Monochrome / White Canvas
system, serve a real double-opt-in waitlist only on production, and keep the Phase 2 product preview
deploying only to staging, preview, local, and test.

**Architecture:** Keep one Next.js App Router application and choose the production presentation on
the server before shell markup renders. Put provider-independent waitlist rules in
`src/domain/waitlist`, production adapters in `src/lib/waitlist`, UI orchestration in
`src/features/waitlist`, and thin HTTP handlers under `src/app/api/waitlist`. Supabase functions own
concurrent state transitions; Turnstile and Resend remain bounded external adapters.

**Tech Stack:** Node.js 24, pnpm 11.17.0, Next.js 16.2.12, React 19.2.8, TypeScript 6.0.3, Tailwind
CSS 4.3.3, shadcn/Radix UI 1.6.7, Motion 12.42.2, Animate UI registry source, Lucide 1.27.0,
Supabase JS 2.111.0, PostgreSQL 17, Supabase Cron, Cloudflare Turnstile and Workers, Resend HTTP API,
Vitest 4.1.10, Testing Library, vitest-axe, and Playwright 1.62.0.

## Global Constraints

- Treat
  `docs/superpowers/specs/2026-07-29-production-coming-soon-waitlist-and-monochrome-design.md` as the
  approved source of truth.
- The production canvas is `#FFFFFF`; active product colors are black, white, and neutral gray only.
- Do not add dark mode, gradients, decorative lines, circles, textures, background artwork, mock
  dashboards, analytics, tracking pixels, referrals, waitlist position, or launch-date claims.
- Keep Manrope, shadcn/ui, Tailwind, Lucide, Motion, and the configured Animate UI registry. Add no
  second component or icon system.
- Animate UI source is owned locally and may animate once on interaction or state change. Reduced
  motion must render the same state statically.
- Public copy must follow `docs/development/product-copy.md`; prohibited marketing phrases must not
  appear in active public surfaces.
- Production `/design-system` must return exactly 404 and must never stream shell or gallery markup.
- Staging, preview, local, and test must keep the Phase 2 product preview and application shell.
- Waitlist writes are production-only. Preview and staging must never receive production Supabase,
  Resend, Turnstile-secret, or token-secret credentials.
- Never persist raw confirmation/removal tokens, IP addresses, user agents, referrals, provider
  response bodies, or request bodies.
- Treat all request input and provider responses as hostile. Bound body size, validate content
  type, use timeouts, and return non-enumerating public results.
- Keep secrets server-only. No waitlist secret may use `NEXT_PUBLIC_`, enter a client module, log,
  response, screenshot, fixture, or deployment artifact.
- Use additive migrations. Rollback must not drop the table or delete confirmed entries.
- Use TDD for every behavioral task: failing test, observed failure, minimal complete
  implementation, passing test, then task-scoped commit.
- Preserve unrelated user work and do not stage paths outside the current task.

---

## Execution Contract

- [ ] Read `AGENTS.md` instructions supplied by the environment, the approved specification, this
      plan, `README.md`, `docs/UnseenPrompt – DEVELOPMENT_PLAN.md`,
      `docs/UnseenPrompt – Stateful Project Copilot.md`, `docs/development/environment-contract.md`,
      `docs/development/design-system.md`, and `docs/deployment/cloudflare-runbook.md`.
- [ ] Use `superpowers:using-git-worktrees` before execution if the implementation is not already in
      an isolated worktree.
- [ ] Start from current `main`, not from the documentation-only planning branch. Create a branch
      named `codex/production-coming-soon`.
- [ ] Confirm `PRODUCTION_DEPLOY_ENABLED=false` before any implementation or candidate upload.
- [ ] Run the baseline and record any pre-existing failure:

```bash
git status --short --branch
git branch --show-current
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
```

Expected: clean implementation worktree, Node `v24.x`, pnpm `11.17.0`, and all baseline checks pass.
If the baseline fails, stop and diagnose with `superpowers:systematic-debugging`.

For production-mode local builds and browser tests, use only these non-routable/test values:

```bash
export APP_ENV=production
export NEXT_PUBLIC_APP_URL=https://unseenprompt.com
export RELEASE_SHA=local-production-test
export MAINTENANCE_MODE=off
export NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
export TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
export SUPABASE_URL=https://waitlist.invalid
export SUPABASE_SECRET_KEY=sb_secret_local_test_value_000000000000
export RESEND_API_KEY=re_local_test_value_0000000000000000
export WAITLIST_TOKEN_SECRET=local_test_token_secret_0000000000000000
export WAITLIST_FROM_EMAIL='UnseenPrompt <hello@unseenprompt.com>'
```

These values must never be used for a deployed candidate. Production GitHub/Cloudflare environments
provide real values through protected variables and secrets.

## Planned File Map

```text
.
├── .dev.vars.example
├── .env.example
├── .github/workflows/
│   ├── ci.yml
│   └── deploy-release.yml
├── README.md
├── assets/brand/
│   └── logo-monochrome.svg
├── docs/
│   ├── UnseenPrompt – DEVELOPMENT_PLAN.md
│   ├── UnseenPrompt – PRODUCT_PLAN.md
│   ├── development/
│   │   ├── design-system.md
│   │   ├── environment-contract.md
│   │   └── product-copy.md
│   └── deployment/cloudflare-runbook.md
├── package.json
├── playwright.config.ts
├── next.config.ts
├── public/brand/
├── scripts/
│   ├── assert-cloudflare-deployment.mjs
│   ├── copy-policy.test.ts
│   ├── create-waitlist-removal-link.test.ts
│   ├── create-waitlist-removal-link.ts
│   ├── generate-brand-assets.mjs
│   ├── generate-social-card.mjs
│   ├── phase-2-assets.test.ts
│   ├── production-release-workflow.test.ts
│   └── sequential-release-workflow.test.ts
├── src/
│   ├── app/
│   │   ├── (product)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── privacy/page.tsx
│   │   │   ├── terms/page.tsx
│   │   │   └── waitlist/{confirm,remove}/page.tsx
│   │   ├── api/waitlist/{request,confirm,remove}/route.ts
│   │   ├── design-system/
│   │   ├── layout.tsx
│   │   ├── manifest.ts
│   │   └── metadata.ts
│   ├── components/
│   │   ├── brand/brand-lockup.tsx
│   │   ├── product/
│   │   ├── shell/
│   │   └── ui/
│   ├── config/
│   │   ├── env/
│   │   └── waitlist/{schema,server}.ts
│   ├── domain/waitlist/
│   │   ├── contracts.ts
│   │   ├── email.ts
│   │   ├── service.ts
│   │   └── tokens.ts
│   ├── features/waitlist/
│   │   ├── coming-soon-landing.tsx
│   │   ├── confirmation-panel.tsx
│   │   ├── removal-panel.tsx
│   │   ├── turnstile-widget.tsx
│   │   └── waitlist-form.tsx
│   └── lib/waitlist/
│       ├── resend-mailer.ts
│       ├── runtime.ts
│       ├── supabase-repository.ts
│       └── turnstile-verifier.ts
├── supabase/
│   ├── migrations/20260729000100_waitlist.sql
│   └── tests/database/00010_waitlist.test.sql
├── tests/e2e/
│   ├── production-coming-soon.spec.ts
│   ├── production-guard.spec.ts
│   └── visual.spec.ts
└── wrangler.jsonc
```

Test files colocate beside their TypeScript/TSX subjects unless the map names an integration test.
Generated image files retain their current paths under `src/app` and `public/brand`.

## Locked Cross-Task Interfaces

```ts
export type PublicWaitlistResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "invalid_email" }
  | { readonly kind: "verification_failed" }
  | { readonly kind: "temporary_failure" };

export type ConfirmationResult = "confirmed" | "already_confirmed" | "expired" | "invalid";
export type RemovalResult = "removed" | "already_removed" | "invalid";

export interface Clock {
  now(): Date;
}

export interface IdempotencyKeyGenerator {
  create(): string;
}

export interface TokenCodec {
  deriveConfirmation(idempotencyKey: string): Promise<string>;
  hashConfirmation(token: string): Promise<string>;
  signManagement(entryId: string, managementVersion: number): Promise<string>;
  verifyManagement(
    token: string,
  ): Promise<{ readonly entryId: string; readonly managementVersion: number } | null>;
}

export interface TurnstileVerifier {
  verify(input: {
    readonly token: string;
    readonly action: "waitlist_request";
    readonly hostname: string;
    readonly idempotencyKey: string;
  }): Promise<"verified" | "rejected" | "unavailable">;
}

export interface ConfirmationMailer {
  send(input: {
    readonly email: string;
    readonly confirmationUrl: string;
    readonly idempotencyKey: string;
  }): Promise<"sent" | "unavailable" | "misconfigured">;
}

export type RequestConfirmationDecision =
  | { readonly kind: "send"; readonly idempotencyKey: string }
  | { readonly kind: "cooldown" }
  | { readonly kind: "confirmed" };

export interface WaitlistRepository {
  requestConfirmation(input: {
    readonly email: string;
    readonly emailNormalized: string;
    readonly consentAt: Date;
    readonly candidateTokenHash: string;
    readonly candidateExpiresAt: Date;
    readonly candidateIdempotencyKey: string;
  }): Promise<RequestConfirmationDecision>;
  markConfirmationSent(input: {
    readonly emailNormalized: string;
    readonly idempotencyKey: string;
    readonly sentAt: Date;
  }): Promise<void>;
  confirm(input: { readonly tokenHash: string; readonly now: Date }): Promise<ConfirmationResult>;
  remove(input: {
    readonly entryId: string;
    readonly managementVersion: number;
    readonly now: Date;
  }): Promise<RemovalResult>;
}

export interface WaitlistRequest {
  readonly email: string;
  readonly turnstileToken: string;
  readonly requestId: string;
}

export interface WaitlistService {
  request(input: WaitlistRequest): Promise<PublicWaitlistResult>;
  confirm(token: string): Promise<ConfirmationResult>;
  remove(token: string): Promise<RemovalResult>;
}
```

Do not rename these contracts in later tasks.

---

### Task 1: Establish the Product-Copy Contract

**Files:**

- Create: `docs/development/product-copy.md`
- Create: `scripts/copy-policy.test.ts`
- Modify: `README.md`
- Rename: `docs/UnseenPrompt – Stateful Project Copilot.md` →
  `docs/UnseenPrompt – PRODUCT_PLAN.md`
- Modify: `docs/UnseenPrompt – DEVELOPMENT_PLAN.md`
- Modify: `package.json`

**Interfaces:**

- Produces: `pnpm test:copy`, the repository-wide active-copy gate used by Task 13.

- [ ] **Step 1: Write the failing copy-policy test**

```ts
const prohibited = [
  "Stateful Project Copilot",
  "AI-powered",
  "agent-ready",
  "revolutionary",
  "unlock",
  "supercharge",
  "seamless",
  "game-changing",
] as const;

const scannedRoots = [
  "README.md",
  "src",
  "docs/UnseenPrompt – DEVELOPMENT_PLAN.md",
  "docs/UnseenPrompt – PRODUCT_PLAN.md",
  "docs/development",
];
```

Implement deterministic recursive file collection for `.md`, `.ts`, `.tsx`, `.mjs`, and `.json`.
Exclude `node_modules`, generated files, dated `docs/superpowers/{plans,specs}`, and the exact
prohibited-list declaration in `product-copy.md` and this test.

- [ ] **Step 2: Run the test and observe the existing copy failures**

Run: `pnpm exec vitest run scripts/copy-policy.test.ts`

Expected: FAIL listing current runtime, README, master-plan, development-plan, manifest, and
social-card occurrences; each failure includes its relative path.

- [ ] **Step 3: Write the copy guide and update active identity text**

Copy the approved voice, prohibited phrases, evidence rules, production copy, confirmation copy,
and error copy verbatim from the specification. Rename the master plan with `git mv`, repair all
links, and replace identity/category wording with factual descriptions. Do not rewrite dated
historical plans.

- [ ] **Step 4: Add and run the focused command**

```json
{
  "scripts": {
    "test:copy": "vitest run scripts/copy-policy.test.ts"
  }
}
```

Run: `pnpm test:copy && pnpm lint && pnpm format:check`

Expected: all pass and `rg -n "Stateful Project Copilot|agent-ready" README.md src docs/development
"docs/UnseenPrompt – DEVELOPMENT_PLAN.md" "docs/UnseenPrompt – PRODUCT_PLAN.md"` returns no active
copy occurrence.

- [ ] **Step 5: Commit**

```bash
git add README.md package.json scripts/copy-policy.test.ts docs/development/product-copy.md \
  "docs/UnseenPrompt – DEVELOPMENT_PLAN.md" "docs/UnseenPrompt – PRODUCT_PLAN.md"
git commit -m "docs: establish plainspoken product copy"
```

### Task 2: Migrate the Design System to Pure Monochrome

**Files:**

- Modify: `src/components/ui/theme.css`
- Modify: `src/components/ui/theme.test.ts`
- Modify: `src/components/ui/{alert,button,badge,card,dialog,sheet,alert-dialog}.tsx`
- Modify: `src/components/product/*.tsx`
- Modify: `src/components/shell/*.tsx`
- Modify: `src/app/{error,global-error,not-found}.tsx`
- Modify: `src/app/design-system/{gallery-client,gallery-data}.tsx`
- Modify: `src/components/ui/{theme,primitives,overlays}.test.ts{,x}`
- Modify: `src/components/product/*.test.tsx`
- Modify: `src/components/shell/*.test.tsx`
- Modify: `src/app/{error,layout}.test.tsx`
- Modify: `src/app/design-system/page.test.tsx`
- Modify: `docs/development/design-system.md`

**Interfaces:**

- Produces: monochrome Tailwind aliases consumed by all later UI tasks.

- [ ] **Step 1: Replace the token expectations first**

```ts
const lockedTokens = {
  "--canvas": "#FFFFFF",
  "--surface": "#FFFFFF",
  "--surface-muted": "#F5F5F5",
  "--text-primary": "#000000",
  "--text-secondary": "#525252",
  "--brand-primary": "#000000",
  "--brand-primary-hover": "#262626",
  "--brand-primary-active": "#404040",
  "--border-control": "#737373",
  "--border-subtle": "#D4D4D4",
  "--focus-ring-color": "#000000",
} as const;
```

Add exact status expectations: success `#F7F7F7/#737373/1px`, information
`#F5F5F5/#737373/1px`, warning `#EFEFEF/#525252/1px`, danger
`#E8E8E8/#000000/2px`, all with `#000000` text. Expect radii `0, 2, 4, 8px`, no panel shadow, and
overlay shadow `0 16px 48px rgb(0 0 0 / 18%)`.

- [ ] **Step 2: Observe the palette test fail**

Run: `pnpm exec vitest run src/components/ui/theme.test.ts`

Expected: FAIL on the old Warm Editorial values.

- [ ] **Step 3: Implement the token migration**

Keep existing semantic utility names to minimize churn, map all status foregrounds to black, add
status-border tokens, set `--radius: 4px`, and remove `--panel-shadow`. Keep the white focus offset,
reduced-motion rules, and forced-colors rules. Update primitives so cards use borders, only dialogs
and sheets use `shadow-overlay`, and alerts use the locked border width plus visible icon/text.

- [ ] **Step 4: Migrate every active component and gallery specimen**

Remove pink-specific comments/classes, decorative shadows, excessive pill radii, and color-only
status presentation. Gallery inventory must show the exact tokens, four status mappings, all five
`FileItem` statuses, reduced motion, and forced colors. Global error inline styles must be
`#FFFFFF`, `#000000`, `#525252`, and `#D4D4D4`.

- [ ] **Step 5: Run component and accessibility tests**

Run:

```bash
pnpm exec vitest run src/components/ui src/components/product src/components/shell \
  src/app/error.test.tsx src/app/design-system/page.test.tsx
pnpm lint
pnpm typecheck
```

Expected: PASS; `rg -n "#(?:FEFAF8|A64763|8D3852|762C43|FAF4F5|E9DFE1)|Warm Editorial|Powder Pink"
src docs/development/design-system.md` returns no match.

- [ ] **Step 6: Commit**

```bash
git add src/components src/app/error.tsx src/app/global-error.tsx src/app/not-found.tsx \
  src/app/design-system docs/development/design-system.md
git commit -m "feat: migrate active interface to pure monochrome"
```

### Task 3: Regenerate and Audit Monochrome Brand Assets

**Files:**

- Create: `assets/brand/logo-monochrome.svg`
- Create: `scripts/generate-brand-assets.mjs`
- Modify: `scripts/generate-social-card.mjs`
- Modify: `scripts/phase-2-assets.test.ts`
- Modify: `src/components/brand/brand-lockup.tsx`
- Modify: `src/app/{manifest.ts,manifest.test.ts}`
- Regenerate: `public/brand/*.png`, `src/app/favicon.ico`, `src/app/icon.png`,
  `src/app/apple-icon.png`, `src/app/opengraph-image.png`, `src/app/twitter-image.png`
- Delete: `assets/brand/logo-source.png` only after the reference audit passes

**Interfaces:**

- Produces: one SVG source and deterministic derived metadata assets.

- [ ] **Step 1: Make the asset test reject the pink baseline**

Require the canonical SVG to contain only `#000000`, `#FFFFFF`, and `none`; require every raster to
have the existing dimensions; scan decoded pixels and reject non-neutral pixels where
`max(r,g,b)-min(r,g,b) > 2`. Remove old hash expectations and assert deterministic new hashes after
generation.

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run scripts/phase-2-assets.test.ts`

Expected: FAIL because the canonical SVG is absent and current pixels are pink.

- [ ] **Step 3: Create the canonical vector and deterministic generator**

Use a white `1024×1024` viewBox, three black-stroked/no-fill ellipses rotated `0`, `60`, and `120`
degrees around `(512,512)`, and the centered rounded-square ring. Render fixed sizes through
Playwright Chromium with reduced motion and no network access. Generate regular icons, a maskable
icon with a 20% safe-zone inset, and the `.ico` file by writing an ICO directory header followed by
the generated 32×32 PNG payload; do not depend on a machine-installed image utility.

- [ ] **Step 4: Regenerate social metadata**

Set the social card to a pure-white canvas, monochrome mark, `UnseenPrompt`, and
`Start with the messy version.` Remove the old subtitle and all warm colors. Run:

```bash
node scripts/generate-brand-assets.mjs
pnpm brand:social
pnpm exec vitest run scripts/phase-2-assets.test.ts src/app/manifest.test.ts \
  src/components/brand/brand-lockup.test.tsx
```

Expected: PASS and Open Graph/Twitter files remain intentionally byte-identical.

- [ ] **Step 5: Audit references before deletion**

Run:

```bash
rg -n "logo-source|icon-192|icon-512|icon-maskable|favicon|apple-icon|opengraph|twitter-image" \
  . --glob '!node_modules/**' --glob '!.git/**'
find assets public src/app -type f -print | sort
```

Delete the old pink source only when no active reference remains. Keep purposeful Open Graph and
Twitter duplicates because Next.js requires both filenames.

- [ ] **Step 6: Commit**

```bash
git add assets/brand public/brand src/app scripts/generate-brand-assets.mjs \
  scripts/generate-social-card.mjs scripts/phase-2-assets.test.ts src/components/brand
git commit -m "feat: regenerate monochrome brand assets"
```

### Task 4: Add the Server-Only Waitlist Configuration

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `src/config/waitlist/schema.ts`
- Create: `src/config/waitlist/schema.test.ts`
- Create: `src/config/waitlist/server.ts`
- Modify: `.env.example`, `.dev.vars.example`
- Modify: `src/tooling/import-boundaries.test.ts`

**Interfaces:**

- Produces: `WaitlistEnvironment` and `getWaitlistEnvironment()`.

- [ ] **Step 1: Pin the Supabase client**

Run: `pnpm add @supabase/supabase-js@2.111.0 --save-exact`

Expected: package and lockfile contain exactly `2.111.0`.

- [ ] **Step 2: Write failing configuration tests**

```ts
export interface WaitlistEnvironment {
  readonly turnstileSiteKey: string;
  readonly turnstileSecretKey: string;
  readonly supabaseUrl: string;
  readonly supabaseSecretKey: string;
  readonly resendApiKey: string;
  readonly tokenSecret: string;
  readonly fromEmail: "UnseenPrompt <hello@unseenprompt.com>";
  readonly appUrl: URL;
}
```

Test that production accepts HTTPS URLs, a non-empty site key, and secrets of at least 32
characters; rejects missing/malformed values; and never includes secret values in Zod messages.
Test that the config module imports `server-only`.

- [ ] **Step 3: Observe failure**

Run: `pnpm exec vitest run src/config/waitlist/schema.test.ts`

Expected: FAIL because the schema does not exist.

- [ ] **Step 4: Implement strict parsing**

`getWaitlistEnvironment()` must call `getServerEnvironment()`, reject non-production invocation,
derive the expected hostname from `NEXT_PUBLIC_APP_URL`, and read exactly:
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `WAITLIST_TOKEN_SECRET`, and
`WAITLIST_FROM_EMAIL`. Examples use conspicuously fake values.

- [ ] **Step 5: Verify boundary and config tests**

Run: `pnpm exec vitest run src/config src/tooling/import-boundaries.test.ts && pnpm typecheck`

Expected: PASS; client-source scan finds no import of `@/config/waitlist/server`.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example .dev.vars.example src/config src/tooling
git commit -m "feat: validate server-only waitlist configuration"
```

### Task 5: Implement Waitlist Domain Values and Token Cryptography

**Files:**

- Create: `src/domain/waitlist/contracts.ts`
- Create: `src/domain/waitlist/email.ts`
- Create: `src/domain/waitlist/email.test.ts`
- Create: `src/domain/waitlist/tokens.ts`
- Create: `src/domain/waitlist/tokens.test.ts`

**Interfaces:**

- Produces: all locked interfaces plus `normalizeEmail`, `WebCryptoTokenCodec`, and result unions.

- [ ] **Step 1: Write email and token tests**

Test trim/lowercase normalization, 254-character bound, malformed addresses, Unicode/control
characters, HMAC domain separation, deterministic confirmation derivation, SHA-256 lookup hash,
management round-trip, modified signature rejection, and malformed base64url rejection.

```ts
expect(normalizeEmail("  Person@Example.COM ")).toEqual({
  email: "Person@Example.COM",
  normalized: "person@example.com",
});
expect(await codec.deriveConfirmation("550e8400-e29b-41d4-a716-446655440000")).toBe(
  await codec.deriveConfirmation("550e8400-e29b-41d4-a716-446655440000"),
);
```

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run src/domain/waitlist/email.test.ts src/domain/waitlist/tokens.test.ts`

Expected: FAIL on missing modules.

- [ ] **Step 3: Implement provider-free values**

Use Web Crypto only. Confirmation token input is
`` `confirmation:${deliveryIdempotencyKey}` ``; management input is
`` `management:${entryId}:${managementVersion}` ``. Encode token payload/signature with unpadded
base64url and verify through `crypto.subtle.verify`. Hash confirmation tokens to lowercase hex
SHA-256. Return `null`, never throw, for hostile management-token syntax.

- [ ] **Step 4: Verify domain isolation**

Run:

```bash
pnpm exec vitest run src/domain/waitlist
pnpm lint
pnpm typecheck
```

Expected: PASS and domain files import no `app`, `components`, `config`, `features`, or `lib` module.

- [ ] **Step 5: Commit**

```bash
git add src/domain/waitlist
git commit -m "feat: add waitlist domain values and tokens"
```

### Task 6: Create the Atomic Supabase Waitlist Schema

**Files:**

- Create: `supabase/migrations/20260729000100_waitlist.sql`
- Create: `supabase/tests/database/00010_waitlist.test.sql`

**Interfaces:**

- Produces RPCs: `request_waitlist_confirmation`, `mark_waitlist_confirmation_sent`,
  `confirm_waitlist_entry`, `remove_waitlist_entry`, `purge_expired_waitlist_entries`.

- [ ] **Step 1: Write failing pgTAP coverage**

Assert table columns and constraints, RLS enabled, zero `anon`/`authenticated` privileges, fixed
function search paths, unique normalized email, status check, concurrent request decisions,
ten-minute cooldown, repeat confirmation, expired/invalid confirmation, versioned idempotent
removal, 24-hour removed-row purge, 30-day pending purge, and clearing expired confirmation fields
on confirmed rows.

- [ ] **Step 2: Observe migration-test failure**

Run:

```bash
pnpm exec supabase db start
pnpm test:db
```

Expected: FAIL because `public.waitlist_entries` and its RPCs are absent.

- [ ] **Step 3: Implement the table and grants**

Create the columns in the approved specification, `management_version integer not null default 1
check (management_version > 0)`, server-maintained timestamps, and unique
`email_normalized`. Enable RLS, revoke all table/sequence/function privileges from public roles,
grant only required RPC execution to `service_role`, and make every `security definer` function set
`search_path = pg_catalog, public`.

- [ ] **Step 4: Implement exact RPC return enums**

`request_waitlist_confirmation` returns `send`, `cooldown`, or `confirmed` plus the stored delivery
idempotency key only for `send`;
`confirm_waitlist_entry` returns `confirmed`, `already_confirmed`, `expired`, or `invalid`;
`remove_waitlist_entry` returns `removed`, `already_removed`, or `invalid`. RPCs must never return
email or hashes. Use row locks/upsert conflict handling so one concurrent request receives `send`.
An unsent, unexpired row returns its existing key; an expired unsent row and a sent row past the
ten-minute cooldown rotate atomically to the supplied candidate key/hash/expiry.

- [ ] **Step 5: Add cleanup and scheduling**

`purge_expired_waitlist_entries()` deletes pending rows older than 30 days and removed rows older
than 24 hours, then nulls expired confirmation hash/expiry/idempotency fields on confirmed rows.
Create one idempotent daily `pg_cron` job named `purge-expired-waitlist-entries`.

- [ ] **Step 6: Run database verification and stop local services**

Run:

```bash
pnpm test:db
pnpm exec supabase db reset
pnpm test:db
pnpm exec supabase stop --no-backup
```

Expected: both database runs pass from a fresh schema.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260729000100_waitlist.sql \
  supabase/tests/database/00010_waitlist.test.sql
git commit -m "feat: add atomic waitlist database schema"
```

### Task 7: Implement the Supabase Repository Adapter

**Files:**

- Create: `src/lib/waitlist/supabase-repository.ts`
- Create: `src/lib/waitlist/supabase-repository.test.ts`

**Interfaces:**

- Consumes: Task 5 contracts and Task 6 RPC names.
- Produces: `createSupabaseWaitlistRepository(environment): WaitlistRepository`.

- [ ] **Step 1: Write failing adapter tests**

Mock only the Supabase client's `rpc` boundary. Verify exact RPC names/arguments, result-enum
validation, no row/email logging, provider error mapping, and rejection of unexpected provider
payloads.

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run src/lib/waitlist/supabase-repository.test.ts`

Expected: FAIL on missing adapter.

- [ ] **Step 3: Implement the server client and repository**

Create the client with `persistSession:false`, `autoRefreshToken:false`, and
`detectSessionInUrl:false`. Pass the server secret only in this module. Parse every RPC response
with Zod before mapping it to the domain union. Throw an internal typed `WaitlistProviderError`
whose message contains provider/category only.

- [ ] **Step 4: Verify**

Run: `pnpm exec vitest run src/lib/waitlist/supabase-repository.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/waitlist/supabase-repository.ts src/lib/waitlist/supabase-repository.test.ts
git commit -m "feat: add Supabase waitlist repository"
```

### Task 8: Implement Turnstile and Resend Adapters

**Files:**

- Create: `src/lib/waitlist/turnstile-verifier.ts`
- Create: `src/lib/waitlist/turnstile-verifier.test.ts`
- Create: `src/lib/waitlist/resend-mailer.ts`
- Create: `src/lib/waitlist/resend-mailer.test.ts`

**Interfaces:**

- Consumes: `TurnstileVerifier`, `ConfirmationMailer`.
- Produces: `createTurnstileVerifier` and `createResendMailer`.

- [ ] **Step 1: Write hostile-provider tests**

Cover success, bad action, bad hostname, expired/duplicate token, malformed JSON, oversized
response, abort timeout, `429`, `4xx`, `5xx`, Resend `409` idempotent success, and a network timeout
followed by one retry with identical body and `Idempotency-Key`.

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run src/lib/waitlist/turnstile-verifier.test.ts
src/lib/waitlist/resend-mailer.test.ts`

Expected: FAIL on missing adapters.

- [ ] **Step 3: Implement bounded Turnstile verification**

POST URL-encoded fields to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with a
five-second `AbortSignal.timeout`, validate `success`, action `waitlist_request`, and exact hostname.
Map rejection to `rejected`; timeout/`429`/`5xx`/invalid response to `unavailable`.

- [ ] **Step 4: Implement confirmation delivery**

POST to `https://api.resend.com/emails` with a five-second timeout, exact From/Subject/body from the
specification, matching plain text, and `Idempotency-Key`. Accept only a confirmation URL whose
origin equals the configured application origin and whose path is `/waitlist/confirm`. Disable
open/click tracking at the verified Resend-domain configuration gate; never insert tracking
parameters.

- [ ] **Step 5: Verify**

Run: `pnpm exec vitest run src/lib/waitlist && pnpm lint && pnpm typecheck`

Expected: PASS and no test output contains a test email or token.

- [ ] **Step 6: Commit**

```bash
git add src/lib/waitlist/turnstile-verifier* src/lib/waitlist/resend-mailer*
git commit -m "feat: add bounded waitlist provider adapters"
```

### Task 9: Implement the Waitlist Application Service

**Files:**

- Create: `src/domain/waitlist/service.ts`
- Create: `src/domain/waitlist/service.test.ts`
- Create: `src/lib/waitlist/runtime.ts`

**Interfaces:**

- Produces: `requestWaitlist`, `confirmWaitlist`, `removeWaitlist`, and
  `getProductionWaitlistService()`.

- [ ] **Step 1: Write state-machine tests**

Cover new, cooldown, confirmed, resend-after-cooldown, Turnstile reject/outage, database outage,
Resend timeout retry, Resend failure, confirmation repeat/expiry, management signature failure,
removal repeat, concurrent request, fixed Clock, and public non-enumeration.

```ts
expect(await service.request(validInput)).toEqual({ kind: "accepted" });
expect(await service.request(alreadyConfirmedInput)).toEqual({ kind: "accepted" });
expect(mailer.send).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run src/domain/waitlist/service.test.ts`

Expected: FAIL because service functions are missing.

- [ ] **Step 3: Implement request ordering**

Validate email → verify Turnstile → create candidate delivery UUID → derive/hash the candidate
token → call request RPC → for `send`, derive the raw token from the effective idempotency key
returned by the RPC → send → mark sent. An unsent retry returns its previously stored key; a
post-cooldown request rotates to the supplied candidate key. Retry one ambiguous Resend timeout with
the same token/body/key. Construct the mail URL as
`${appUrl}/waitlist/confirm#token=${encodeURIComponent(token)}`. Map all new/pending/confirmed
success states to `{kind:"accepted"}`.

- [ ] **Step 4: Implement confirmation and removal**

Hash confirmation input before repository lookup. Verify management HMAC before calling removal
RPC. Never distinguish absent/removed records publicly. Runtime wiring instantiates real adapters
only after `getWaitlistEnvironment()` succeeds.

- [ ] **Step 5: Verify**

Run: `pnpm exec vitest run src/domain/waitlist src/lib/waitlist && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/waitlist/service* src/lib/waitlist/runtime.ts
git commit -m "feat: orchestrate double-opt-in waitlist"
```

### Task 10: Add Thin, Non-Enumerating HTTP Routes

**Files:**

- Create: `src/app/api/waitlist/request/{route.ts,route.test.ts}`
- Create: `src/app/api/waitlist/confirm/{route.ts,route.test.ts}`
- Create: `src/app/api/waitlist/remove/{route.ts,route.test.ts}`

**Interfaces:**

- Consumes: Task 9 service.
- Produces: three POST-only JSON endpoints.

- [ ] **Step 1: Write route tests**

Require production environment, `application/json`, body at most 4 KiB, Zod-validated exact keys,
UUID request ID, email at most 254 characters, token at most 1024 characters, `Cache-Control:
no-store`, `X-Content-Type-Options:nosniff`, and `405` with `Allow: POST` for other methods.

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run src/app/api/waitlist`

Expected: FAIL because routes are absent.

- [ ] **Step 3: Implement shared request parsing and handlers**

Return `200 {kind:"accepted"}` for every non-enumerating request success, `400` for invalid shape,
`403` for Turnstile rejection, `503` for temporary provider failure, and `404` outside production.
Map `confirmed` and `already_confirmed` to the same `{kind:"confirmed"}` response; map `removed` and
`already_removed` to the same `{kind:"removed"}` response. Catch known internal errors; let
programming errors reach the error boundary without serializing details.

- [ ] **Step 4: Verify routes and secret absence**

Run:

```bash
pnpm exec vitest run src/app/api/waitlist
pnpm build
rg -n "SUPABASE_SECRET_KEY|RESEND_API_KEY|WAITLIST_TOKEN_SECRET|TURNSTILE_SECRET_KEY" \
  .next/static && exit 1 || true
```

Expected: tests/build pass and client static output contains no secret names or values.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/waitlist
git commit -m "feat: expose protected waitlist endpoints"
```

### Task 11: Build the Waitlist Presentation Components

**Files:**

- Create: `src/features/waitlist/coming-soon-landing.tsx`
- Create: `src/features/waitlist/coming-soon-landing.test.tsx`
- Create: `src/features/waitlist/waitlist-form.tsx`
- Create: `src/features/waitlist/waitlist-form.test.tsx`
- Create: `src/features/waitlist/turnstile-widget.tsx`
- Create: `src/features/waitlist/turnstile-widget.test.tsx`
- Create: `src/features/waitlist/confirmation-panel.tsx`
- Create: `src/features/waitlist/confirmation-panel.test.tsx`
- Create: `src/features/waitlist/removal-panel.tsx`
- Create: `src/features/waitlist/removal-panel.test.tsx`

**Interfaces:**

- Consumes: Task 10 HTTP response shapes.
- Produces: `ComingSoonLanding`, `WaitlistForm`, `ConfirmationPanel`, and `RemovalPanel`.

- [ ] **Step 1: Write accessible component tests**

Assert the exact approved copy, one H1, persistent email label, `autocomplete=email`,
`inputMode=email`, 44px mobile controls, stable polite live region, alert-only failures, pending
disablement, Turnstile reset, fragment token reading, explicit confirmation/removal button, and no
mutation on page load.

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run src/features/waitlist`

Expected: FAIL because components are absent.

- [ ] **Step 3: Build the production landing**

Implement the approved thin brand row, `Work in progress`, vertically centered left-aligned content,
exact eyebrow/headline/body/form/consent copy, and Privacy/Terms footer. Use no card around the hero,
no background decoration, and no fake links. Stack form controls below the `sm` breakpoint.

- [ ] **Step 4: Add Managed Turnstile**

Load only `https://challenges.cloudflare.com/turnstile/v0/api.js` on the production form. Render
explicitly with `{theme:"light", appearance:"interaction-only", execution:"execute",
action:"waitlist_request"}`. Execute on submit; reset on expiry/error. Keep text feedback primary.

- [ ] **Step 5: Implement fragment-driven confirmation/removal**

Read `location.hash` after hydration, keep it out of server requests/referrers, and POST only after
the explicit button. Clear the fragment with `history.replaceState` after copying it into component
state. Show the exact approved success/error copy.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm exec vitest run src/features/waitlist
pnpm lint
pnpm typecheck
```

Expected: PASS with no serious vitest-axe violation.

- [ ] **Step 7: Commit**

```bash
git add src/features/waitlist
git commit -m "feat: build waitlist presentation components"
```

### Task 12: Isolate Production Routing and Assemble the Public Pages

**Files:**

- Create: `src/app/metadata.ts`
- Modify: `src/app/layout.tsx`, `src/app/layout.test.tsx`
- Modify: `src/app/(product)/layout.tsx`, `src/app/(product)/layout.test.tsx`
- Modify: `src/app/(product)/page.tsx`, `src/app/(product)/page.test.tsx`
- Create: `src/app/(product)/privacy/page.tsx`
- Create: `src/app/(product)/privacy/page.test.tsx`
- Create: `src/app/(product)/terms/page.tsx`
- Create: `src/app/(product)/terms/page.test.tsx`
- Create: `src/app/(product)/waitlist/confirm/page.tsx`
- Create: `src/app/(product)/waitlist/remove/page.tsx`
- Create: `src/components/product/product-preview.tsx`
- Create: `src/components/product/product-preview.test.tsx`
- Modify: `src/app/manifest.ts`, `src/app/manifest.test.ts`
- Modify: `tests/e2e/helpers.ts`, `tests/e2e/production-guard.spec.ts`

**Interfaces:**

- Consumes: Task 11 presentation components.
- Produces: server-owned environment selection, `ProductPreview`, legal routes, and complete
  production pages.

- [ ] **Step 1: Write production/non-production routing tests**

Mock `getServerEnvironment()` and assert production renders children without
`ProductApplicationShell`; preview/staging/local/test render the shell. Assert `/` selects
`ComingSoonLanding` only in production. Assert environment-aware metadata, pure-white manifest, and
production-only confirmation/removal availability.

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run src/app/layout.test.tsx "src/app/(product)"`

Expected: FAIL because production still receives the shell and old preview copy.

- [ ] **Step 3: Extract the preview and choose before rendering**

Move the existing preview into `ProductPreview`, update its copy to the approved voice, and keep it
non-interactive. In the route-group layout, return production children directly before constructing
shell JSX. Assemble production `/` with `ComingSoonLanding`. Keep `/design-system` outside the group
and preserve its dynamic exact-404 guard.

- [ ] **Step 4: Implement environment metadata**

Production description is
`Start with the messy version. Keep the decisions together and know what to ask for next.`
Non-production description states that it is a product preview. Set canonical production URL only
on production. Add `noindex` metadata to confirmation, removal, error, and internal surfaces.

- [ ] **Step 5: Assemble confirmation and removal routes**

Render Task 11 panels only in production; return `notFound()` elsewhere. Do not read tokens in a
Server Component or query string.

- [ ] **Step 6: Implement first-party legal pages**

Privacy must name email purpose, Supabase, Resend, Turnstile, no tracking, 30-day pending retention,
confirmed retention/removal, and `privacy@unseenprompt.com`. Terms must state that the preview is
unfinished, joining is not an account, availability is not promised, and misuse is prohibited.
The owner must approve both factual pages before the release gate can be enabled; the implementing
agent must not invent additional legal clauses.

- [ ] **Step 7: Verify production shell exclusion**

Run:

```bash
pnpm exec vitest run src/app src/components/product/product-preview.test.tsx
pnpm test:e2e:production
```

Expected: production `/` has no shell/sidebar/mobile header; `/design-system` is exactly 404;
non-production tests still find the product preview.

- [ ] **Step 8: Commit**

```bash
git add src/app src/components/product/product-preview* tests/e2e/helpers.ts \
  tests/e2e/production-guard.spec.ts
git commit -m "feat: isolate and assemble production presentation"
```

### Task 13: Add Browser, Visual, and Copy Regression Gates

**Files:**

- Create: `tests/e2e/production-coming-soon.spec.ts`
- Modify: `tests/e2e/{helpers,accessibility,visual,production-guard}.spec.ts`
- Regenerate: Darwin and Linux visual snapshots
- Modify: `playwright.config.ts`
- Modify: `scripts/phase-2-ci-workflow.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces: production landing, interaction, accessibility, copy, and visual CI gates.

- [ ] **Step 1: Add failing browser assertions**

Use `page.route()` for deterministic waitlist API responses; never call live providers. Test exact
copy, no shell flash, invalid email, accepted submission, Turnstile failure, provider failure,
confirmation/removal explicit action, keyboard order, 200% zoom, reduced motion, forced colors,
mobile stacking, and exact production design-system 404.

- [ ] **Step 2: Observe browser failures**

Run: `pnpm test:e2e:production`

Expected: new tests fail until all production selectors and test env values are wired.

- [ ] **Step 3: Supply safe production-test environment**

Add structurally valid fake waitlist values to Playwright's build/start prefix. They must use
`.invalid` URLs/domains and official Turnstile test keys. Tests intercept POSTs, so fake Supabase and
Resend endpoints receive no network call.

- [ ] **Step 4: Rebuild visual baselines**

Capture pure-white production landing at `390×844` and `1440×900`, confirmation/removal, updated
gallery wide/mobile, dialog, and sheet. Linux snapshots are generated only in CI's approved
baseline workflow; Darwin snapshots are generated locally. Reject pink pixels with the neutral-pixel
test instead of a broad screenshot tolerance.

- [ ] **Step 5: Add CI copy and production suites**

Run `pnpm test:copy` after unit tests and before browser tests. Keep read-only permissions and
failure-only artifact upload.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm test:copy
pnpm test:e2e
pnpm test:e2e:maintenance
pnpm test:e2e:production
pnpm exec vitest run scripts/phase-2-ci-workflow.test.ts
```

Expected: PASS on the local platform; no loading skeleton, error boundary, or `nextjs-portal` is
captured.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e playwright.config.ts .github/workflows/ci.yml \
  scripts/phase-2-ci-workflow.test.ts
git commit -m "test: gate production coming-soon experience"
```

### Task 14: Configure Cloudflare Secrets, CSP, Rate Limiting, and Release Promotion

**Files:**

- Modify: `wrangler.jsonc`
- Modify: `custom-worker.ts`
- Modify: `next.config.ts`
- Regenerate: `worker-configuration.d.ts`
- Modify: `public/_headers`
- Modify: `.github/workflows/deploy-release.yml`
- Create: `scripts/production-release-workflow.test.ts`
- Modify: `scripts/sequential-release-workflow.test.ts`
- Modify: `scripts/assert-cloudflare-deployment.mjs`
- Create: `scripts/create-waitlist-removal-link.ts`
- Create: `scripts/create-waitlist-removal-link.test.ts`
- Modify: `docs/development/environment-contract.md`
- Modify: `docs/deployment/cloudflare-runbook.md`

**Interfaces:**

- Produces: immutable non-mutating candidate upload and protected exact-SHA production promotion.

- [ ] **Step 1: Write failing workflow/config tests**

Assert staging has no waitlist secrets, production declares all server bindings, CSP admits the
Turnstile script/frame/connect origins and denies framing elsewhere, rate limit is five request
attempts per source per 60 seconds, manual dispatch requires an exact 40-character main SHA, and
production still requires `PRODUCTION_DEPLOY_ENABLED == "true"`.

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run scripts/production-release-workflow.test.ts
scripts/sequential-release-workflow.test.ts`

Expected: FAIL because manual candidate/promotion behavior is absent.

- [ ] **Step 3: Configure environment boundaries**

Declare production-only required secrets `TURNSTILE_SECRET_KEY`, `SUPABASE_SECRET_KEY`,
`RESEND_API_KEY`, and `WAITLIST_TOKEN_SECRET`; production variables
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `SUPABASE_URL`, and `WAITLIST_FROM_EMAIL`. Do not add them to
preview/staging. Add production rate-limit binding `WAITLIST_RATE_LIMITER`, namespace
`"20260729"`, limit `5`, period `60`. In `custom-worker.ts`, call the binding only for production
`POST /api/waitlist/request`, key it with `request.headers.get("CF-Connecting-IP")`, return a
no-store `503` if that production header is absent, return a no-store `429` without forwarding when
exhausted, and never log or persist the value. The binding is intentionally best-effort and per
Cloudflare location; Turnstile remains the primary abuse control. In `next.config.ts`, add the
production-only CSP:

```text
default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';
connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com;
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Regenerate types with:

```bash
pnpm cf:types
pnpm cf:types:check
```

- [ ] **Step 4: Add immutable candidate mode**

Add `workflow_dispatch` inputs `release_sha` and `operation` (`candidate` or `promote`). Validate the
SHA is on `origin/main`. Candidate builds/uploads a tagged version, resolves the current production
version, and creates a deployment with the current version at 100% and candidate at 0%. Smoke the
production hostname with
`Cloudflare-Workers-Version-Overrides:
unseenprompt-production="${CANDIDATE_VERSION_ID}"`. Verify
the returned version metadata matches before checking GET routes, headers, rejected methods,
release SHA, and exact `/design-system` 404; never submit the form.

- [ ] **Step 5: Add protected promotion**

Promotion requires the repository variable, production environment approval, verified domain,
green staging for the exact SHA, stored candidate version ID, dry run, explicit `versions deploy
${CANDIDATE_VERSION_ID}@100`, and production smoke. The runbook requires the operator to set the
gate back to `false` immediately and verify the read-back.

- [ ] **Step 6: Document provider gates**

Record exact secret owners, Turnstile allowed hostnames, Resend verified domain and disabled
tracking, Supabase migration/Cron verification, synthetic smoke address creation-confirmation-
removal, rollback version command, log redaction, and credential rotation.

Add an owner-only local
`pnpm exec tsx scripts/create-waitlist-removal-link.ts ENTRY_UUID MANAGEMENT_VERSION` command. It
validates UUID/integer arguments, reads the token secret from the process environment, calls Task
5's `signManagement`, prints one fragment URL, and writes no file. Its test uses a fake secret. The
runbook forbids running it in CI or pasting its output into logs.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm exec vitest run scripts
pnpm cf:types:check
pnpm check:workers-deps
pnpm cf:dry-run:preview
pnpm cf:dry-run:staging
pnpm cf:dry-run:production
```

Expected: PASS; dry runs do not deploy or mutate production.

- [ ] **Step 8: Commit**

```bash
git add wrangler.jsonc custom-worker.ts next.config.ts worker-configuration.d.ts public/_headers \
  .github/workflows scripts docs/development/environment-contract.md \
  docs/deployment/cloudflare-runbook.md
git commit -m "ci: add controlled coming-soon production release"
```

### Task 15: Perform the Full Release Audit

**Files:**

- Modify only files required to fix a demonstrated failure from the commands below.

**Interfaces:**

- Produces: merge-ready branch and evidence for candidate review.

- [ ] **Step 1: Run static and unit gates**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:copy
pnpm test:unit
```

Expected: every command exits `0`.

- [ ] **Step 2: Run database gates from clean state**

```bash
pnpm exec supabase db start
pnpm exec supabase db reset
pnpm test:db
pnpm exec supabase stop --no-backup
```

Expected: fresh migration and all pgTAP tests pass.

- [ ] **Step 3: Run all production browser gates**

```bash
pnpm test:e2e
pnpm test:e2e:maintenance
pnpm test:e2e:production
```

Expected: all projects pass, exact production 404 is observed, and visual baselines contain real
content.

- [ ] **Step 4: Run build and Worker gates**

```bash
pnpm build
pnpm cf:types:check
pnpm check:workers-deps
pnpm cf:build
pnpm test:cf-preview
pnpm cf:dry-run:preview
pnpm cf:dry-run:staging
pnpm cf:dry-run:production
```

Expected: all pass without a deployment.

- [ ] **Step 5: Run repository security scans**

```bash
git diff --check main...HEAD
git grep -nE '(SUPABASE_SECRET_KEY|RESEND_API_KEY|WAITLIST_TOKEN_SECRET|TURNSTILE_SECRET_KEY)=' \
  -- ':!*.example' ':!docs/superpowers/plans/**' ':!docs/superpowers/specs/**' && exit 1 || true
rg -n "#(?:FEFAF8|A64763|8D3852|762C43|FAF4F5|E9DFE1)|Powder Pink|Warm Editorial" \
  src public assets docs/development README.md && exit 1 || true
git status --short
```

Expected: no committed secret assignment, no active pink identity, no whitespace error, and no
unintended untracked file.

- [ ] **Step 6: Run React Doctor and request review**

Use the `react-doctor` skill, fix only verified in-scope findings, rerun affected gates, then use
`superpowers:requesting-code-review`. Do not upload or promote while review findings remain.

## Merge and Release Handoff

1. Open a ready PR from `codex/production-coming-soon`; do not merge before all required checks and
   review threads are green.
2. Keep `PRODUCTION_DEPLOY_ENABLED=false`.
3. Run the protected `candidate` workflow for the exact proposed main SHA and review the
   version-overridden 0%-traffic candidate screenshots/GET smoke.
4. Merge only the reviewed SHA.
5. Confirm staging deployed the merged SHA and still shows `ProductPreview`.
6. Set the production gate to `true`, run protected `promote` for the exact main SHA, and perform one
   controlled synthetic request → email → explicit confirm → explicit remove flow.
7. Set the production gate back to `false` immediately and verify read-back.
8. If smoke fails, redeploy the last known-good Worker version; do not reverse the additive
   database migration or delete waitlist rows.

## Definition of Done

- Production serves only the approved white-canvas coming-soon and legal/waitlist surfaces.
- Staging, preview, local, and test retain the Phase 2 product shell.
- Production `/design-system` is an exact 404 without streamed shell/gallery content.
- Active runtime, docs, metadata, manifest, emails, and generated cards follow the copy policy.
- Active tokens/assets contain no pink identity or decorative backgrounds.
- Real production request, double opt-in, repeat safety, expiry, cleanup, and removal work.
- No secret or waitlist email appears in a client bundle, response, log, test artifact, or commit.
- Accessibility, database, browser, build, Worker, CI, and release-workflow gates all pass.
- The promoted release reports the merged SHA, and production promotion is disabled again.
