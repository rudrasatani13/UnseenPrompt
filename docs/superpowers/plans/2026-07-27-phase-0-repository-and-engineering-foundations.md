# Phase 0 — Repository and Engineering Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a reproducible, security-conscious Next.js repository that enforces UnseenPrompt's engineering conventions and passes local and continuous-integration quality gates, including a Cloudflare Workers preview smoke test.

**Architecture:** Build one deployable Next.js App Router application rather than a monorepo or premature service split. Keep domain rules, feature code, shared infrastructure, reusable UI, and routes in separate import layers inside `src/`; keep Supabase migrations/tests, Cloudflare adapter configuration, test support, and documentation at repository root. Phase 0 proves the toolchain and runtime packaging only; environment topology, remote Cloudflare resources, authentication, database schema, and product UI belong to later phases.

**Tech Stack:** Node.js 24 LTS, pnpm 11, Next.js 16 App Router, React 19, strict TypeScript, ESLint flat config, Prettier, Zod, Vitest, React Testing Library, Supabase CLI with pgTAP, OpenNext Cloudflare adapter, Wrangler, GitHub Actions.

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
- Do not create remote Cloudflare, Supabase, Sentry, PostHog, Paddle, or AI-provider resources in Phase 0.
- Do not commit `.env*`, `.dev.vars*`, credentials, tokens, service-role keys, provider keys, or generated build output.
- Use the exact direct-dependency versions recorded in this plan and commit `pnpm-lock.yaml`; dependency upgrades require a separate reviewed change.
- Run all GitHub Actions with `permissions: contents: read`; do not grant write or OIDC permissions in Phase 0.

---

## Execution Contract

### Preconditions

- Run from `/Users/rudrasatani/Desktop/UnseenPrompt`.
- Read `docs/UnseenPrompt – Stateful Project Copilot.md` and `docs/UnseenPrompt – DEVELOPMENT_PLAN.md` before editing.
- Use an isolated `codex/phase-0-foundations` branch or worktree; never implement directly on protected `main`.
- Require Node.js 24.x, Git, and pnpm 11.17.0. Docker is not required on developer machines.
- Preserve unrelated changes. If the worktree is not clean, stop before scaffolding and report the overlapping files.

### Definition of Done

All of these local commands must exit with status `0` from a fresh clone after copying `.env.example` to `.env.local`:

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

The GitHub Actions `database` job must start an isolated database with `supabase db start` and then pass `pnpm test:db`. Shared staging and production are never unit-test targets.

The negative environment test must also pass:

```bash
pnpm test:unit -- src/config/env/schema.test.ts
```

GitHub Actions must pass the `quality`, `database`, and `cloudflare-preview` jobs on a pull request. No real secret may appear in tracked files, build logs, `.next/`, or `.open-next/`.

### Scope Boundary

| Included in Phase 0                                         | Explicitly deferred                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Repository skeleton and import layers                       | Product features and state engine                                 |
| Toolchain and pinned lockfile                               | Remote environment provisioning                                   |
| Environment schema and dummy template                       | Real credentials and secret injection                             |
| Unit/component test harness                                 | End-to-end product journeys                                       |
| Local Supabase configuration and pgTAP smoke test           | Application schema, RLS, Auth, and Storage policies               |
| Minimal OpenNext build/preview proof                        | Cloudflare environment topology, deployments, bindings, Workflows |
| CI quality gates                                            | Release automation                                                |
| Engineering and security documentation                      | Operational runbooks for implemented services                     |
| UnseenPrompt identity metadata and neutral placeholder page | Warm Editorial design system and application shell                |

---

## Planned File Map

```text
.
├── .env.example                     # Committed dummy-only environment contract
├── .github/workflows/ci.yml         # Read-only CI quality gates
├── .gitignore                       # Secrets and generated-output exclusions
├── .node-version                    # Node 24 development/CI contract
├── .prettierignore
├── .prettierrc.json
├── CONTRIBUTING.md                  # Local workflow, commits, review requirements
├── README.md                        # Product identity and bootstrap instructions
├── SECURITY.md                      # Reporting and secret-handling policy
├── eslint.config.mjs                # Next.js rules plus architectural boundaries
├── next.config.ts                   # Next.js and local OpenNext initialization
├── next-env.d.ts                    # Next.js generated TypeScript declarations
├── open-next.config.ts              # Minimal OpenNext adapter configuration
├── package.json                     # Exact direct dependencies and canonical scripts
├── pnpm-lock.yaml                   # Reproducible dependency graph
├── public/_headers                  # Immutable Next.js static-asset caching
├── scripts/assert-cloudflare-preview.mjs
├── src/
│   ├── app/globals.css
│   ├── app/layout.tsx
│   ├── app/page.test.tsx
│   ├── app/page.tsx
│   ├── components/README.md
│   ├── config/env/schema.test.ts
│   ├── config/env/schema.ts
│   ├── config/env/server.ts
│   ├── domain/README.md
│   ├── features/README.md
│   ├── lib/README.md
│   └── tooling/import-boundaries.test.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/.gitkeep
│   └── tests/database/00000_smoke.test.sql
├── tests/fixtures/README.md
├── tsconfig.json
├── vitest.config.mts
├── vitest.setup.ts
├── wrangler.jsonc
└── docs/
    ├── architecture/phase-0-foundations.md
    ├── conventions/naming.md
    ├── development/environment-contract.md
    └── superpowers/plans/2026-07-27-phase-0-repository-and-engineering-foundations.md
```

