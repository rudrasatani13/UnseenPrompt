# Phase 2 — Design System and Application Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Warm Editorial design system, reusable accessible UI and product
components, responsive application shell, honest public product preview, guarded internal gallery,
application state boundaries, and browser-level accessibility verification for UnseenPrompt.

**Architecture:** Keep one Next.js App Router application and the existing layer boundaries. Own
shadcn/Radix-derived generic primitives under `src/components/ui`, compose them into stateless
product presentation components under `src/components/product`, and keep navigation/frame behavior
under `src/components/shell`. A server-rendered `(product)` route group owns the shell and
maintenance presentation; health routes and the production-guarded design-system gallery remain
outside it. Manrope and every visual asset are local at runtime, while Motion and Animate UI are
limited to reduced-motion-aware icon feedback.

**Tech Stack:** Node.js 24, pnpm 11.17.0, Next.js 16.2.12 App Router, React 19.2.8, TypeScript 6.0.3,
Tailwind CSS 4.3.3, shadcn CLI 4.16.0 with Radix UI 1.6.7, Motion 12.42.2, Animate UI icon registry,
Lucide React 1.27.0, Vitest 4.1.10, Testing Library, vitest-axe, Playwright 1.62.0, and Cloudflare
Workers through OpenNext 1.20.2.

## Global Constraints

- Treat
  `docs/superpowers/specs/2026-07-28-phase-2-design-system-and-application-shell-design.md` as the
  approved source of truth. A visual or behavioral deviation requires explicit user approval.
- Prompt Cowboy is an interaction and layout reference only. Do not copy its code, copywriting,
  logo, imagery, Aeonik font, branded decoration, or exact visual implementation.
- Preserve the current UnseenPrompt logo. The current Open Graph and Twitter images are purposeful
  metadata files even though their bytes match.
- Use Tailwind CSS v4, local shadcn/Radix source, and only the curated Animate UI icon registry
  entries named in Task 6. Do not add a second component system.
- Do not add dark mode, authentication, persistence, billing, analytics, file uploads, AI calls, or
  product telemetry in Phase 2.
- The homepage preview accepts no input and performs no form submission, storage, logging,
  analytics, or network mutation.
- Components receive typed data and callbacks. They do not own workflows, authorization, state
  persistence, or server actions.
- Keep `src/components/**` free of imports from `src/app/**` and `src/features/**`. Generic UI
  components must not import product components.
- Map shadcn utilities to `@/components/ui/utils`; do not create `src/lib/utils.ts`.
- Keep fonts, icons, registry source, scripts, and imagery local at runtime. No external font,
  script, registry, or image request is permitted in the built application.
- Treat registry content as untrusted supply-chain input. Review it before adding it, commit the
  resulting local source, and reject network calls, remote assets, `dangerouslySetInnerHTML`,
  dynamic evaluation, or installation scripts.
- Target WCAG 2.2 AA, plus the approved two-pixel focus indicator with two-pixel offset and a
  minimum 3:1 adjacent-color change.
- Use text or iconography with color for every state. Motion must never be the only state signal.
- Every destructive acknowledgement remains an explicit user action. Components cannot infer
  authorization.
- Preserve unrelated user work. Do not stage or commit files outside the active task's stated file
  list.
- Use test-driven development: create the stated failing test, observe the expected failure, make
  the smallest complete implementation, observe the passing result, then commit.
- Use pinned dependency versions. Do not replace the existing framework, pnpm, OpenNext, Wrangler,
  or testing versions.

---

## Execution Contract

### Preconditions and worktree safety

- [ ] Run from `/Users/rudrasatani/Desktop/UnseenPrompt`.
- [ ] Read the active agent instructions supplied by the execution environment, `CONTRIBUTING.md`,
      `docs/UnseenPrompt – DEVELOPMENT_PLAN.md`, `docs/UnseenPrompt – Stateful Project Copilot.md`,
      `docs/superpowers/specs/2026-07-28-phase-2-design-system-and-application-shell-design.md`, and
      this plan in full.
- [ ] Confirm Node.js `v24.x`, pnpm `11.17.0`, and branch name
      `codex/phase-2-design-system-plan` or another `codex/phase-2-*` branch.
- [ ] Inspect `git status --short --branch` and `git diff --stat` before changing files.
- [ ] Do not create an isolated worktree before Task 1. The supplied brand files are currently
      untracked in the working directory and would be absent from a worktree created from the
      current commit.
- [ ] Treat these current changes as user-owned input to Task 1:
      `assets/brand/logo-source.png`, `public/brand/**`, `src/app/favicon.ico`,
      `src/app/icon.png`, `src/app/apple-icon.png`, `src/app/opengraph-image.png`,
      `src/app/twitter-image.png`, `src/app/manifest.ts`, and the `/brand/*` rule in
      `public/_headers`.
- [ ] Do not stage `.superpowers/**`. It contains local visual-companion state and must remain
      ignored.
- [ ] If another process changes a planned file during execution, stop that task, inspect the
      overlap, and preserve the user's version before continuing.

Run the preflight:

```bash
git status --short --branch
git branch --show-current
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
```

Expected: the documented brand files and `.superpowers/` may be untracked, Node is `v24.x`, pnpm is
`11.17.0`, dependency installation succeeds, and the pre-Phase-2 baseline passes.

### Locked responsive contract

| Boundary                   | Value               | Required behavior                                           |
| -------------------------- | ------------------- | ----------------------------------------------------------- |
| Desktop shell              | `min-width: 1024px` | fixed 232px sidebar and centered workspace                  |
| Mobile/tablet shell        | below `1024px`      | 56px header and modal navigation Sheet                      |
| Main workspace             | `max-width: 960px`  | centered with responsive gutters                            |
| Prompt composer/panel      | `max-width: 800px`  | centered in the workspace                                   |
| Mobile navigation Sheet    | `min(88vw, 320px)`  | focus trap, Escape close, explicit close, focus restoration |
| Required browser viewports | listed in Task 14   | no horizontal overflow or clipped focus                     |
| Desktop target size        | at least 40px       | controls and navigation                                     |
| Mobile target size         | at least 44px       | controls and navigation                                     |

### Locked semantic tokens

| Token                    | Value     |
| ------------------------ | --------- |
| `--canvas`               | `#FEFAF8` |
| `--surface`              | `#FFFFFF` |
| `--surface-muted`        | `#FAF4F5` |
| `--text-primary`         | `#2B2426` |
| `--text-secondary`       | `#6F6266` |
| `--brand-primary`        | `#A64763` |
| `--brand-primary-hover`  | `#8D3852` |
| `--brand-primary-active` | `#762C43` |
| `--border-control`       | `#8F8185` |
| `--border-subtle`        | `#E9DFE1` |
| `--success-foreground`   | `#17623A` |
| `--success-background`   | `#E7F6ED` |
| `--warning-foreground`   | `#7A4A00` |
| `--warning-background`   | `#FFF4D6` |
| `--danger-foreground`    | `#8F2037` |
| `--danger-background`    | `#FDECEF` |
| `--info-foreground`      | `#1F4E79` |
| `--info-background`      | `#EAF3FA` |

Use spacing `4, 8, 12, 16, 24, 32, 40, 48, 64, 96px`; radii `4, 8, 12, 16px` and pill; type sizes
`12, 14, 16, 18, 24, 32, 44px`; micro-interactions `120–160ms`; and overlays `180–220ms`.

### Definition of done

Phase 2 is complete only when all of the following are true:

1. Every approved core and product component appears in `/design-system` with normal, disabled,
   loading, error, long-text, and reduced-motion coverage where the state applies.
2. `/design-system` emits `noindex, nofollow`, renders in local/preview/staging/test, and resolves to
   not-found in production.
3. `/` is a polished, non-functional preview with no editable element or submit action.
4. Desktop and mobile application shells match the locked responsive contract.
5. Keyboard-only operation covers navigation Sheet, dialogs, tabs, radio groups, copy feedback,
   retry actions, and focus restoration.
6. Automated axe checks have no serious or critical violations; deterministic token contrast
   tests pass every approved pair.
7. Reduced-motion behavior retains equivalent non-motion feedback.
8. All required viewports have no horizontal page overflow or obscured critical control.
9. Manifest, icon metadata, social cards, and cache headers resolve to the committed local assets.
10. All commands in Task 16 exit with status `0` and their output is observed.

---

## Planned File Map

```text
.
├── .github/workflows/ci.yml
├── .gitignore
├── components.json
├── docs/development/design-system.md
├── docs/superpowers/plans/2026-07-28-phase-2-design-system-and-application-shell.md
├── package.json
├── playwright.config.ts
├── postcss.config.mjs
├── public/brand/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
├── scripts/
│   ├── generate-social-card.mjs
│   ├── phase-2-assets.test.ts
│   └── phase-2-ci-workflow.test.ts
├── src/
│   ├── app/
│   │   ├── (product)/
│   │   │   ├── layout.test.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── page.test.tsx
│   │   │   └── page.tsx
│   │   ├── design-system/
│   │   │   ├── gallery-client.tsx
│   │   │   ├── gallery-data.ts
│   │   │   ├── page.test.tsx
│   │   │   └── page.tsx
│   │   ├── error.test.tsx
│   │   ├── error.tsx
│   │   ├── global-error.tsx
│   │   ├── layout.test.tsx
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   ├── manifest.test.ts
│   │   ├── manifest.ts
│   │   ├── not-found.tsx
│   │   ├── opengraph-image.png
│   │   └── twitter-image.png
│   ├── components/
│   │   ├── brand/
│   │   │   ├── brand-lockup.test.tsx
│   │   │   └── brand-lockup.tsx
│   │   ├── product/
│   │   │   ├── confirmation-card.test.tsx
│   │   │   ├── confirmation-card.tsx
│   │   │   ├── empty-state.test.tsx
│   │   │   ├── empty-state.tsx
│   │   │   ├── evidence-label.test.tsx
│   │   │   ├── evidence-label.tsx
│   │   │   ├── file-item.test.tsx
│   │   │   ├── file-item.tsx
│   │   │   ├── lifecycle-steps.test.tsx
│   │   │   ├── lifecycle-steps.tsx
│   │   │   ├── prompt-panel.test.tsx
│   │   │   ├── prompt-panel.tsx
│   │   │   ├── question-choice.test.tsx
│   │   │   ├── question-choice.tsx
│   │   │   ├── risk-warning.test.tsx
│   │   │   ├── risk-warning.tsx
│   │   │   ├── tool-selector.test.tsx
│   │   │   ├── tool-selector.tsx
│   │   │   ├── usage-meter.test.tsx
│   │   │   └── usage-meter.tsx
│   │   ├── providers/
│   │   │   ├── app-providers.test.tsx
│   │   │   └── app-providers.tsx
│   │   ├── shell/
│   │   │   ├── application-shell.test.tsx
│   │   │   ├── application-shell.tsx
│   │   │   ├── maintenance-notice.test.tsx
│   │   │   ├── maintenance-notice.tsx
│   │   │   ├── navigation.ts
│   │   │   ├── shell-navigation.test.tsx
│   │   │   └── shell-navigation.tsx
│   │   └── ui/
│   │       ├── icons/
│   │       │   ├── README.md
│   │       │   ├── animated-icons.test.tsx
│   │       │   └── curated Animate UI icon source
│   │       ├── form-field.test.tsx
│   │       ├── form-field.tsx
│   │       ├── primitives.test.tsx
│   │       ├── theme.css
│   │       ├── theme.test.ts
│   │       ├── generated shadcn primitive source
│   │       └── utils.ts
│   └── config/env/
│       ├── schema.test.ts
│       ├── schema.ts
│       └── server.ts
├── tests/e2e/
│   ├── accessibility.spec.ts
│   ├── application-shell.spec.ts
│   ├── design-system.spec.ts
│   ├── homepage.spec.ts
│   ├── maintenance.spec.ts
│   ├── production-guard.spec.ts
│   └── visual.spec.ts
└── vitest.setup.ts
```

