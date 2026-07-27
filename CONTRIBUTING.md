# Contributing to UnseenPrompt

## Branching

- Do not commit directly to protected `main`.
- Use short-lived feature branches (for example `codex/phase-0-foundations`).
- Prefer small, scoped commits with imperative messages.

## Local setup

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
```

Use Node 24.x and pnpm 11.x. Do not hand-edit `pnpm-lock.yaml`.

## Database tests: CI / staging only

**Do not start local Supabase Docker on developer machines by default.** The images are large and are not required for day-to-day application work.

| Gate | Where it runs |
|---|---|
| `pnpm format:check`, `lint`, `typecheck`, `test:unit`, `build` | Local + CI |
| `pnpm cf:build`, `pnpm test:cf-preview` | Local + CI (Workers preview via Wrangler; no Supabase Docker) |
| `pnpm test:db` | **GitHub Actions `database` job, or a shared cloud/staging runner** |

If you must run database tests locally, that is opt-in and requires a Docker-compatible runtime you accept the disk cost for. Prefer verifying on a PR against CI.

## Tests before behavior changes

For behavior changes:

1. Write or update a failing test.
2. Implement the minimal fix.
3. Re-run the relevant gates.

Do not suppress lint or typecheck warnings to make gates pass.

## Quality gates before review

At minimum:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

When touching Cloudflare packaging:

```bash
pnpm cf:build
pnpm test:cf-preview
```

Database and RLS changes are validated by the CI `database` job (or staging), not by requiring local Docker for every contributor.

## Pull requests

- Keep PRs focused.
- Reference the phase or task when applicable.
- Ensure GitHub Actions `quality`, `database`, and `cloudflare-preview` jobs pass before merge.