Responsibility rules:

- `src/domain/**` contains framework-independent domain types and deterministic rules. It may import only other `src/domain/**` modules.
- `src/lib/**` contains shared technical adapters and utilities. It may import `src/domain/**`, but not routes, features, or UI components.
- `src/features/**` owns feature-specific behavior and may import `src/domain/**`, `src/lib/**`, and `src/components/**`.
- `src/components/**` contains reusable presentation components. It must not import routes or feature internals.
- `src/app/**` is the composition and routing layer and may consume every lower layer.
- `src/config/**` owns validated configuration. Client modules must never import server-only configuration.
- `supabase/**` owns local database configuration, versioned migrations, and database tests.

---

### Task 1: Establish the Runtime and Package Contract

**Files:**

- Create: `.node-version`
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `.gitignore`
- Create: `next-env.d.ts`
- Create: `tsconfig.json`

**Interfaces:**

- Consumes: Node.js 24.x and npm available on the execution host.
- Produces: canonical `pnpm` scripts and `@/* -> ./src/*` TypeScript imports used by every later task.

- [ ] **Step 1: Confirm an isolated, clean implementation branch**

Run:

```bash
git status --short --branch
git branch --show-current
node --version
docker version
```

Expected: branch is `codex/phase-0-foundations` (or an equivalent isolated worktree branch), status has no unrelated changes, and Node reports `v24.x`.

- [ ] **Step 2: Create the runtime marker**

Create `.node-version`:

```text
24
```

- [ ] **Step 3: Create the exact package manifest**

Create `package.json`:

```json
{
  "name": "unseenprompt",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@11.17.0",
  "engines": {
    "node": ">=24 <25",
    "pnpm": ">=11 <12"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:db": "supabase test db",
    "cf:build": "opennextjs-cloudflare build",
    "cf:preview": "opennextjs-cloudflare preview --port 8787",
    "test:preview:assert": "node scripts/assert-cloudflare-preview.mjs",
    "test:cf-preview": "start-server-and-test cf:preview http://127.0.0.1:8787 test:preview:assert",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build"
  },
  "dependencies": {
    "next": "16.2.12",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "server-only": "0.0.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@opennextjs/cloudflare": "1.20.2",
    "@testing-library/dom": "10.4.1",
    "@testing-library/jest-dom": "7.0.0",
    "@testing-library/react": "16.3.2",
    "@types/node": "24.13.3",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.4",
    "eslint": "9.39.5",
    "eslint-config-next": "16.2.12",
    "eslint-config-prettier": "10.1.8",
    "jsdom": "30.0.0",
    "prettier": "3.9.6",
    "start-server-and-test": "3.0.11",
    "supabase": "2.109.1",
    "tsx": "4.23.1",
    "typescript": "6.0.3",
    "vitest": "4.1.10",
    "wrangler": "4.114.0"
  }
}
```