The actual shadcn source file names are determined by the reviewed registry output, but they must
stay inside `src/components/ui`. Do not accept registry output in `src/lib`, `src/hooks`, or a
second component root.

---

## Public Component Contracts

Create and export the following exact contracts from their owning component files:

```ts
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface BrandLockupProps {
  readonly variant: "compact" | "full";
  readonly priority?: boolean;
}

export interface FormFieldControlProps {
  readonly id: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
}

export interface FormFieldProps {
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly currentLength?: number;
  readonly maxLength?: number;
  readonly children: (controlProps: FormFieldControlProps) => ReactNode;
}

export type LifecycleStepState = "complete" | "current" | "pending" | "blocked";

export interface LifecycleStep {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
  readonly state: LifecycleStepState;
}

export interface LifecycleStepsProps {
  readonly steps: readonly LifecycleStep[];
  readonly label: string;
}

export type EvidenceState = "claimed" | "evidence-supplied" | "user-confirmed" | "verified";

export interface EvidenceLabelProps {
  readonly state: EvidenceState;
  readonly className?: string;
}

export interface UsageMeterProps {
  readonly label: string;
  readonly used: number;
  readonly limit: number;
  readonly unit: string;
}

export interface RiskConfirmation {
  readonly triggerLabel: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
}

export interface RiskWarningProps {
  readonly level: "warning" | "danger";
  readonly title: string;
  readonly description: string;
  readonly confirmation: RiskConfirmation | null;
}

export interface ConfirmationCardProps {
  readonly title: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly confirmLabel: string;
  readonly rejectLabel: string;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onReject: () => void;
}

export interface ChoiceOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly description: string | null;
  readonly disabled: boolean;
}

export interface QuestionChoiceProps<TValue extends string> {
  readonly name: string;
  readonly legend: string;
  readonly value: TValue;
  readonly options: readonly ChoiceOption<TValue>[];
  readonly onValueChange: (value: TValue) => void;
}

export type CodingTool = "claude-code" | "codex" | "cursor";

export interface ToolSelectorProps {
  readonly value: CodingTool;
  readonly onValueChange: (value: CodingTool) => void;
}

export interface PromptPanelProps {
  readonly prompt: string;
  readonly metadata: string | null;
  readonly expectedResult: string;
  readonly acceptanceCriteria: readonly string[];
  readonly copyText?: (text: string) => Promise<void>;
}

export type FileItemStatus = "ready" | "uploading" | "processing" | "error" | "complete";

export interface FileItemProps {
  readonly name: string;
  readonly fileType: string;
  readonly sizeBytes: number;
  readonly status: FileItemStatus;
  readonly errorMessage: string | null;
  readonly onRetry: (() => void) | null;
  readonly onRemove: (() => void) | null;
}

export interface EmptyStateProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action: ReactNode | null;
}

export type ShellNavigationItem =
  | {
      readonly id: string;
      readonly label: string;
      readonly icon: LucideIcon;
      readonly availability: "available";
      readonly href: string;
      readonly active: boolean;
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly icon: LucideIcon;
      readonly availability: "soon";
      readonly href: null;
      readonly active: false;
    };

export interface ApplicationShellProps {
  readonly navigation: readonly ShellNavigationItem[];
  readonly children: ReactNode;
}
```

Behavioral invariants:

- `UsageMeter` rejects non-finite values, `limit <= 0`, `used < 0`, and `used > limit` with an
  actionable `RangeError`; it never silently clamps invalid domain data.
- `QuestionChoice` rejects an empty option set and duplicate option values during development/test.
- `FileItem` renders retry only for `error` with an `onRetry` callback and removal only when
  `onRemove` exists. It does not create file input or upload logic.
- `PromptPanel` defaults to `navigator.clipboard.writeText` only in the isolated client component.
  A rejected copy promise keeps the prompt selectable and renders
  `Copy failed. Select the prompt text and copy it manually.` inline.
- `ShellNavigationItem` makes unavailable entries impossible to express as links.
- `RiskWarning` composes `AlertDialog` when `confirmation` is non-null; rendering the warning alone
  never calls `onConfirm`.

---

### Task 1: Adopt the Supplied Brand Assets and Clean Repository Metadata

**Files:**

- Modify: `.gitignore`
- Modify: `public/_headers`
- Create: `assets/brand/logo-source.png` from supplied user file
- Create: `public/brand/icon-192.png` from supplied user file
- Create: `public/brand/icon-512.png` from supplied user file
- Create: `public/brand/icon-maskable-512.png` from supplied user file
- Create: `src/app/favicon.ico` from supplied user file
- Create: `src/app/icon.png` from supplied user file
- Create: `src/app/apple-icon.png` from supplied user file
- Create: `src/app/opengraph-image.png` from supplied user file
- Create: `src/app/twitter-image.png` from supplied user file
- Create: `src/app/manifest.ts` from supplied user file
- Create: `scripts/phase-2-assets.test.ts`
- Create: `src/app/manifest.test.ts`
- Delete: the five exact ignored `.DS_Store` files listed below, if present

**Supply-state invariant:** This task must run in the current working directory. Do not recreate,
resize, or optimize the supplied logo files before their baseline hashes and dimensions are
recorded.

- [ ] **Step 1: Inventory user-owned files without changing them**

Run:

```bash
git status --short --branch
find assets/brand public/brand src/app -maxdepth 2 -type f \( -name '*.png' -o -name '*.ico' -o -name 'manifest.ts' \) -print | sort
shasum -a 256 assets/brand/logo-source.png public/brand/*.png src/app/favicon.ico src/app/icon.png src/app/apple-icon.png src/app/opengraph-image.png src/app/twitter-image.png
file assets/brand/logo-source.png public/brand/*.png src/app/favicon.ico src/app/icon.png src/app/apple-icon.png src/app/opengraph-image.png src/app/twitter-image.png
git diff -- public/_headers
```

Expected: source logo is 1254×1254, public icon sizes match their names, maskable icon exists,
Open Graph and Twitter cards are 1200×630 and byte-identical, and `_headers` contains only the
expected `/brand/*` cache rule in addition to the existing immutable Next static asset rule.

The supplied baseline is:

| Path                                 | Dimensions | SHA-256                                                            |
| ------------------------------------ | ---------- | ------------------------------------------------------------------ |
| `assets/brand/logo-source.png`       | 1254×1254  | `f95d467e690bc2f923d4714c534b785127f09018defa1df79359941f71fafd11` |
| `public/brand/icon-192.png`          | 192×192    | `312ee7205022594f230144146e030dbd9a85b12445edbe8823ac1374ecdf8d71` |
| `public/brand/icon-512.png`          | 512×512    | `608b6a8defea72e3d8766f99f7015b5fc9be24366d74047b4d13443f9b2e1c9e` |
| `public/brand/icon-maskable-512.png` | 512×512    | `5f1af2c91c507d5fa98bda82573ec4d043fb4f762fb87fc2dc33b9df4559b5c6` |
| `src/app/favicon.ico`                | ICO        | `691cc54459a6998514f0c5f20debc91dc35c8b07905be6c198139591877fb207` |
| `src/app/icon.png`                   | 256×256    | `37f721b65125d5ace1fc0921e3cb62a91ec510592aab9b79e4affece7a952601` |
| `src/app/apple-icon.png`             | 180×180    | `ae0b7d3db84c3c78d94fb3d05c24e142beb7aef68e7c395acfa90b6ec37a1ccd` |
| `src/app/opengraph-image.png`        | 1200×630   | `9eed5e3497aff6f8b3128fa724167be4ad0de1db782031391383a4ddded7680b` |
| `src/app/twitter-image.png`          | 1200×630   | `9eed5e3497aff6f8b3128fa724167be4ad0de1db782031391383a4ddded7680b` |

- [ ] **Step 2: Write failing asset and manifest tests**

Create `scripts/phase-2-assets.test.ts` using `node:fs` and a small PNG IHDR reader that reads width
and height from bytes 16–23. Assert:

- every path listed in this task exists and is non-empty;
- source logo is 1254×1254;
- public icons are respectively 192×192, 512×512, and 512×512;
- `src/app/icon.png` is 256×256 and `src/app/apple-icon.png` is 180×180;
- every baseline SHA-256 in the table above matches before Task 15 intentionally replaces the two
  social-card hashes;
- social cards are both 1200×630 and have the same SHA-256;
- `public/_headers` contains `/brand/*` followed by
  `Cache-Control: public,max-age=86400`;
- `.gitignore` contains both `.DS_Store` and `.superpowers/`.

Create `src/app/manifest.test.ts`, call the exported manifest function, and assert exact names,
description, start URL, standalone display, `#FEFAF8` background/theme colors, and the three public
icon objects with their `any` or `maskable` purposes.

Run:

```bash
pnpm test:unit -- scripts/phase-2-assets.test.ts src/app/manifest.test.ts
```

Expected: failure because `.superpowers/` is not ignored yet. Any additional failure identifies a
supplied asset mismatch; inspect it rather than changing the expected dimensions speculatively.

- [ ] **Step 3: Add repository hygiene and remove only the confirmed metadata files**

Add `.superpowers/` to `.gitignore`, retaining `.DS_Store`. Keep the supplied `_headers` rule
exactly:

```text
/brand/*
  Cache-Control: public,max-age=86400
```

Remove only these files if `test -f` confirms them:

```bash
test ! -f ./.DS_Store || rm ./.DS_Store
test ! -f ./assets/.DS_Store || rm ./assets/.DS_Store
test ! -f ./docs/.DS_Store || rm ./docs/.DS_Store
test ! -f ./docs/superpowers/.DS_Store || rm ./docs/superpowers/.DS_Store
test ! -f ./public/.DS_Store || rm ./public/.DS_Store
find . -name .DS_Store -type f -not -path './node_modules/*' -not -path './.git/*' -print
```

Expected: the final `find` prints nothing. Do not delete any image based only on equal hashes;
Next.js metadata conventions require the separate social-card paths.

- [ ] **Step 4: Verify asset contracts and adopt the files**

Run:

```bash
pnpm test:unit -- scripts/phase-2-assets.test.ts src/app/manifest.test.ts
pnpm format:check
git status --short
git diff --check
```

Expected: asset and manifest tests pass, formatting passes, and the status includes only Task 1
files plus the already committed design documents.

- [ ] **Step 5: Commit the adopted asset baseline**

```bash
git add .gitignore public/_headers assets/brand public/brand src/app/favicon.ico src/app/icon.png src/app/apple-icon.png src/app/opengraph-image.png src/app/twitter-image.png src/app/manifest.ts scripts/phase-2-assets.test.ts src/app/manifest.test.ts
git diff --cached --stat
git commit -m "chore: adopt brand asset set"
```

Expected: `.superpowers/` is absent from the staged diff and the brand baseline is now available to
later worktrees or agents.

---

### Task 2: Add the Validated Maintenance Environment Contract

**Files:**