- [ ] **Step 4: Create strict TypeScript configuration**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", "**/*.ts", "**/*.tsx", "**/*.mts"],
  "exclude": ["node_modules", ".open-next"]
}
```

Create `next-env.d.ts` using the standard Next.js declarations:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited.
// See https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

- [ ] **Step 5: Exclude secrets and generated artifacts**

Create `.gitignore`:

```gitignore
node_modules/
.next/
.open-next/
.wrangler/
coverage/
test-results/
playwright-report/
*.tsbuildinfo

.env
.env.*
!.env.example
.dev.vars
.dev.vars.*
!.dev.vars.example

supabase/.branches/
supabase/.temp/

.DS_Store
*.log
```

- [ ] **Step 6: Install and lock dependencies**

Run:

```bash
npm install --global pnpm@11.17.0
pnpm install
pnpm install --frozen-lockfile
```

Expected: both installs succeed, `pnpm-lock.yaml` exists, and the frozen install makes no tracked changes.

- [ ] **Step 7: Commit the runtime contract**

```bash
git add .node-version package.json pnpm-lock.yaml .gitignore next-env.d.ts tsconfig.json
git commit -m "chore: establish runtime and package contract"
```

---

### Task 2: Add Formatting, Linting, and Import Boundaries

**Files:**

- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `eslint.config.mjs`
- Create: `src/domain/README.md`
- Create: `src/lib/README.md`
- Create: `src/components/README.md`
- Create: `src/features/README.md`
- Test: `src/tooling/import-boundaries.test.ts`

**Interfaces:**

- Consumes: `@/*` alias from Task 1.
- Produces: enforced one-way dependencies `app -> features/components/lib/domain`, `features -> components/lib/domain`, `lib -> domain`.

- [ ] **Step 1: Add regression tests for alias and relative import boundaries**

Create `src/tooling/import-boundaries.test.ts`:

```ts
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function lintFrom(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, {
    filePath: path.join(process.cwd(), filePath),
  });

  return result?.messages ?? [];
}

describe("architectural import boundaries", () => {
  it("rejects relative imports from lib into app", async () => {
    const messages = await lintFrom("src/lib/boundary-fixture.ts", 'import "../app/page";');

    expect(messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ messageId: "crossLayerImport" })]),
    );
  });

  it("rejects alias imports from domain into features", async () => {
    const messages = await lintFrom(
      "src/domain/boundary-fixture.ts",
      'import "@/features/project";',
    );

    expect(messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ messageId: "crossLayerImport" })]),
    );
  });
});
```

Run `pnpm test:unit -- src/tooling/import-boundaries.test.ts`.

Expected: FAIL because the existing alias-only restriction does not emit `crossLayerImport` and does not reject the relative path.

- [ ] **Step 2: Configure Prettier**

Create `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

Create `.prettierignore`:

```text
.next
.open-next
coverage
node_modules
pnpm-lock.yaml
docs/UnseenPrompt – DEVELOPMENT_PLAN.md
docs/UnseenPrompt – Stateful Project Copilot.md
```

- [ ] **Step 3: Configure Next.js lint rules and import boundaries**

Create `eslint.config.mjs`:

```js
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier/flat";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(repositoryRoot, "src");

const forbiddenDependencies = new Map([
  ["domain", new Set(["app", "components", "config", "features", "lib"])],
  ["config", new Set(["app", "components", "features", "lib"])],
  ["lib", new Set(["app", "components", "features"])],
  ["components", new Set(["app", "features"])],
  ["features", new Set(["app"])],
]);

function sourceLayer(filePath) {
  const relativePath = path.relative(sourceRoot, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath.split(path.sep)[0] ?? null;
}

function importedLayer(importerPath, importSource) {
  let importedPath;

  if (importSource.startsWith("@/")) {
    importedPath = path.join(sourceRoot, importSource.slice(2));
  } else if (importSource.startsWith(".")) {
    importedPath = path.resolve(path.dirname(importerPath), importSource);
  } else {
    return null;
  }

  return sourceLayer(importedPath);
}

const architecturePlugin = {
  rules: {
    "no-cross-layer-imports": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          crossLayerImport:
            "{{sourceLayer}} modules must not import from the {{targetLayer}} layer.",
        },
      },
      create(context) {
        const importerPath = context.filename;
        const importerLayer = sourceLayer(importerPath);
        const forbiddenLayers = forbiddenDependencies.get(importerLayer);

        function checkImportSource(node) {
          if (!forbiddenLayers || typeof node.value !== "string") {
            return;
          }

          const targetLayer = importedLayer(importerPath, node.value);

          if (targetLayer && forbiddenLayers.has(targetLayer)) {
            context.report({
              node,
              messageId: "crossLayerImport",
              data: { sourceLayer: importerLayer, targetLayer },
            });
          }
        }

        return {
          ImportDeclaration: (node) => checkImportSource(node.source),
          ExportAllDeclaration: (node) => checkImportSource(node.source),
          ExportNamedDeclaration: (node) => {
            if (node.source) {
              checkImportSource(node.source);
            }
          },
          ImportExpression: (node) => checkImportSource(node.source),
        };
      },
    },
  },
};

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  eslintConfigPrettier,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      architecture: architecturePlugin,
    },
    rules: {
      "architecture/no-cross-layer-imports": "error",
    },
  },
  globalIgnores([".next/**", ".open-next/**", "coverage/**", "next-env.d.ts"]),
]);
```

- [ ] **Step 4: Verify the regression tests pass**

Run:

```bash
pnpm test:unit -- src/tooling/import-boundaries.test.ts
```

Expected: both alias and relative-path cases pass by observing `architecture/no-cross-layer-imports`.

- [ ] **Step 5: Document each layer**

In each layer README, state its responsibility, permitted imports, forbidden imports, and give one representative future module name. Do not add placeholder production modules solely to preserve directories.

- [ ] **Step 6: Verify formatting and linting**

Run:

```bash
pnpm format
pnpm format:check
pnpm lint
```

Expected: all commands pass after formatting.

- [ ] **Step 7: Commit the engineering boundaries**

```bash
git add .prettierrc.json .prettierignore eslint.config.mjs src
git commit -m "chore: enforce formatting and import boundaries"
```

---

### Task 3: Implement Fail-Closed Environment Validation

**Files:**

- Create: `.env.example`
- Create: `src/config/env/schema.ts`
- Create: `src/config/env/schema.test.ts`
- Create: `src/config/env/server.ts`

**Interfaces:**

- Produces: `parseEnvironment(values: Record<string, string | undefined>): AppEnvironment`
- Produces: `getServerEnvironment(): AppEnvironment`
- Produces type:

```ts
export type AppEnvironment = {
  APP_ENV: "local" | "preview" | "staging" | "production" | "test";
  NEXT_PUBLIC_APP_URL: string;
};
```

- [ ] **Step 1: Write failing environment-schema tests**

Create `src/config/env/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/config/env/schema";

describe("parseEnvironment", () => {
  it("accepts the committed local-development contract", () => {
    expect(
      parseEnvironment({
        APP_ENV: "local",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      }),
    ).toEqual({
      APP_ENV: "local",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
  });

  it("fails when a required value is absent", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "local",
        NEXT_PUBLIC_APP_URL: undefined,
      }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("rejects unsupported environments and malformed URLs", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "prod",
        NEXT_PUBLIC_APP_URL: "unseenprompt.com",
      }),
    ).toThrow();
  });

  it("rejects non-HTTP application URLs", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "production",
        NEXT_PUBLIC_APP_URL: "javascript:alert(1)",
      }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("requires HTTPS outside local and test environments", () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_URL: "http://staging.unseenprompt.com",
      }),
    ).toThrow(/HTTPS/);
  });
});
```

- [ ] **Step 2: Run the tests and confirm the missing module failure**

Run:

```bash
pnpm test:unit -- src/config/env/schema.test.ts
```

Expected: FAIL because `@/config/env/schema` does not exist.

- [ ] **Step 3: Implement the pure environment parser**

Create `src/config/env/schema.ts`:

```ts
import { z } from "zod";

const applicationUrlSchema = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  },
  {
    message: "NEXT_PUBLIC_APP_URL must use HTTP or HTTPS",
  },
);

const environmentSchema = z
  .object({
    APP_ENV: z.enum(["local", "preview", "staging", "production", "test"]),
    NEXT_PUBLIC_APP_URL: applicationUrlSchema,
  })
  .superRefine((environment, context) => {
    const requiresHttps = environment.APP_ENV === "staging" || environment.APP_ENV === "production";

    if (requiresHttps && new URL(environment.NEXT_PUBLIC_APP_URL).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_APP_URL"],
        message: "HTTPS is required in staging and production",
      });
    }
  })
  .readonly();

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(values: Record<string, string | undefined>): AppEnvironment {
  return environmentSchema.parse(values);
}
```

Create `src/config/env/server.ts`:

```ts
import "server-only";

import { type AppEnvironment, parseEnvironment } from "@/config/env/schema";

export function getServerEnvironment(): AppEnvironment {
  return parseEnvironment({
    APP_ENV: process.env.APP_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}
```

- [ ] **Step 4: Add the dummy-only environment template**

Create `.env.example`:

```dotenv
# Safe local defaults only. Never put credentials in this file.
APP_ENV=local
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Prove positive and negative behavior**

Run:

```bash
pnpm test:unit -- src/config/env/schema.test.ts
pnpm exec tsx -e 'import { parseEnvironment } from "./src/config/env/schema.ts"; parseEnvironment({})'
```

Expected: the Vitest suite passes; the second command exits non-zero and names both required fields. Do not replace the check with a command that silently supplies defaults.

- [ ] **Step 6: Commit environment validation**

```bash
git add .env.example src/config/env package.json pnpm-lock.yaml
git commit -m "feat: add fail-closed environment validation"
```

---

### Task 4: Create the Minimal Branded App and Unit-Test Harness

**Files:**

- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/page.test.tsx`
- Create: `vitest.config.mts`
- Create: `vitest.setup.ts`

**Interfaces:**

- Consumes: `getServerEnvironment()` from Task 3.
- Produces: a neutral root page containing the accessible name `UnseenPrompt` and metadata prepared for `unseenprompt.com`.

- [ ] **Step 1: Configure Vitest**

Create `vitest.config.mts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
```

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Write the failing identity test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("identifies the product without claiming unavailable functionality", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "UnseenPrompt" })).toBeInTheDocument();
    expect(screen.getByText("Stateful Project Copilot")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Verify the page test fails**

Run:

```bash
pnpm test:unit -- src/app/page.test.tsx
```

Expected: FAIL because `src/app/page.tsx` does not exist.

- [ ] **Step 4: Implement only the Phase 0 app surface**

Create `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main>
      <p>Stateful Project Copilot</p>
      <h1>UnseenPrompt</h1>
      <p>Platform foundation in progress.</p>
    </main>
  );
}
```

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerEnvironment } from "@/config/env/server";

import "./globals.css";

const environment = getServerEnvironment();

export const metadata: Metadata = {
  metadataBase: new URL(environment.NEXT_PUBLIC_APP_URL),
  title: {
    default: "UnseenPrompt",
    template: "%s · UnseenPrompt",
  },
  description: "Stateful Project Copilot for AI-assisted web development.",
  applicationName: "UnseenPrompt",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/globals.css` with only a minimal reset and readable system-font layout. Do not introduce the Powder Pink tokens, component system, font assets, animations, or production shell reserved for Phase 2.

```css
* {
  box-sizing: border-box;
}

html {
  color-scheme: light;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

body {
  min-height: 100vh;
  margin: 0;
}

main {
  width: min(100% - 2rem, 48rem);
  margin-inline: auto;
  padding-block: 4rem;
}
```

- [ ] **Step 5: Verify the app and harness**

Create local environment values, then run:

```bash
cp .env.example .env.local
pnpm test:unit
pnpm typecheck
pnpm build
```

Expected: the unit tests, typecheck, and production build pass.

- [ ] **Step 6: Commit the app baseline**

```bash
git add src/app vitest.config.mts vitest.setup.ts
git commit -m "feat: add tested application identity baseline"
```

---

### Task 5: Add Local Supabase and Database-Test Foundations

**Files:**

- Create: `supabase/config.toml`
- Create: `supabase/migrations/.gitkeep`
- Create: `supabase/tests/database/00000_smoke.test.sql`

**Interfaces:**

- Produces: `pnpm test:db`, which runs pgTAP against an isolated database on a GitHub-hosted Actions runner.
- Does not produce application tables, policies, seed users, or remote project links.

- [ ] **Step 1: Initialize the local Supabase directory**

Run:

```bash
pnpm exec supabase init
```

Expected: `supabase/config.toml` is created with project ID `UnseenPrompt` or normalize its `project_id` to `unseenprompt`.

- [ ] **Step 2: Write the database smoke test**

Create `supabase/tests/database/00000_smoke.test.sql`:

```sql
begin;

select plan(2);

select has_schema('auth', 'Supabase auth schema is available');
select has_column('auth', 'users', 'id', 'auth.users has its UUID identity column');

select * from finish();

rollback;
```

Keep `supabase/migrations/.gitkeep` so Phase 3 has a versioned migration location without inventing schema early.

- [ ] **Step 3: Keep the database test off developer machines**

Do not link the local checkout to staging or production and do not start Supabase Docker locally. The test is executed only after the CI workflow starts its isolated database.

- [ ] **Step 4: Start only the database service on the GitHub-hosted runner**

Run:

```bash
pnpm exec supabase db start
pnpm test:db
pnpm exec supabase stop --no-backup
```

Expected: pgTAP reports `Files=1, Tests=2` and `Result: PASS`; the CI database stops cleanly.

- [ ] **Step 5: Verify no remote link or secret was created**

Run:

```bash
git status --short
git ls-files supabase
rg -n --hidden '(service_role|access_token|refresh_token|password\s*=)' supabase .env.example
```

Expected: only intended config/test/migration-marker files are trackable, `supabase/.temp` is ignored, and the secret scan finds no credential value.

- [ ] **Step 6: Commit database-test foundations**

```bash
git add supabase package.json pnpm-lock.yaml
git commit -m "test: add local Supabase database smoke suite"
```

---

### Task 6: Prove the Cloudflare Workers Preview Bundle

**Files:**

- Create: `next.config.ts`
- Create: `open-next.config.ts`
- Create: `wrangler.jsonc`
- Create: `public/_headers`
- Create: `scripts/assert-cloudflare-preview.mjs`

**Interfaces:**

- Produces: `.open-next/worker.js` from `pnpm cf:build`.
- Produces: a local Workers-runtime preview on `127.0.0.1:8787`.
- Does not create remote workers, routes, DNS records, R2 buckets, Workflows, or deployment credentials.

- [ ] **Step 1: Add minimal OpenNext integration**

Create `next.config.ts`:

```ts
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;

initOpenNextCloudflareForDev();
```

Create `open-next.config.ts`:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
```

- [ ] **Step 2: Add the non-deploying Worker configuration**

Create `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "unseenprompt",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-07-27",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS",
  },
  "vars": {
    "APP_ENV": "preview",
    "NEXT_PUBLIC_APP_URL": "http://127.0.0.1:8787",
  },
}
```

Do not add account IDs, routes, environment blocks, secrets, bindings, or `deploy` scripts; those are Phase 1.

- [ ] **Step 3: Add required static asset caching**

Create `public/_headers`:

```text
/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
```

- [ ] **Step 4: Write the preview assertion before building**

Create `scripts/assert-cloudflare-preview.mjs`:

```js
const response = await fetch("http://127.0.0.1:8787/");
const body = await response.text();

if (!response.ok) {
  throw new Error(`Cloudflare preview returned HTTP ${response.status}`);
}

if (!body.includes("UnseenPrompt") || !body.includes("Stateful Project Copilot")) {
  throw new Error("Cloudflare preview did not render the UnseenPrompt identity");
}
```

Run:

```bash
pnpm test:cf-preview
```

Expected: FAIL because `.open-next/worker.js` has not been built.

- [ ] **Step 5: Build and exercise the Workers preview**

Run:

```bash
APP_ENV=preview NEXT_PUBLIC_APP_URL=http://127.0.0.1:8787 pnpm cf:build
test -f .open-next/worker.js
pnpm test:cf-preview
```

Expected: OpenNext creates `.open-next/worker.js`; the local Wrangler preview starts, the assertion passes, and `start-server-and-test` terminates the preview process.

- [ ] **Step 6: Confirm generated output is untracked**

Run:

```bash
git status --short --ignored
git check-ignore .open-next/worker.js .next
```

Expected: both generated paths are ignored and no build output is staged.

- [ ] **Step 7: Commit Cloudflare preview support**

```bash
git add next.config.ts open-next.config.ts wrangler.jsonc public/_headers scripts
git commit -m "chore: validate Cloudflare Workers preview packaging"
```

---

### Task 7: Add Documentation and Naming Contracts

**Files:**

- Create: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `docs/architecture/phase-0-foundations.md`
- Create: `docs/conventions/naming.md`
- Create: `docs/development/environment-contract.md`
- Test: `tests/fixtures/README.md`

**Interfaces:**

- Consumes: all paths, scripts, and boundaries established in Tasks 1–6.
- Produces: the human/agent operating contract for later phases.

- [ ] **Step 1: Write the repository README**

Include, in this order:

1. `UnseenPrompt — Stateful Project Copilot`
2. Status: `Pre-development; Phase 0 foundation`
3. Explicit non-capabilities: no repository access, autonomous execution, team accounts, or production service connections
4. Prerequisites: Node 24.x and pnpm 11.17.0; explicitly state that Docker is not required locally
5. Bootstrap commands: copy `.env.example`, frozen install, local development
6. Canonical quality commands from the Definition of Done
7. Documentation links to both approved plans, architecture, naming, environment contract, contributing, and security

- [ ] **Step 2: Write the architecture foundation document**

`docs/architecture/phase-0-foundations.md` must record:

- Decision: single deployable Next.js repository, not a monorepo.
- Dependency direction and trust boundaries for `app`, `features`, `components`, `lib`, `domain`, `config`, `supabase`, and external providers.
- Server-only secret boundary: only server modules may read non-`NEXT_PUBLIC_` values.
- State boundary: models will be untrusted proposal producers; deterministic application code and the database will own state in later phases.
- Runtime boundary: local Node builds are necessary but insufficient; OpenNext/Workers preview is mandatory.
- Deferred decisions: remote environment topology (Phase 1), visual system (Phase 2), schema/RLS (Phase 3), auth/profile (Phase 4), AI providers (Phase 5).
- Failure modes: missing environment values, cross-layer imports, database unavailability, incompatible Worker dependencies, preview startup failure.

- [ ] **Step 3: Write exact naming rules**

`docs/conventions/naming.md` must specify:

| Item                  | Convention                                               | Example                              |
| --------------------- | -------------------------------------------------------- | ------------------------------------ |
| Domain types          | PascalCase, singular                                     | `ProjectDecision`                    |
| Functions/variables   | camelCase, verb-led functions                            | `confirmDecision`                    |
| React components      | PascalCase file and export                               | `ProjectComposer.tsx`                |
| Route segments        | lowercase kebab-case                                     | `project-history`                    |
| Feature folders       | lowercase kebab-case                                     | `prompt-generation`                  |
| Unit/component tests  | adjacent `*.test.ts(x)`                                  | `schema.test.ts`                     |
| Database tests        | five-digit order + snake_case                            | `00010_projects_rls.test.sql`        |
| Migrations            | Supabase UTC timestamp + snake_case                      | `20260727120000_create_projects.sql` |
| SQL identifiers       | snake_case, plural tables                                | `prompt_versions`                    |
| Environment variables | SCREAMING_SNAKE_CASE; public values start `NEXT_PUBLIC_` | `APP_ENV`                            |
| Workflow classes      | PascalCase ending `Workflow`                             | `ArtifactExtractionWorkflow`         |
| Fixtures              | lowercase kebab-case plus intent                         | `new-build-beginner.json`            |
| Correlation IDs       | opaque UUID; never encode user data                      | `correlationId`                      |

Also prohibit ambiguous abbreviations, provider names in canonical domain types, and secrets in filenames, fixtures, snapshots, logs, or error messages.

- [ ] **Step 4: Write the environment contract**

`docs/development/environment-contract.md` must contain a matrix:

| Variable              | Visibility | Local     | Preview             | Staging           | Production                 | Owner    |
| --------------------- | ---------- | --------- | ------------------- | ----------------- | -------------------------- | -------- |
| `APP_ENV`             | Server     | `local`   | `preview`           | `staging`         | `production`               | Platform |
| `NEXT_PUBLIC_APP_URL` | Public     | localhost | ephemeral HTTPS URL | staging HTTPS URL | `https://unseenprompt.com` | Platform |

State that future variables are added only in the phase introducing their consumer; every addition requires schema tests, `.env.example` dummy values where safe, CI/deployment configuration, and documentation. Secrets must never receive dummy-looking production-shaped values in a public variable.

- [ ] **Step 5: Write contribution and security policies**

`CONTRIBUTING.md` must require small scoped commits, tests before implementation for behavior changes, frozen installs, no warning suppression, no direct commits to protected branches, and the full relevant gate set.

`SECURITY.md` must define a private vulnerability-reporting route as “repository security advisory” until a dedicated address exists; prohibit public issue disclosure of exploitable findings; define secret revocation as the first response to accidental exposure; and forbid placing customer/project content in fixtures or logs.

`tests/fixtures/README.md` must require synthetic, non-identifying, secret-free fixtures and document intent, skill level, input language, and expected lifecycle mode for future AI evaluation fixtures.

- [ ] **Step 6: Verify documents match implemented names**

Run:

```bash
rg -n 'npm run|yarn|Node 20|Node 22|next-on-pages|\.env\.production' README.md CONTRIBUTING.md SECURITY.md docs src
rg -n 'pnpm (format:check|lint|typecheck|test:unit|test:db|cf:build|test:cf-preview)' README.md CONTRIBUTING.md
```

Expected: the first search returns no outdated tool/runtime instructions; the second finds the canonical commands where documented.

- [ ] **Step 7: Commit documentation**

```bash
git add README.md CONTRIBUTING.md SECURITY.md docs src tests
git commit -m "docs: define repository engineering conventions"
```

---

### Task 8: Build the Continuous-Integration Quality Pipeline

**Files:**

- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: canonical scripts from `package.json`.
- Produces required jobs: `quality`, `database`, and `cloudflare-preview`.

- [ ] **Step 1: Create a least-privilege CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: Continuous Integration

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  CI: "true"
  APP_ENV: test
  NEXT_PUBLIC_APP_URL: http://localhost:3000
  PNPM_VERSION: 11.17.0
  NODE_VERSION: 24

jobs:
  quality:
    name: Quality
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Check out repository
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: ${{ env.NODE_VERSION }}
      - name: Install pnpm
        run: npm install --global pnpm@${PNPM_VERSION}
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Check formatting
        run: pnpm format:check
      - name: Lint
        run: pnpm lint
      - name: Typecheck
        run: pnpm typecheck
      - name: Run unit tests
        run: pnpm test:unit
      - name: Build Next.js
        run: pnpm build

  database:
    name: Database
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Check out repository
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: ${{ env.NODE_VERSION }}
      - name: Install pnpm
        run: npm install --global pnpm@${PNPM_VERSION}
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Start isolated test database
        run: pnpm exec supabase db start
      - name: Run database tests
        run: pnpm test:db
      - name: Stop isolated test database
        if: always()
        run: pnpm exec supabase stop --no-backup

  cloudflare-preview:
    name: Cloudflare Preview
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Check out repository
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: ${{ env.NODE_VERSION }}
      - name: Install pnpm
        run: npm install --global pnpm@${PNPM_VERSION}
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Build Workers bundle
        run: pnpm cf:build
      - name: Assert bundle entry point
        run: test -f .open-next/worker.js
      - name: Smoke-test Workers preview
        run: pnpm test:cf-preview
```

- [ ] **Step 2: Lint workflow syntax locally**

Run:

```bash
pnpm dlx yaml-lint@1.7.0 .github/workflows/ci.yml
```

Expected: PASS. Do not add `yaml-lint` to production or dev dependencies for this one-time plan validation.

- [ ] **Step 3: Run every CI command locally in CI mode**

Run:

```bash
CI=true APP_ENV=test NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm install --frozen-lockfile
CI=true APP_ENV=test NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm check
CI=true APP_ENV=test NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm cf:build
CI=true APP_ENV=test NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm test:cf-preview
```

Expected: every local command exits `0`. Push the branch and confirm the GitHub Actions `database` job starts its isolated database and passes `pnpm test:db`.

- [ ] **Step 4: Commit CI**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add foundation quality gates"
```

---

### Task 9: Perform the Phase 0 Security and Completion Gate

**Files:**

- Modify only files that fail the checks below.
- Do not add suppressions or weaken a gate to make validation pass.

**Interfaces:**

- Consumes: all Phase 0 deliverables.
- Produces: auditable evidence that every Phase 0 exit criterion is met.

- [ ] **Step 1: Reinstall from the committed lockfile**

Run:

```bash
pnpm install --frozen-lockfile
git diff --exit-code -- package.json pnpm-lock.yaml
```

Expected: install succeeds and the dependency contract remains unchanged.

- [ ] **Step 2: Run the full static and application suite**

Run:

```bash
APP_ENV=test NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm format:check
APP_ENV=test NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm lint
APP_ENV=test NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm typecheck
APP_ENV=test NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm test:unit
APP_ENV=test NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm build
```

Expected: all five gates pass with zero warnings treated as errors by lint.

- [ ] **Step 3: Re-run database and Workers-runtime gates**

Run:

```bash
APP_ENV=preview NEXT_PUBLIC_APP_URL=http://127.0.0.1:8787 pnpm cf:build
APP_ENV=preview NEXT_PUBLIC_APP_URL=http://127.0.0.1:8787 pnpm test:cf-preview
```

Expected: the bundle exists and the Workers preview renders the product identity. Confirm the database smoke test separately in the GitHub Actions `database` job.

- [ ] **Step 4: Scan tracked content for likely secrets and generated files**

Run:

```bash
git ls-files -z | xargs -0 rg -n -i \
  '(sk-[a-z0-9_-]{16,}|service_role|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|api[_-]?key\s*[:=]\s*[^$< ]+|password\s*[:=]\s*[^$< ]+)'
git ls-files '.env*' '.dev.vars*' '.next/**' '.open-next/**' 'supabase/.temp/**'
```

Expected: the first command returns no real credential material; documentation-only words such as `service_role` must be manually reviewed. The second command lists only `.env.example` and no generated or secret-bearing path.

- [ ] **Step 5: Verify plan coverage and repository state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -10
git diff main...HEAD --stat
```

Confirm manually:

- Repository skeleton covers application, domain, features, shared code, tests, migrations, Cloudflare config, and docs.
- Strict typing, formatting, linting, import boundaries, and environment validation are enforced.
- Naming conventions cover every entity named in the approved Phase 0 task.
- Local/preview/staging/production environment contracts are documented without credentials.
- CI contains lint, typecheck, unit, database, build, and Workers preview gates.
- Both approved source plans remain present and unchanged.
- Product identity is `UnseenPrompt`, and production metadata uses `unseenprompt.com` after DNS and Cloudflare ownership verification.

- [ ] **Step 6: Create the completion commit only if fixes were required**

If validation required tracked corrections:

```bash
git add --update
git commit -m "chore: satisfy phase 0 completion gates"
```

If no files changed, do not create an empty commit.

- [ ] **Step 7: Prepare the implementation report**

Report:

- commits created;
- exact commands executed and observed outcomes;
- CI run URL and the result of all three jobs;
- dependency/runtime versions;
- any deferred Phase 1 work;
- any unverified item or external blocker.

Do not mark Phase 0 complete until the pull-request CI run passes.

---

## Requirement Traceability

| Approved Phase 0 requirement                                               | Implemented by    | Evidence                                                     |
| -------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------ |
| Next.js, shared domain modules, tests, migrations, Cloudflare config, docs | Tasks 1–7         | Planned file map and tracked paths                           |
| Strict TypeScript                                                          | Task 1            | `pnpm typecheck`                                             |
| Linting and formatting                                                     | Task 2            | `pnpm lint`, `pnpm format:check`                             |
| Import boundaries                                                          | Task 2            | Deliberate failing boundary fixture                          |
| Environment validation                                                     | Task 3            | Positive and negative schema tests                           |
| Naming conventions                                                         | Task 7            | `docs/conventions/naming.md`                                 |
| Local/staging/production contracts                                         | Tasks 3 and 7     | `.env.example`, environment matrix                           |
| Dummy-only environment template                                            | Task 3            | Secret scan plus tracked-file check                          |
| CI: lint, typecheck, unit, database, build, preview                        | Task 8            | Three required GitHub Actions jobs                           |
| Approved plans and design documentation                                    | Task 7            | Repository documentation index and Phase 0 architecture spec |
| UnseenPrompt identity and primary domain metadata                          | Task 4            | Component test, metadata, preview assertion                  |
| CI build exit criterion                                                    | Tasks 8–9         | `quality` job                                                |
| Test runner executes                                                       | Tasks 3–5 and 8–9 | Vitest and pgTAP output                                      |
| Missing environment values fail safely                                     | Task 3            | Negative schema test and empty-env command                   |
| Cloudflare preview bundle succeeds                                         | Tasks 6, 8, and 9 | `.open-next/worker.js` assertion and HTTP smoke test         |

## External References Used to Resolve Phase 0 Choices

- [Next.js installation and Node.js requirements](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js Vitest guidance](https://nextjs.org/docs/app/guides/testing/vitest)
- [OpenNext Cloudflare getting started](https://opennext.js.org/cloudflare/get-started)
- [OpenNext Cloudflare supported runtimes and versions](https://opennext.js.org/cloudflare)
- [Supabase local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase database testing with pgTAP](https://supabase.com/docs/guides/database/testing)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [GitHub Actions Node.js CI guidance](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)