- Modify: `src/config/env/schema.ts`
- Modify: `src/config/env/schema.test.ts`
- Modify: `src/config/env/server.ts`
- Modify: `.env.example`
- Modify: `.dev.vars.example`
- Modify: `wrangler.jsonc`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy-release.yml`
- Modify: `package.json`

**Interface:**

```ts
MAINTENANCE_MODE: z.enum(["off", "on"]).default("off");
```

`MAINTENANCE_MODE` is non-secret, server-only configuration. Missing values resolve to `"off"`;
any other value fails environment parsing. The product route-group layout is its sole UI consumer.

- [ ] **Step 1: Add failing schema tests**

Extend `src/config/env/schema.test.ts` with exact cases:

1. omitted `MAINTENANCE_MODE` produces `"off"`;
2. `"off"` remains `"off"`;
3. `"on"` produces `"on"`;
4. `"true"`, `"1"`, an empty string, and mixed-case `"ON"` each throw an error containing
   `MAINTENANCE_MODE`.

Update existing successful fixtures only where an explicit maintenance value improves clarity; the
default behavior must remain covered.

Run:

```bash
pnpm test:unit -- src/config/env/schema.test.ts
```

Expected: failure because parsed environments do not yet expose `MAINTENANCE_MODE`.

- [ ] **Step 2: Implement the schema and server adapter**

Add the enum with `.default("off")` to the Zod object in `schema.ts`. Add
`MAINTENANCE_MODE: process.env.MAINTENANCE_MODE` to `getServerEnvironment()`. Do not expose it as a
`NEXT_PUBLIC_*` variable or read it inside a client component.

Run:

```bash
pnpm test:unit -- src/config/env/schema.test.ts
pnpm typecheck
```

Expected: schema tests and typecheck pass.

- [ ] **Step 3: Thread the explicit default through local, CI, and deployment builds**

Add `MAINTENANCE_MODE=off` to both example environment files, the shared CI environment, and the
staging/production jobs. Add `"MAINTENANCE_MODE": "off"` to the top-level and every named
environment `vars` object in `wrangler.jsonc`.

Update every package script that sets `APP_ENV` for an OpenNext build to also set
`MAINTENANCE_MODE=off`. Do not add a secret or GitHub repository variable for this value in Phase 2.

Run:

```bash
pnpm test:unit
pnpm cf:types:check
pnpm check:workers-deps
git diff --check
```

Expected: all existing environment, workflow, and generated-type checks pass. Regenerate
`worker-configuration.d.ts` with `pnpm cf:types` only if `cf:types:check` reports a real config
drift.

- [ ] **Step 4: Commit the maintenance contract**

```bash
git add src/config/env/schema.ts src/config/env/schema.test.ts src/config/env/server.ts .env.example .dev.vars.example wrangler.jsonc .github/workflows/ci.yml .github/workflows/deploy-release.yml package.json worker-configuration.d.ts
git diff --cached --check
git commit -m "feat: validate maintenance mode"
```

Expected: the commit contains configuration only; route behavior is added in Task 11.

---

### Task 3: Install and Configure the Visual-System Foundation

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `postcss.config.mjs`
- Create: `components.json`
- Create: `src/components/ui/utils.ts`
- Create: `src/components/ui/theme.css`
- Create: `src/components/ui/theme.test.ts`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/app/layout.test.tsx`
- Modify: `vitest.setup.ts`

**Dependency contract:**

Runtime:

```text
class-variance-authority@0.7.1
clsx@2.1.1
lucide-react@1.27.0
motion@12.42.2
radix-ui@1.6.7
sonner@2.0.7
tailwind-merge@3.6.0
tw-animate-css@1.4.0
```

Development:

```text
@fontsource-variable/manrope@5.3.0
@playwright/test@1.62.0
@axe-core/playwright@4.12.1
@tailwindcss/postcss@4.3.3
@testing-library/user-event@14.6.1
axe-core@4.12.1
postcss@8.5.24
shadcn@4.16.0
tailwindcss@4.3.3
vitest-axe@0.1.0
```

`@fontsource-variable/manrope` is build tooling for deterministic social-card generation only.
The application itself uses `Manrope` from `next/font/google`, which emits self-hosted build assets.

- [ ] **Step 1: Install the pinned packages**

Run the two commands exactly:

```bash
pnpm add class-variance-authority@0.7.1 clsx@2.1.1 lucide-react@1.27.0 motion@12.42.2 radix-ui@1.6.7 sonner@2.0.7 tailwind-merge@3.6.0 tw-animate-css@1.4.0
pnpm add --save-dev @fontsource-variable/manrope@5.3.0 @playwright/test@1.62.0 @axe-core/playwright@4.12.1 @tailwindcss/postcss@4.3.3 @testing-library/user-event@14.6.1 axe-core@4.12.1 postcss@8.5.24 shadcn@4.16.0 tailwindcss@4.3.3 vitest-axe@0.1.0
```

Run:

```bash
pnpm list --depth 0
pnpm check:workers-deps
```

Expected: exact direct versions are shown and the Workers dependency policy accepts the additions.
If the policy rejects a browser-only package, keep it in `devDependencies` and update the policy
only when the rejection is caused by an incorrectly classified development dependency.

- [ ] **Step 2: Write the failing semantic-token tests**

Create `src/components/ui/theme.test.ts`. Read `theme.css` as UTF-8, extract CSS custom-property
hex values, convert sRGB to relative luminance, and assert:

| Foreground           | Background           | Minimum ratio | Expected measured ratio |
| -------------------- | -------------------- | ------------: | ----------------------: |
| `text-primary`       | `canvas`             |           4.5 |                   14.64 |
| `text-secondary`     | `canvas`             |           4.5 |                    5.60 |
| white                | `brand-primary`      |           4.5 |                    5.67 |
| `brand-primary`      | `canvas`             |           4.5 |                    5.47 |
| `border-control`     | `canvas`             |           3.0 |                    3.59 |
| `success-foreground` | `success-background` |           4.5 |                    6.61 |
| `warning-foreground` | `warning-background` |           4.5 |                    6.83 |
| `danger-foreground`  | `danger-background`  |           4.5 |                    7.58 |
| `info-foreground`    | `info-background`    |           4.5 |                    7.71 |

Also assert every locked token, spacing value, radius, type size, and motion duration appears
exactly once in the source contract.

Create `src/app/layout.test.tsx` that renders `RootLayout`, verifies `lang="en"`, checks the body has
the exported Manrope variable class, and verifies application metadata remains
`UnseenPrompt` / `Stateful Project Copilot for AI-assisted web development.`.
Mock `next/font/google` to return stable test classes and stub the three required environment
values before dynamically importing the layout; do not make the production layout conditional on
Vitest.

Run:

```bash
pnpm test:unit -- src/components/ui/theme.test.ts src/app/layout.test.tsx
```

Expected: failure because `theme.css` and the Manrope configuration do not exist.

- [ ] **Step 3: Configure Tailwind v4 and shadcn aliases**

Create `postcss.config.mjs` with only `@tailwindcss/postcss`.

Create `components.json` with:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "utils": "@/components/ui/utils",
    "lib": "@/components/ui",
    "hooks": "@/components/ui/hooks"
  }
}
```

Create `utils.ts` with a typed `cn(...inputs: ClassValue[]): string` using `clsx` and
`tailwind-merge`.

Do not run `shadcn init`; the reviewed configuration above prevents the CLI from placing helpers in
`src/lib`.

- [ ] **Step 4: Implement the semantic theme and global reset**

In `theme.css`:

- define the locked custom properties on `:root`;
- map semantic properties to Tailwind v4 utilities with `@theme inline`;
- expose the spacing, radius, typography, shadow, and duration scales;
- define the two-pixel focus ring and two-pixel offset;
- define low panel and warm overlay shadows;
- provide `@media (prefers-reduced-motion: reduce)` rules that reduce durations to near-immediate
  feedback and remove transforms/layout movement;
- provide `@media (forced-colors: active)` rules that keep focus outlines, selected states, and
  control borders visible;
- do not create `.dark` or a second token set.

In `globals.css`, import Tailwind, `tw-animate-css`, and `../components/ui/theme.css`; add a minimal
box-sizing reset, warm canvas, primary text, antialiasing, wrapping defaults, media-safe maximum
width, and no global `overflow-x: hidden` masking. The document must expose actual overflow defects
to browser tests.

- [ ] **Step 5: Load Manrope and axe matchers**

In `src/app/layout.tsx`, import `Manrope` from `next/font/google` and configure:

```ts
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});
```

Apply both `manrope.variable` and the semantic body font class. Keep all metadata local and retain
the existing environment-derived `metadataBase`.

Add `import "vitest-axe/extend-expect";` to `vitest.setup.ts`. Add deterministic DOM shims only when
required by Radix tests: `ResizeObserver`, `HTMLElement.prototype.scrollIntoView`,
`setPointerCapture`, `releasePointerCapture`, and `hasPointerCapture`. Each shim should be the
smallest no-op implementation and must not replace real browser coverage.

- [ ] **Step 6: Verify and commit the foundation**

Run:

```bash
pnpm test:unit -- src/components/ui/theme.test.ts src/app/layout.test.tsx
pnpm format
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm check:workers-deps
git diff --check
```

Expected: all checks pass, built HTML references local `/_next/static/` font assets, and no external
font URL appears in `.next`.

Audit:

```bash
rg -n "fonts\\.googleapis|fonts\\.gstatic|@/lib/utils|dangerouslySetInnerHTML|eval\\(|new Function" src components.json
```

Expected: no external font URL, prohibited utility import, or dynamic-code pattern. A framework
implementation detail outside project source is out of scope for this source audit.

Commit:

```bash
git add package.json pnpm-lock.yaml postcss.config.mjs components.json src/components/ui/utils.ts src/components/ui/theme.css src/components/ui/theme.test.ts src/app/globals.css src/app/layout.tsx src/app/layout.test.tsx vitest.setup.ts
git commit -m "feat: establish warm editorial theme"
```

---

### Task 4: Add the Foundational shadcn Primitives and Form Presentation

**Files:**

- Create/modify reviewed registry output under `src/components/ui/` for:
  `button`, `input`, `textarea`, `label`, `card`, `badge`, `separator`, `progress`, `skeleton`,
  `alert`, and `radio-group`
- Create: `src/components/ui/form-field.tsx`
- Create: `src/components/ui/primitives.test.tsx`
- Create: `src/components/ui/form-field.test.tsx`

**Presentation contract:**

- `Button` variants: `default`, `secondary`, `outline`, `ghost`, `destructive`; sizes:
  `default`, `sm`, `lg`, `icon`.
- Inputs and textareas expose invalid, disabled, and read-only appearance through native
  attributes and `aria-invalid`.
- `FormField` owns visible label, optional description, optional persistent error, optional
  character count, and ID wiring. It does not own field value.
- `Skeleton` preserves the final content's dimensions and uses no continuous translate/scale loop.
- `Progress` has an accessible name supplied by its consumer.

- [ ] **Step 1: Review registry source before installation**

Run:

```bash
pnpm exec shadcn view button input textarea label card badge separator progress skeleton alert radio-group
pnpm exec shadcn add button input textarea label card badge separator progress skeleton alert radio-group --dry-run
```

Inspect the output and reject the change if it creates `src/lib/utils.ts`, installs unpinned
packages, imports remote code/assets, or contains any pattern rejected by the supply-chain audit.

- [ ] **Step 2: Add failing primitive and form tests**

Create `primitives.test.tsx` with Testing Library and `axe` from `vitest-axe`. Cover:

- every Button variant and size, disabled native semantics, `aria-busy`, and an icon-only button
  with an explicit accessible name;
- Input and Textarea disabled, read-only, and invalid semantics;
- Card, Badge, Separator, Alert, Progress, and Skeleton markup;
- radio-group arrow-key selection through `userEvent.keyboard`;
- no axe violations for a representative mounted set.

Create `form-field.test.tsx`. Verify label-to-control association, description via
`aria-describedby`, persistent error via `role="alert"`, `aria-invalid`, disabled/read-only
composition, and a visible `42 / 200 characters` count. The error ID must replace neither the
description nor the count; all active IDs must remain in `aria-describedby`. Validate character
counts as finite non-negative integers with `currentLength <= maxLength`; invalid count props throw
an actionable `RangeError`.

Run:

```bash
pnpm test:unit -- src/components/ui/primitives.test.tsx src/components/ui/form-field.test.tsx
```

Expected: module-not-found failures because the primitives and `FormField` do not exist.

- [ ] **Step 3: Add and normalize the local primitive source**

Run:

```bash
pnpm exec shadcn add button input textarea label card badge separator progress skeleton alert radio-group
```

Immediately inspect:

```bash
git status --short
rg -n "@/lib/utils|https?://|dangerouslySetInnerHTML|eval\\(|new Function|fetch\\(" src/components/ui
```

Expected: source exists only under `src/components/ui`, uses `@/components/ui/utils`, and the audit
has no prohibited result. Replace only generated styling necessary to implement the approved
tokens, target sizes, focus treatment, and variants. Preserve Radix semantics.

Implement `FormField` with the render-prop contract above and use `useId()` when no ID is supplied.
The returned control props carry the resolved ID and ARIA relationships into Input/Textarea.
Disabled and read-only remain native control props supplied by the caller. Keep helper and error
text visible; never use a toast as the only form error.

- [ ] **Step 4: Verify all primitive states**

Run:

```bash
pnpm test:unit -- src/components/ui/primitives.test.tsx src/components/ui/form-field.test.tsx
pnpm lint
pnpm typecheck
pnpm format:check
git diff --check
```

Expected: tests pass with no axe violations, and source contains no `@/lib/utils` import.

- [ ] **Step 5: Commit the primitive layer**

```bash
git add src/components/ui package.json pnpm-lock.yaml components.json
git diff --cached --check
git commit -m "feat: add accessible ui primitives"
```

---

### Task 5: Add Overlay, Feedback, and Application Providers

**Files:**

- Create/modify reviewed registry output under `src/components/ui/` for:
  `tooltip`, `scroll-area`, `tabs`, `dialog`, `alert-dialog`, `sheet`, `dropdown-menu`, and `sonner`
- Create: `src/components/ui/overlays.test.tsx`
- Create: `src/components/providers/app-providers.tsx`
- Create: `src/components/providers/app-providers.test.tsx`
- Modify: `src/app/layout.tsx`

**Provider contract:**

```tsx
<MotionConfig reducedMotion="user">
  <TooltipProvider delayDuration={400}>
    {children}
    <Toaster />
  </TooltipProvider>
</MotionConfig>
```

The concrete nesting may change only to satisfy library requirements. There must be exactly one
application `Toaster`, and providers may not read browser storage, cookies, or user identity.

- [ ] **Step 1: Review overlay registry source**

Run:

```bash
pnpm exec shadcn view tooltip scroll-area tabs dialog alert-dialog sheet dropdown-menu sonner
pnpm exec shadcn add tooltip scroll-area tabs dialog alert-dialog sheet dropdown-menu sonner --dry-run
```

Verify that Dialog, AlertDialog, and Sheet are Radix-backed; all portal content has a visible title
and description API; and no registry file violates the supply-chain rules.

- [ ] **Step 2: Write failing interaction tests**

Create `overlays.test.tsx` and use `userEvent` to verify:

- Tooltip content appears on keyboard focus but the trigger already has its own accessible name;
- Tabs expose `tablist`, `tab`, and `tabpanel`; ArrowRight/ArrowLeft move selection; Home/End select
  first/last;
- Dialog opens from a trigger, places focus inside, closes on Escape, and restores trigger focus;
- AlertDialog requires an explicit confirm or cancel and restores focus;
- Sheet opens, places focus inside, closes on Escape and its visible close control, and restores
  focus;
- DropdownMenu supports keyboard opening and item activation;
- ScrollArea does not remove semantic content from the accessibility tree;
- a representative set has no axe violations.

Create `app-providers.test.tsx` and assert children render once, tooltip behavior is available, one
toast region is mounted, and reduced-motion configuration does not suppress semantic state.

Run:

```bash
pnpm test:unit -- src/components/ui/overlays.test.tsx src/components/providers/app-providers.test.tsx
```

Expected: module-not-found failures.

- [ ] **Step 3: Add reviewed local source and providers**

Run:

```bash
pnpm exec shadcn add tooltip scroll-area tabs dialog alert-dialog sheet dropdown-menu sonner
```

Audit and normalize local source:

```bash
rg -n "@/lib/utils|https?://|dangerouslySetInnerHTML|eval\\(|new Function|fetch\\(" src/components/ui
git status --short
```

Apply the approved overlay duration, warm surface, border, focus, close-control target size, and
reduced-motion classes. Dialog and Sheet content must always expose a close/cancel control in the
visible UI; do not rely solely on Escape.

Create client component `AppProviders`, wrap the root layout body content, and keep
`RootLayout` itself a server component.

- [ ] **Step 4: Verify focus and provider behavior**

Run:

```bash
pnpm test:unit -- src/components/ui/overlays.test.tsx src/components/providers/app-providers.test.tsx
pnpm lint
pnpm typecheck
pnpm format:check
git diff --check
```

Expected: all interaction tests pass. jsdom tests establish intent; Task 14 repeats focus-trap and
restoration checks in Chromium.

- [ ] **Step 5: Commit overlays and providers**

```bash
git add src/components/ui src/components/providers src/app/layout.tsx package.json pnpm-lock.yaml
git commit -m "feat: add overlays and application providers"
```

---

### Task 6: Curate Animate UI Icons with a Reviewed Local Boundary

**Files:**

- Create: `src/components/ui/icons/README.md`
- Create reviewed local Animate UI source under `src/components/ui/icons/` for:
  `icon`, `copy`, `check`, `menu`, `panel-left-open`, `panel-left-close`, `upload`, `refresh-cw`,
  `circle-check-big`, and `chevron-down`
- Create: `src/components/ui/icons/animated-icons.test.tsx`

**Allowed behavior:** Icons may animate only in response to the associated user action or state
change. They render static Lucide-compatible SVG content when reduced motion is active or motion
initialization is unavailable. Decorative icon instances use `aria-hidden="true"`; an icon-only
button obtains its accessible name from the button, never the SVG.

- [ ] **Step 1: Review every registry item before installation**

Run:

```bash
pnpm exec shadcn view @animate-ui/icons-icon
pnpm exec shadcn view @animate-ui/icons-copy @animate-ui/icons-check @animate-ui/icons-menu @animate-ui/icons-panel-left-open @animate-ui/icons-panel-left-close @animate-ui/icons-upload @animate-ui/icons-refresh-cw @animate-ui/icons-circle-check-big @animate-ui/icons-chevron-down
pnpm exec shadcn add @animate-ui/icons-icon @animate-ui/icons-copy @animate-ui/icons-check @animate-ui/icons-menu @animate-ui/icons-panel-left-open @animate-ui/icons-panel-left-close @animate-ui/icons-upload @animate-ui/icons-refresh-cw @animate-ui/icons-circle-check-big @animate-ui/icons-chevron-down --dry-run
```

Animate UI documents alias-placement limitations. Inspect every dry-run destination and import. Do
not perform the real add if it writes outside `src/components/ui/icons` or imports an Animate UI
general-purpose component.

- [ ] **Step 2: Write failing icon-boundary tests**

Create `animated-icons.test.tsx` that renders every curated icon and asserts:

- each produces an SVG with a stable `data-slot` or component-specific test selector;
- a decorative instance is hidden from the accessibility tree;
- state icons can receive an explicit `<title>` only when they carry meaning independently;
- render does not require a network API;
- server rendering through `renderToString` succeeds for the static initial frame.

Add a source-level test that recursively reads the icon directory and fails on:

```text
http://
https://
dangerouslySetInnerHTML
eval(
new Function
fetch(
XMLHttpRequest
setInterval(
```

Run:

```bash
pnpm test:unit -- src/components/ui/icons/animated-icons.test.tsx
```

Expected: module-not-found failures.

- [ ] **Step 3: Install one registry item at a time and relocate with reviewed edits**

Run the real `shadcn add` command for `icons-icon`, then each required icon separately. After each
command:

1. inspect `git status --short`;
2. inspect the complete added source;
3. move source into `src/components/ui/icons` using repository-safe edits;
4. rewrite only import paths needed for the approved ownership boundary;
5. run `git diff --check`.

Delete no existing user image. Do not keep duplicate registry output in a second directory.

In `README.md`, record:

- upstream project `https://github.com/imskyleen/animate-ui`;
- MIT license;
- retrieval date `2026-07-28`;
- the ten registry item names;
- the local-modification policy;
- the rule that future registry updates require a fresh source audit and interaction tests.

- [ ] **Step 4: Verify the icon source and reduced-motion contract**

Run:

```bash
pnpm test:unit -- src/components/ui/icons/animated-icons.test.tsx src/components/providers/app-providers.test.tsx
rg -n "http://|https://|dangerouslySetInnerHTML|eval\\(|new Function|fetch\\(|XMLHttpRequest|setInterval\\(" src/components/ui/icons --glob '!README.md'
pnpm lint
pnpm typecheck
pnpm format:check
```

Expected: tests pass, audit prints nothing, and only `motion/react`, React, and local source are
needed by the animated icon layer. Real `prefers-reduced-motion` behavior is verified in Task 14.

- [ ] **Step 5: Commit the curated icon boundary**

```bash
git add src/components/ui/icons
git commit -m "feat: curate reduced-motion animated icons"
```

---

### Task 7: Build Product Status and Risk Components

**Files:**

- Create: `src/components/product/lifecycle-steps.tsx`
- Create: `src/components/product/lifecycle-steps.test.tsx`
- Create: `src/components/product/evidence-label.tsx`
- Create: `src/components/product/evidence-label.test.tsx`
- Create: `src/components/product/usage-meter.tsx`
- Create: `src/components/product/usage-meter.test.tsx`
- Create: `src/components/product/risk-warning.tsx`
- Create: `src/components/product/risk-warning.test.tsx`

Use the exact public contracts in this plan.

- [ ] **Step 1: Write failing LifecycleSteps tests**

Cover:

- semantic ordered list with a caller-supplied accessible label;
- complete/current/pending/blocked visible text for each step;
- current step uses `aria-current="step"`;
- blocked state includes an icon and text, not color alone;
- nullable descriptions;
- long labels wrap without a fixed width or truncation;
- empty `steps` renders a labelled empty list rather than inventing progress;
- representative markup has no axe violations.

Run:

```bash
pnpm test:unit -- src/components/product/lifecycle-steps.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement and verify LifecycleSteps**

Use a semantic `<ol>`/`<li>` structure, static initial icon frames, status-token classes, and
responsive text wrapping.

Run:

```bash
pnpm test:unit -- src/components/product/lifecycle-steps.test.tsx
```

Expected: pass.

- [ ] **Step 3: Write failing EvidenceLabel and UsageMeter tests**

For `EvidenceLabel`, test exactly four accepted states and exact visible labels:
`Claimed`, `Evidence supplied`, `User confirmed`, `Verified`. Test status-specific icon/text,
class-name extension, and no axe violations. Type-level code must not include a fifth state.

For `UsageMeter`, test:

- visible `used`, `remaining`, `limit`, and `unit` values;
- `role="progressbar"` with `aria-valuemin=0`, exact `aria-valuenow`, and exact
  `aria-valuemax`;
- `used=0` and `used=limit`;
- every invalid numeric condition from the contract throws `RangeError` with the component name
  and invalid values.

Run:

```bash
pnpm test:unit -- src/components/product/evidence-label.test.tsx src/components/product/usage-meter.test.tsx
```

Expected: module-not-found failures.

- [ ] **Step 4: Implement and verify EvidenceLabel and UsageMeter**

Compose Badge and Progress. Use CSS custom properties or a bounded percentage only after validation;
do not silently clamp. Keep visible values even when assistive technology exposes the progress
attributes.

Run:

```bash
pnpm test:unit -- src/components/product/evidence-label.test.tsx src/components/product/usage-meter.test.tsx
```

Expected: pass.

- [ ] **Step 5: Write failing RiskWarning tests**

Cover warning and danger presentation, visible icon/title/description, color-independent labels,
non-confirming display when `confirmation` is `null`, explicit AlertDialog trigger when it exists,
cancel behavior, confirm callback exactly once, Escape close without confirmation, and focus
restoration. Run axe against both levels.

Run:

```bash
pnpm test:unit -- src/components/product/risk-warning.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 6: Implement and verify RiskWarning**

Compose Alert and AlertDialog. The danger confirm button uses the destructive Button variant. The
trigger label, confirm label, and cancel label come from props and remain visible. Do not introduce
an implicit timeout or optimistic acknowledgement.

Run:

```bash
pnpm test:unit -- src/components/product/risk-warning.test.tsx
pnpm lint
pnpm typecheck
pnpm format:check
```

Expected: pass.

- [ ] **Step 7: Commit product status components**

```bash
git add src/components/product
git commit -m "feat: add product status components"
```

---

### Task 8: Build Product Confirmation and Choice Components

**Files:**

- Create: `src/components/product/confirmation-card.tsx`
- Create: `src/components/product/confirmation-card.test.tsx`
- Create: `src/components/product/question-choice.tsx`
- Create: `src/components/product/question-choice.test.tsx`
- Create: `src/components/product/tool-selector.tsx`
- Create: `src/components/product/tool-selector.test.tsx`

Use the exact `ConfirmationCardProps`, generic `QuestionChoiceProps`, and `ToolSelectorProps`
contracts in this plan.

- [ ] **Step 1: Write failing ConfirmationCard tests**

Verify:

- title, summary, and each detail are visible;
- details use a semantic list;
- confirm and reject callbacks each run exactly once;
- `busy=true` disables both controls, applies `aria-busy`, and preserves button dimensions;
- empty details render no empty list;
- long content wraps;
- representative normal and busy states have no axe violations.

Run:

```bash
pnpm test:unit -- src/components/product/confirmation-card.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement and verify ConfirmationCard**

Compose Card and Button. Keep confirmation and rejection visually distinct without making reject
look destructive. Do not mutate state after invoking either callback.

Run:

```bash
pnpm test:unit -- src/components/product/confirmation-card.test.tsx
```

Expected: pass.

- [ ] **Step 3: Write failing generic QuestionChoice tests**

Use a three-option string union fixture. Verify:

- visible group legend and native/Radix radio-group semantics;
- selected value is controlled entirely by props;
- ArrowDown/ArrowRight select the next enabled option and ArrowUp/ArrowLeft select the previous;
- disabled choices are skipped and cannot invoke `onValueChange`;
- descriptions remain associated with their radio item;
- empty options and duplicate values throw actionable errors in test mode;
- long labels and descriptions remain fully visible;
- no axe violations.

Run:

```bash
pnpm test:unit -- src/components/product/question-choice.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 4: Implement and verify QuestionChoice**

Compose RadioGroup and Label. Use a labelled group; do not make an entire generic Card behave as an
unlabelled button. Preserve Radix arrow-key behavior and caller-controlled selection.

Run:

```bash
pnpm test:unit -- src/components/product/question-choice.test.tsx
```

Expected: pass.

- [ ] **Step 5: Write failing ToolSelector tests**

Assert exactly these options and labels:

| Value         | Label        |
| ------------- | ------------ |
| `claude-code` | Claude Code  |
| `codex`       | OpenAI Codex |
| `cursor`      | Cursor       |

Verify controlled selection, arrow-key navigation, visible supporting descriptions that make no
unverified capability claims, and no axe violations.

Run:

```bash
pnpm test:unit -- src/components/product/tool-selector.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 6: Implement ToolSelector as a narrow QuestionChoice composition**

Keep the canonical options as a readonly tuple and delegate selection behavior to
`QuestionChoice<CodingTool>`. Do not add vendor logos, outbound links, account status, or tool
availability checks.

Run:

```bash
pnpm test:unit -- src/components/product/tool-selector.test.tsx
pnpm lint
pnpm typecheck
pnpm format:check
```

Expected: pass.

- [ ] **Step 7: Commit product interaction components**

```bash
git add src/components/product
git commit -m "feat: add confirmation and choice components"
```

---

### Task 9: Build Prompt, File, and Empty-State Components

**Files:**

- Create: `src/components/product/prompt-panel.tsx`
- Create: `src/components/product/prompt-panel.test.tsx`
- Create: `src/components/product/file-item.tsx`
- Create: `src/components/product/file-item.test.tsx`
- Create: `src/components/product/empty-state.tsx`
- Create: `src/components/product/empty-state.test.tsx`

Use the exact public contracts in this plan.

- [ ] **Step 1: Write failing PromptPanel tests**

Cover:

- one visible prompt in a selectable semantic text container;
- nullable metadata;
- visible expected-result heading and content;
- acceptance criteria as a semantic list;
- successful injected `copyText` receives the exact prompt and shows `Copied` text with a check
  icon;
- copy success does not rely on a toast;
- rejected copy promise leaves prompt text present and selectable and renders exact inline recovery
  text `Copy failed. Select the prompt text and copy it manually.`;
- repeated copy attempts clear the prior failure only after a new success;
- copy control has an explicit accessible name;
- no axe violations.

Run:

```bash
pnpm test:unit -- src/components/product/prompt-panel.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement and verify PromptPanel**

Make only the minimal copy-feedback island a client component. Use the curated copy/check icons and
the approved micro-interaction timing. Guard the default Clipboard API:

```ts
if (!navigator.clipboard?.writeText) {
  throw new Error("Clipboard API is unavailable");
}
```

Catch that error only to render the exact inline recovery text; do not log the prompt.

Run:

```bash
pnpm test:unit -- src/components/product/prompt-panel.test.tsx
```

Expected: pass.

- [ ] **Step 3: Write failing FileItem tests**

For each status (`ready`, `uploading`, `processing`, `error`, `complete`) verify visible status text
and an icon. Also verify:

- filename, file type, and deterministic IEC byte formatting (`1024` → `1 KiB`);
- filename wraps without hiding its extension;
- error message uses a persistent alert;
- retry appears only for error plus a non-null callback;
- remove appears only for a non-null callback;
- retry and remove callbacks run once;
- upload/processing has accessible progress wording but no fake percentage;
- no file input, upload request, object URL, or persistence API exists;
- no axe violations.

Run:

```bash
pnpm test:unit -- src/components/product/file-item.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 4: Implement and verify FileItem**

Use a status-to-label/icon map with exhaustive `satisfies Record<FileItemStatus, ...>` typing.
Validate `sizeBytes` is finite, integer, and non-negative; throw `RangeError` otherwise. Do not
infer MIME safety or parse filenames.

Run:

```bash
pnpm test:unit -- src/components/product/file-item.test.tsx
```

Expected: pass.

- [ ] **Step 5: Write failing EmptyState tests**

Verify semantic heading, description, decorative icon handling, optional action presence/absence,
long copy wrapping, and no axe violations. The component must not create a link destination or
action callback by itself.

Run:

```bash
pnpm test:unit -- src/components/product/empty-state.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 6: Implement, verify, and commit**

Compose Card where useful, but do not turn the entire empty state into an interactive surface.

Run:

```bash
pnpm test:unit -- src/components/product/prompt-panel.test.tsx src/components/product/file-item.test.tsx src/components/product/empty-state.test.tsx
pnpm lint
pnpm typecheck
pnpm format:check
git diff --check
```

Expected: pass.

Commit:

```bash
git add src/components/product
git commit -m "feat: add prompt and file presentation"
```

---

### Task 10: Build the Brand Lockup and Responsive Application Shell

**Files:**

- Create: `src/components/brand/brand-lockup.tsx`
- Create: `src/components/brand/brand-lockup.test.tsx`
- Create: `src/components/shell/navigation.ts`
- Create: `src/components/shell/shell-navigation.tsx`
- Create: `src/components/shell/shell-navigation.test.tsx`
- Create: `src/components/shell/application-shell.tsx`
- Create: `src/components/shell/application-shell.test.tsx`

**Navigation fixture:**

```ts
export const productNavigation = [
  {
    id: "new-project",
    label: "New Project",
    icon: Plus,
    availability: "available",
    href: "/",
    active: true,
  },
  {
    id: "projects",
    label: "Projects",
    icon: Folder,
    availability: "soon",
    href: null,
    active: false,
  },
  {
    id: "profile",
    label: "Profile",
    icon: UserRound,
    availability: "soon",
    href: null,
    active: false,
  },
  {
    id: "usage",
    label: "Usage",
    icon: ChartNoAxesColumn,
    availability: "soon",
    href: null,
    active: false,
  },
] as const satisfies readonly ShellNavigationItem[];
```

If a Lucide export name changed in the pinned version, select the closest semantically equivalent
static Lucide icon and update only the icon identifier, not labels, ordering, hrefs, availability,
or active state.

- [ ] **Step 1: Write failing BrandLockup tests**

Verify:

- the image source is exactly `/brand/icon-192.png`;
- meaningful `alt="UnseenPrompt"` is used when the wordmark is not rendered;
- when the visible wordmark is rendered, the image uses empty alt to avoid duplicate
  announcements;
- wordmark text is exactly `UnseenPrompt`;
- compact and full variants render without importing from `src/app`;
- no axe violations.

Run:

```bash
pnpm test:unit -- src/components/brand/brand-lockup.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement BrandLockup with the approved asset**

Use `next/image` with explicit width and height. Do not add a second logo, redraw the mark in CSS,
or import a Next metadata image from `src/app`.

Run:

```bash
pnpm test:unit -- src/components/brand/brand-lockup.test.tsx
```

Expected: pass.

- [ ] **Step 3: Write failing navigation semantics tests**

Render `ShellNavigation` with the locked fixture and verify:

- navigation has an accessible label;
- order is New Project, Projects, Profile, Usage;
- New Project is the only link and has `aria-current="page"`;
- Projects, Profile, and Usage are non-interactive text, each with visible `Soon`;
- unavailable entries are not in the tab order;
- icons are decorative;
- long navigation labels wrap;
- no axe violations.

Run:

```bash
pnpm test:unit -- src/components/shell/shell-navigation.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 4: Implement ShellNavigation and its typed fixture**

Render the discriminated union exhaustively. Do not add disabled anchors, `href="#"`, click
handlers, or tooltips as a substitute for the visible `Soon` label.

Run:

```bash
pnpm test:unit -- src/components/shell/shell-navigation.test.tsx
```

Expected: pass.

- [ ] **Step 5: Write failing ApplicationShell tests**

Verify server-visible structure and client interactions:

- first focusable element is a skip link to `#main-workspace`;
- landmarks are one complementary desktop sidebar, mobile banner, navigation, and main;
- main has `id="main-workspace"` and `tabIndex={-1}` for skip-link focus;
- desktop and mobile use the same navigation data;
- mobile menu trigger is named `Open navigation`;
- opening the Sheet places focus inside;
- Tab/Shift+Tab remain in the open Sheet;
- Escape and explicit close return focus to the trigger;
- no bottom navigation exists;
- representative closed and open states have no axe violations.

Run:

```bash
pnpm test:unit -- src/components/shell/application-shell.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 6: Implement the exact responsive shell**

Implement:

- fixed desktop sidebar, width `232px`, visible at `min-width: 1024px`;
- desktop content offset by 232px;
- 56px fixed/sticky mobile header below 1024px;
- mobile Sheet width `min(88vw, 320px)`;
- main workspace width `min(100%, 960px)` with 16px mobile, 24px tablet, and 40px desktop gutters;
- skip link that becomes visible on focus and is never hidden under the mobile header;
- white sidebar/sheet surface, subtle border, muted Powder Pink active item;
- menu/open-close animated icon triggered only by the menu action;
- no viewport-height assumption that clips content on mobile browser chrome; use dynamic viewport
  units with a normal-flow fallback.

Keep breakpoint behavior in CSS/Tailwind. Do not use `window.innerWidth` or duplicate responsive
markup based on client JavaScript.

- [ ] **Step 7: Verify and commit shell components**

Run:

```bash
pnpm test:unit -- src/components/brand/brand-lockup.test.tsx src/components/shell/shell-navigation.test.tsx src/components/shell/application-shell.test.tsx
pnpm lint
pnpm typecheck
pnpm format:check
git diff --check
```

Expected: pass.

Commit:

```bash
git add src/components/brand src/components/shell
git commit -m "feat: add responsive application shell"
```

---

### Task 11: Add the Product Route Group and Application State Boundaries

**Files:**

- Create: `src/app/(product)/layout.tsx`
- Create: `src/app/(product)/layout.test.tsx`
- Create: `src/components/shell/maintenance-notice.tsx`
- Create: `src/components/shell/maintenance-notice.test.tsx`
- Create: `src/app/loading.tsx`
- Create: `src/app/error.tsx`
- Create: `src/app/error.test.tsx`
- Create: `src/app/global-error.tsx`
- Create: `src/app/not-found.tsx`
- Move later in Task 12: `src/app/page.tsx` to `src/app/(product)/page.tsx`
- Move later in Task 12: `src/app/page.test.tsx` to `src/app/(product)/page.test.tsx`

**Boundary contract:**

- `(product)/layout.tsx` is a server component, reads `getServerEnvironment()`, and renders one
  `ApplicationShell`.
- `MAINTENANCE_MODE="on"` replaces product children with `MaintenanceNotice` inside that shell.
- `/api/health`, `/api/internal/health/workflow`, and `/design-system` remain outside `(product)`.
- Phase 2 maintenance is a presentation boundary; it does not claim HTTP 503.
- `error.tsx` is a client boundary with visible error and retry.
- `global-error.tsx` owns its own `<html>` and `<body>` and cannot import the component system,
  providers, Tailwind-dependent classes, animated icons, or environment parser.

- [ ] **Step 1: Write failing MaintenanceNotice tests**

Verify exact visible heading `UnseenPrompt is temporarily unavailable`, concise retry-later
guidance, no fake status estimate, no mutation controls or automatic refresh, and no axe
violations.

Run:

```bash
pnpm test:unit -- src/components/shell/maintenance-notice.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement and verify MaintenanceNotice**

Use Alert/Card presentation and a static status icon. Do not add automatic polling, a countdown, or
an operational incident claim.

Run:

```bash
pnpm test:unit -- src/components/shell/maintenance-notice.test.tsx
```

Expected: pass.

- [ ] **Step 3: Write failing product-layout tests**

Mock `getServerEnvironment()` at the server adapter boundary. Assert:

- `"off"` renders supplied children once inside main workspace;
- `"on"` omits supplied product children and renders MaintenanceNotice;
- both states render ApplicationShell and locked navigation;
- invalid values remain covered by Task 2's parser tests;
- no environment object is serialized into client-visible markup.

Add a source-boundary assertion that health route paths and `design-system` are not nested inside
`src/app/(product)`.

Run:

```bash
pnpm test:unit -- 'src/app/(product)/layout.test.tsx'
```

Expected: module-not-found failure.

- [ ] **Step 4: Implement the product layout**

Use `productNavigation` and `ApplicationShell`. Keep the layout server-rendered; only Sheet behavior
inside the shell is a client island.

Run:

```bash
pnpm test:unit -- 'src/app/(product)/layout.test.tsx'
```

Expected: pass.

- [ ] **Step 5: Write failing recoverable-boundary tests**

For `error.tsx`, test:

- visible heading `Something went wrong`;
- persistent explanation;
- `Try again` button invokes provided `reset` exactly once;
- optional development diagnostics do not render raw stack traces or secrets;
- no toast-only error;
- no axe violations.

For other boundaries, add source/SSR assertions:

- `loading.tsx` has an accessible `Loading workspace` label and shell-sized skeleton dimensions;
- `not-found.tsx` explains the unavailable page and links to `/`;
- `global-error.tsx` renders complete document structure and has no import from
  `@/components`, `@/config`, `motion`, or `sonner`.

Run:

```bash
pnpm test:unit -- src/app/error.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 6: Implement all route boundaries**

Use design-system components for loading, recoverable error, and not-found. Implement
`global-error.tsx` with minimal inline style objects using the locked canvas, text, border, and
brand colors so it remains readable if CSS/provider initialization failed. It may expose a plain
native reset button.

Ensure loading skeletons reserve a 232px desktop sidebar and centered workspace shape without
announcing every decorative skeleton element.

- [ ] **Step 7: Verify and commit boundaries**

Run:

```bash
pnpm test:unit -- src/components/shell/maintenance-notice.test.tsx 'src/app/(product)/layout.test.tsx' src/app/error.test.tsx
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
git diff --check
```

Expected: pass; health route tests still pass and their route locations are unchanged.

Commit:

```bash
git add 'src/app/(product)/layout.tsx' 'src/app/(product)/layout.test.tsx' src/components/shell/maintenance-notice.tsx src/components/shell/maintenance-notice.test.tsx src/app/loading.tsx src/app/error.tsx src/app/error.test.tsx src/app/global-error.tsx src/app/not-found.tsx
git commit -m "feat: add product state boundaries"
```

---

### Task 12: Replace the Foundation Page with the Honest Product Preview

**Files:**

- Delete: `src/app/page.tsx`
- Delete: `src/app/page.test.tsx`
- Create: `src/app/(product)/page.tsx`
- Create: `src/app/(product)/page.test.tsx`

**Content contract:**

- Eyebrow: `Stateful Project Copilot`
- Heading: `Turn project context into an agent-ready prompt`
- Preview badge: `Preview`
- Disclosure: `Prompt generation becomes interactive in a later phase.`
- Representative prompt label: `Example project request`
- Representative prompt text:
  `Create an accessible project setup flow for a personal web application, including explicit
confirmation before any high-risk change.`

The page may show non-interactive lifecycle context and tool labels, but it must not imply a
generated result, authenticated account, saved project, available usage balance, or active AI
provider.

- [ ] **Step 1: Move the existing test and make it fail on the new contract**

Create the route-group test and remove the old root test. Assert:

- exact eyebrow, heading, Preview badge, disclosure, label, and example request;
- one level-one heading;
- no `form`, textbox, combobox, contenteditable element, file input, submit button, or editable
  element;
- no script-level call to `fetch`, a server action, analytics, clipboard, or storage;
- visible copy states plainly indicate example/preview content;
- no axe violations for the page content.

Run:

```bash
pnpm test:unit -- 'src/app/(product)/page.test.tsx'
```

Expected: failure because the current root page still contains the foundation copy and route-group
page does not exist.

- [ ] **Step 2: Implement the server-rendered product preview**

Build a Warm Editorial hero and static preview composer using Card, Badge, LifecycleSteps, and
ToolSelector-like visual labels only where semantics remain honest. The preview composer is
presentation markup, not an input or disabled form. Keep the primary content column at 800px
maximum inside the shell's 960px workspace.

Use the supplied logo through BrandLockup and the real semantic tokens. Do not add decorative stock
imagery or copy Prompt Cowboy content.

- [ ] **Step 3: Verify static behavior and metadata**

Run:

```bash
pnpm test:unit -- 'src/app/(product)/page.test.tsx'
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
rg -n "fetch\\(|server action|localStorage|sessionStorage|analytics|contentEditable|<form|<input|<textarea" 'src/app/(product)/page.tsx'
```

Expected: tests and build pass; source audit prints no mutation/input API.

- [ ] **Step 4: Commit the product preview**

```bash
git add src/app/page.tsx src/app/page.test.tsx 'src/app/(product)/page.tsx' 'src/app/(product)/page.test.tsx'
git commit -m "feat: add public product preview"
```

Git records the old root files as deleted and the new route-group files as additions or renames.

---

### Task 13: Create the Non-Production Design-System Gallery

**Files:**

- Create: `src/app/design-system/gallery-data.ts`
- Create: `src/app/design-system/gallery-client.tsx`
- Create: `src/app/design-system/page.tsx`
- Create: `src/app/design-system/page.test.tsx`

**Exposure contract:**

```ts
export const metadata: Metadata = {
  title: "Design System",
  robots: { index: false, follow: false },
};

export function isDesignSystemAvailable(appEnvironment: AppEnvironment["APP_ENV"]): boolean {
  return appEnvironment !== "production";
}
```

The page calls `notFound()` before rendering gallery content when availability is false. This is a
UI exposure guard, not an authorization boundary; fixtures must remain synthetic and non-sensitive.

- [ ] **Step 1: Write failing exposure and inventory tests**

Test:

- availability is true for `local`, `preview`, `staging`, and `test`;
- availability is false for `production`;
- production invokes the not-found path before rendering gallery content;
- metadata is exactly `noindex, nofollow`;
- gallery inventory includes every core component:
  Button, Input, Textarea, Card, Badge, Separator, Tooltip, ScrollArea, Tabs, Dialog, AlertDialog,
  Sheet, DropdownMenu, Progress, FileItem, Skeleton, EmptyState, Alert, Toast;
- gallery inventory includes every product component:
  LifecycleSteps, ConfirmationCard, EvidenceLabel, PromptPanel, QuestionChoice, ToolSelector,
  UsageMeter, RiskWarning;
- fixture strings contain no email address, bearer token, UUID, production URL path, or real
  customer/project content.

Run:

```bash
pnpm test:unit -- src/app/design-system/page.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement server guard and typed gallery data**

Keep the environment read and `notFound()` in `page.tsx`. Define a readonly inventory in
`gallery-data.ts` with stable section/component IDs and keyboard notes. Do not send the complete
server environment object to `gallery-client.tsx`.

- [ ] **Step 3: Implement the interactive gallery client**

Render:

- token swatches with token name, exact hex, intended role, and measured contrast pairs;
- typography, spacing, radius, border, elevation, focus, forced-colors, and motion specimens;
- every core and product component;
- normal, disabled, loading, error, long-text, and reduced-motion cases where meaningful;
- interaction instructions for tabs, dialog, sheet, dropdown, radio group, and risk confirmation;
- synthetic event feedback inline or through Sonner only for transient confirmation;
- an explicit statement that the gallery contains no production data and is hidden in production.

Use component-local `useState` only to demonstrate controlled props. Do not make API requests or
persist gallery selections.

- [ ] **Step 4: Verify gallery completeness**

Run:

```bash
pnpm test:unit -- src/app/design-system/page.test.tsx
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
rg -n "fetch\\(|localStorage|sessionStorage|document\\.cookie|@/features|@/app/" src/app/design-system src/components
```

Expected: tests and build pass. The source audit has no persistence/network call or forbidden
component import; imports inside `src/app/design-system` from the app layer itself are acceptable
only when local to that route.

- [ ] **Step 5: Commit the component gallery**

```bash
git add src/app/design-system
git commit -m "feat: add guarded design system gallery"
```

---

### Task 14: Add Real-Browser Accessibility, Responsive, and Visual Tests

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/application-shell.spec.ts`
- Create: `tests/e2e/design-system.spec.ts`
- Create: `tests/e2e/homepage.spec.ts`
- Create: `tests/e2e/maintenance.spec.ts`
- Create: `tests/e2e/production-guard.spec.ts`
- Create: `tests/e2e/visual.spec.ts`
- Create: `tests/e2e/__screenshots__/**` through the approved Playwright update command
- Modify: `package.json`
- Modify: `.gitignore`

**Playwright environment contract:**

```ts
const appEnvironment = process.env.E2E_APP_ENV ?? "preview";
const maintenanceMode = process.env.E2E_MAINTENANCE_MODE ?? "off";
const port = Number(process.env.E2E_PORT ?? "3100");
const runtimeBaseUrl = `http://127.0.0.1:${port}`;
const metadataBaseUrl =
  appEnvironment === "production" ? "https://unseenprompt.com" : runtimeBaseUrl;
```

Validate `E2E_APP_ENV` against the same five allowed app environments and
`E2E_MAINTENANCE_MODE` against `off|on` inside the config; fail before starting a server on invalid
test configuration.

Build `webServer.command` from the validated constants without accepting arbitrary shell input:

```ts
const serverCommand = [
  `APP_ENV=${appEnvironment}`,
  `NEXT_PUBLIC_APP_URL=${metadataBaseUrl}`,
  "RELEASE_SHA=e2e",
  `MAINTENANCE_MODE=${maintenanceMode}`,
  `pnpm dev -- --hostname 127.0.0.1 --port ${port}`,
].join(" ");
```

Use `runtimeBaseUrl` for Playwright navigation, `reuseExistingServer: false`, one worker, Chromium
only, trace on first retry, screenshot on failure, and video retain-on-failure.

- [ ] **Step 1: Write and validate the Playwright configuration**

Define four named Chromium projects:

| Project | Viewport |
| ------- | -------- |
| mobile  | 390×844  |
| tablet  | 768×1024 |
| desktop | 1024×768 |
| wide    | 1440×900 |

Use a stable snapshot path independent of local absolute paths. Apply a conservative screenshot
threshold only for font antialiasing; do not mask content regions or ignore layout movement.

Add scripts:

```json
{
  "test:e2e": "playwright test --grep-invert '@maintenance|@production'",
  "test:e2e:maintenance": "E2E_MAINTENANCE_MODE=on playwright test --grep '@maintenance'",
  "test:e2e:production": "E2E_APP_ENV=production playwright test --grep '@production'",
  "test:e2e:update": "playwright test tests/e2e/visual.spec.ts --update-snapshots"
}
```

Add `blob-report/` to `.gitignore` if the selected reporter creates it. Keep
`playwright-report/` and `test-results/` ignored.

Run:

```bash
pnpm exec playwright install chromium
pnpm exec playwright test --list
```

Expected: Playwright lists the normal suite for all four projects plus tagged maintenance and
production tests; no server starts for `--list`.

- [ ] **Step 2: Write failing homepage and shell browser tests**

In `homepage.spec.ts`, assert at every project viewport:

- exact preview heading and disclosure are visible;
- no editable element or submit control exists;
- all page requests remain GET/HEAD; no POST/PUT/PATCH/DELETE request occurs after load and basic
  navigation interaction;
- `document.documentElement.scrollWidth <= clientWidth`;
- skip link is first in the keyboard order and focuses `#main-workspace`;
- focus rectangles remain within the viewport.

In `application-shell.spec.ts`, assert:

- at 1024×768 and 1440×900, sidebar is visible, width is 232px within one CSS pixel, and mobile
  header/menu is hidden;
- at 390×844 and 768×1024, mobile header is 56px within one CSS pixel, desktop sidebar is hidden,
  and there is no bottom navigation;
- Sheet open puts focus inside, Tab and Shift+Tab do not escape, Escape closes, and focus returns to
  `Open navigation`;
- explicit close has the same restoration behavior;
- Soon entries are not anchors and not keyboard-focusable;
- text-only 200% emulation, applied with
  `document.documentElement.style.fontSize = "200%"`, retains access to all critical controls and
  produces no page overflow. Task 16 repeats this with browser zoom during manual inspection.

Run:

```bash
pnpm test:e2e -- tests/e2e/homepage.spec.ts tests/e2e/application-shell.spec.ts
```

Expected: failures until the browser assertions expose any CSS/focus mismatch. Fix the underlying
component or style; do not weaken selectors or hide overflow.

- [ ] **Step 3: Write failing accessibility and reduced-motion browser tests**

Use:

```ts
import AxeBuilder from "@axe-core/playwright";

const results = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
  .analyze();
```

Fail on every serious or critical violation and print rule ID, impact, help, and affected selectors.
Scan `/` and `/design-system` in closed/default state, then scan gallery Dialog and Sheet open
states.

Also:

- emulate `reducedMotion: "reduce"`, exercise copy, Sheet, Dialog, dropdown, and tab behavior, and
  assert equivalent text/icon state remains;
- emulate `forcedColors: "active"` and assert the focused menu trigger, active navigation item,
  selected radio, and control border remain visible through computed outline/border values;
- verify no focused element is obscured using bounding rectangles plus `elementFromPoint` at the
  focused element's center.

Run:

```bash
pnpm test:e2e -- tests/e2e/accessibility.spec.ts
```

Expected: failing assertions identify real accessibility defects; fix source rather than excluding
axe rules. A rule exclusion requires a documented reproducible false positive and user approval.

- [ ] **Step 4: Write gallery and environment-boundary browser tests**

In `design-system.spec.ts`, verify non-production response 200, title/robots metadata, every
inventory heading, core interactions, long-text fixture, error fixture, and no page overflow at all
viewports.

In `maintenance.spec.ts` tagged `@maintenance`, verify:

- `/` renders maintenance heading and omits preview heading;
- `GET /api/health` remains outside maintenance and returns its normal preview-environment JSON
  with HTTP 200;
- `/design-system` remains available;
- no product content flashes before maintenance content.

In `production-guard.spec.ts` tagged `@production`, verify:

- `/design-system` responds 404 and does not contain gallery inventory;
- `/` remains available when maintenance is off;
- HTML metadata contains production `metadataBase` results without exposing environment values in
  visible content.

Run:

```bash
pnpm test:e2e -- tests/e2e/design-system.spec.ts
pnpm test:e2e:maintenance
pnpm test:e2e:production
```

Expected: all environment suites pass. They start separate validated servers sequentially.

- [ ] **Step 5: Add deterministic visual regression**

In `visual.spec.ts`, set `reducedMotion: "reduce"`, wait for `document.fonts.ready`, and use
`toHaveScreenshot` for:

- homepage at mobile 390×844;
- homepage at wide 1440×900;
- gallery token/core section at mobile;
- full gallery at wide;
- mobile navigation Sheet open;
- danger AlertDialog open.

Use synthetic fixtures and freeze any time-dependent output. Generate the initial baselines only
after semantic/browser tests pass:

```bash
pnpm test:e2e:update
git status --short tests/e2e
pnpm exec playwright test tests/e2e/visual.spec.ts
```

Expected: baseline images are created under `tests/e2e/__screenshots__`, then the second run passes
without updating them. If the local and CI operating systems rasterize text differently, generate
and commit the additional Playwright platform baseline with the pinned Chromium version; do not
raise the tolerance enough to permit structural movement.

- [ ] **Step 6: Run and commit the complete browser layer**

Run:

```bash
pnpm test:e2e
pnpm test:e2e:maintenance
pnpm test:e2e:production
pnpm lint
pnpm typecheck
pnpm format:check
git diff --check
```

Expected: all four viewports and all three environment modes pass.

Commit:

```bash
git add playwright.config.ts tests/e2e package.json pnpm-lock.yaml .gitignore
git commit -m "test: add phase 2 browser coverage"
```

---

### Task 15: Regenerate Social Cards, Document the System, and Enforce CI

**Files:**

- Create: `scripts/generate-social-card.mjs`
- Modify: `scripts/phase-2-assets.test.ts`
- Modify: `src/app/opengraph-image.png` through the generator
- Modify: `src/app/twitter-image.png` through the generator
- Create: `docs/development/design-system.md`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/phase-2-ci-workflow.test.ts`
- Modify: `package.json`

**Social-card contract:**

- 1200×630 PNG;
- background `#FEFAF8`;
- supplied logo used without redrawing;
- title `UnseenPrompt`;
- subtitle `Stateful Project Copilot for AI-assisted web development.`;
- Manrope Variable from the pinned local Fontsource development package;
- no remote image/font request;
- Open Graph and Twitter outputs are intentionally separate files with identical bytes.

- [ ] **Step 1: Extend asset tests before regeneration**

Add assertions that both social cards:

- remain 1200×630;
- are byte-identical;
- contain neither unexpected PNG text chunks with filesystem paths nor external URLs;
- match the committed generated hash after the prior serif-card hash is intentionally removed from
  the baseline assertion.

Test the generator source contract: it must read only the local source logo and local Manrope font,
use a 1200×630 viewport with device scale factor 1, set all text explicitly, disable animation, and
write the same screenshot bytes to both metadata paths.

Run:

```bash
pnpm test:unit -- scripts/phase-2-assets.test.ts
```

Expected: failure because the approved generator source does not exist and the current cards use
the prior serif treatment.

- [ ] **Step 2: Implement deterministic local card generation**

Create an ESM script that:

1. resolves repository paths from `import.meta.url`;
2. reads `assets/brand/logo-source.png`;
3. reads
   `node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2`;
4. converts both to data URLs;
5. starts pinned Playwright Chromium;
6. calls `page.setContent()` with a complete fixed-size HTML document and local `@font-face`;
7. waits for `document.fonts.ready` and image decode;
8. screenshots an exact 1200×630 card into a temporary file inside `test-results`;
9. reads the resulting Buffer and writes identical bytes to both Next metadata files;
10. closes the browser in `finally` and removes only its exact temporary file.

Use only escaped, constant project strings in the generated HTML. Do not interpolate CLI or
environment input. Add:

```json
{
  "brand:social": "node scripts/generate-social-card.mjs"
}
```

Run:

```bash
pnpm brand:social
pnpm test:unit -- scripts/phase-2-assets.test.ts src/app/manifest.test.ts
shasum -a 256 src/app/opengraph-image.png src/app/twitter-image.png
file src/app/opengraph-image.png src/app/twitter-image.png
```

Expected: asset tests pass, hashes match, dimensions are 1200×630, and repeated
`pnpm brand:social` produces the same hash. Record that new hash as the exact social-card
expectation in `phase-2-assets.test.ts`.

- [ ] **Step 3: Document ownership and usage**

Create `docs/development/design-system.md` with:

- approved reference boundary and original-identity rule;
- semantic token table and contrast ratios;
- Manrope loading and social-card regeneration;
- component ownership and import rules;
- core/product component inventory;
- controlled-component callback policy;
- responsive shell dimensions;
- keyboard, focus, reduced-motion, forced-colors, and target-size requirements;
- registry review/update procedure for shadcn and Animate UI;
- gallery exposure behavior and the statement that it is not an authorization boundary;
- maintenance presentation behavior and HTTP 503 deferral;
- commands for unit, browser, production-guard, asset, and full checks.

Add a concise README link under development documentation. Do not duplicate the complete design
specification into README.

- [ ] **Step 4: Add browser gates to CI**

First create `scripts/phase-2-ci-workflow.test.ts` using the repository's pinned `yaml` parser.
Parse `.github/workflows/ci.yml` and assert:

- top-level permissions remain exactly `contents: read`;
- quality timeout is 30 minutes;
- Chromium dependency installation uses
  `pnpm exec playwright install --with-deps chromium`;
- normal, maintenance, and production Playwright scripts each occur exactly once after unit tests
  and before the Next build;
- the failure-artifact step uses
  `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`, has
  `if: failure()`, and includes both report directories;
- no deploy command, Cloudflare credential, or write permission is added to the quality job.

Run:

```bash
pnpm test:unit -- scripts/phase-2-ci-workflow.test.ts
```

Expected: failure because CI has not installed Chromium or run the three browser suites.

In `.github/workflows/ci.yml` quality job:

- raise timeout from 15 to 30 minutes;
- after dependency installation, run `pnpm exec playwright install --with-deps chromium`;
- retain formatting, lint, typecheck, unit tests, and build;
- run `pnpm test:e2e`, `pnpm test:e2e:maintenance`, and `pnpm test:e2e:production`;
- upload `playwright-report/` and `test-results/` on failure with
  `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` (`v7.0.1`);
- keep workflow permissions at `contents: read`;
- do not give pull-request code deployment credentials.

Update `package.json`:

```json
{
  "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:e2e && pnpm test:e2e:maintenance && pnpm test:e2e:production && pnpm build"
}
```

If sequential browser servers make this command exceed local resource limits, reduce Playwright
workers to one as already required; do not remove an environment suite.

- [ ] **Step 5: Verify documentation, assets, and CI syntax**

Run:

```bash
pnpm brand:social
pnpm test:unit -- scripts/phase-2-assets.test.ts scripts/phase-2-ci-workflow.test.ts src/app/manifest.test.ts scripts/sequential-release-workflow.test.ts
pnpm exec prettier --check README.md docs/development/design-system.md .github/workflows/ci.yml
pnpm lint
pnpm typecheck
pnpm test:e2e
pnpm test:e2e:maintenance
pnpm test:e2e:production
pnpm build
git diff --check
```

Expected: repeated generation leaves no new diff after the first generated result; all checks pass.

- [ ] **Step 6: Commit assets, documentation, and CI**

```bash
git add scripts/generate-social-card.mjs scripts/phase-2-assets.test.ts scripts/phase-2-ci-workflow.test.ts src/app/opengraph-image.png src/app/twitter-image.png docs/development/design-system.md README.md .github/workflows/ci.yml package.json pnpm-lock.yaml
git commit -m "docs: finalize phase 2 design system"
```

---

### Task 16: Perform the Phase 2 Release Audit

**Files:**

- Modify only files required to fix an observed Phase 2 verification failure
- Do not add features during this task

- [ ] **Step 1: Confirm branch and change scope**

Run:

```bash
git status --short --branch
git log --oneline --decorate -20
git diff main...HEAD --stat
git diff main...HEAD --name-only | sort
```

Expected: no unintended `.superpowers/`, `.DS_Store`, generated build output, environment secret,
or unrelated source file appears. The worktree is clean before final audit fixes.

- [ ] **Step 2: Audit architectural and supply-chain boundaries**

Run:

```bash
pnpm test:unit -- src/tooling/import-boundaries.test.ts
rg -n "@/lib/utils|@/app/|@/features/" src/components
rg -n "https?://|dangerouslySetInnerHTML|eval\\(|new Function|XMLHttpRequest|document\\.cookie|localStorage|sessionStorage" src/components src/app scripts/generate-social-card.mjs
rg -n "fetch\\(" src/components 'src/app/(product)' src/app/design-system
rg -n "fonts\\.googleapis|fonts\\.gstatic" src public
find . -name .DS_Store -type f -not -path './node_modules/*' -not -path './.git/*' -print
```

Expected:

- import-boundary test passes;
- no component imports app/features or `@/lib/utils`;
- no runtime remote font/script/image or prohibited dynamic-code/storage pattern exists;
- any `https://` match is limited to documentation/schema/provenance, not runtime asset loading;
- `fetch(` appears only in existing approved health/deployment code, not Phase 2 product/gallery
  presentation;
- no `.DS_Store` file is printed.

Review every audit match manually. Do not treat a non-empty `rg` result as acceptable without
classifying it.

- [ ] **Step 3: Run all deterministic and browser gates**

Run in this order and observe every exit code:

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

Expected: every command exits `0`. `pnpm test:cf-preview` verifies the redesigned page still
contains `UnseenPrompt` and `Stateful Project Copilot` and that Cloudflare runtime health remains
ready.

- [ ] **Step 4: Inspect production output and local-only gallery behavior**

Run:

```bash
APP_ENV=production NEXT_PUBLIC_APP_URL=https://unseenprompt.com RELEASE_SHA=phase-2 MAINTENANCE_MODE=off pnpm build
rg -n "fonts\\.googleapis|fonts\\.gstatic|promptcowboy" .next/server .next/static
find .next/static -type f | sort | sed -n '1,120p'
```

Expected: build succeeds, no runtime external font or Prompt Cowboy asset/reference is present, and
Manrope is emitted under local Next static assets. Source maps or server source containing the
approved documentation URL are not a runtime request and must be classified separately.

- [ ] **Step 5: Complete the manual gallery matrix**

Start:

```bash
APP_ENV=preview NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 RELEASE_SHA=phase-2 MAINTENANCE_MODE=off pnpm dev
```

Inspect `/` and `/design-system` in Chromium:

| Check                             | 390×844 | 768×1024 | 1024×768 | 1440×900 |
| --------------------------------- | :-----: | :------: | :------: | :------: |
| shell composition                 |    □    |    □     |    □     |    □     |
| no horizontal overflow            |    □    |    □     |    □     |    □     |
| keyboard navigation               |    □    |    □     |    □     |    □     |
| focus never obscured              |    □    |    □     |    □     |    □     |
| long text wraps                   |    □    |    □     |    □     |    □     |
| reduced motion preserves feedback |    □    |    □     |    □     |    □     |
| 200% zoom remains usable          |    □    |    □     |    □     |    □     |
| forced colors preserves state     |    □    |    □     |    □     |    □     |

Also confirm visual direction: warm near-white canvas, white surfaces, Powder Pink only for
selected/subtle grouping, muted rose for actions/focus, independent status colors, restrained
shadows, 12–16px primary radii, Manrope typography, and no Prompt Cowboy branding.

Record failures as specific file/test fixes and rerun the affected automated suite plus the entire
Step 3 command set. Do not mark a cell complete without inspection.

- [ ] **Step 6: Final diff review**

Run:

```bash
git status --short
git diff main...HEAD --check
git diff main...HEAD -- package.json components.json src/config/env/schema.ts src/app/layout.tsx 'src/app/(product)' src/app/design-system src/components playwright.config.ts .github/workflows/ci.yml
```

Confirm:

- no deferred product behavior was introduced;
- no fake link, fake AI result, or editable preview exists;
- production gallery guard and noindex metadata both remain;
- maintenance health isolation remains;
- callbacks and validation match the public contracts;
- generated registry source stays locally owned and audited;
- purposeful metadata duplicates remain;
- no unrelated user change was overwritten.

- [ ] **Step 7: Commit only observed audit fixes**

If Step 1–6 required source corrections, stage the exact corrected files and commit:

```bash
git diff --name-only
git add -p
git diff --cached --check
git commit -m "fix: close phase 2 verification gaps"
```

Review every selected hunk in `git add -p`; decline unrelated changes. If no correction was needed,
do not create an empty commit.

---

## Requirements Coverage Matrix

| Approved requirement                           | Implementation tasks | Primary verification                         |
| ---------------------------------------------- | -------------------- | -------------------------------------------- |
| Supplied logo and purposeful derivatives       | 1, 15                | asset/manifest tests and metadata build      |
| `.DS_Store` cleanup and `.superpowers/` ignore | 1, 16                | explicit find/audit                          |
| Whisper Pink semantic tokens and contrast      | 3                    | deterministic contrast tests                 |
| Manrope Variable, local runtime font           | 3, 15, 16            | layout test and production output audit      |
| Tailwind v4 and shadcn/Radix local ownership   | 3–5                  | registry audit, unit tests, import tests     |
| Animate UI icon-only use                       | 6                    | source audit and reduced-motion browser test |
| Core UI component inventory                    | 4–5, 9               | component tests and gallery inventory        |
| Product component inventory                    | 7–9                  | typed component tests and gallery inventory  |
| Fixed desktop/mobile Sheet shell               | 10                   | jsdom focus tests and four browser viewports |
| Honest, non-functional homepage preview        | 12                   | source audit and browser request assertions  |
| Loading/error/global/not-found boundaries      | 11                   | boundary tests and build                     |
| Validated maintenance presentation             | 2, 11                | schema, layout, and maintenance E2E tests    |
| Gallery non-production exposure/noindex        | 13                   | unit and production E2E guard                |
| Keyboard, focus, reduced motion, forced colors | 4–14                 | unit interactions, axe, Playwright           |
| Visual regression                              | 14                   | pinned Chromium screenshot suite             |
| Cloudflare compatibility and health isolation  | 2, 16                | Workers checks/build/preview                 |
| Documentation and CI enforcement               | 15                   | format, workflow tests, CI browser gates     |

## Deferred Scope

The following remain outside Phase 2 and must not be added while executing this plan:

- functional discovery, prompt generation, or AI provider calls;
- authentication, profile behavior, account navigation, or authorization;
- project persistence, project library data, Supabase reads/writes, or local storage;
- file input, upload, parsing, object storage, or malware scanning;
- billing, usage calculation, analytics, production telemetry, or customer content;
- dark mode;
- HTTP 503 enforcement at the Cloudflare edge;
- autonomous repository, IDE, or local-machine execution.

## Executor Handoff

After Task 1 commits the user-supplied brand assets, the remaining tasks may be executed in an
isolated worktree or delegated task-by-task. Each task has an independent commit boundary; keep
dependent order intact:

```text
1 → 2 → 3 → 4 → 5 → 6
                    ├→ 7
                    ├→ 8
                    └→ 9
7 + 8 + 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16
```

Tasks 7, 8, and 9 may run in parallel only after Tasks 1–6 are committed, because they share the
generic primitive and icon contracts. All route, gallery, browser, asset-generation, CI, and final
audit tasks remain ordered.
