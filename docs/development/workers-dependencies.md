# Workers dependency admission policy

UnseenPrompt runs on Cloudflare Workers through OpenNext. Every new **runtime** dependency (`package.json` `dependencies`) must pass these checks before merge.

## Mandatory checks

1. Confirm ESM or compatible bundling with the OpenNext / Wrangler Worker bundle.
2. Confirm no required native `.node` addon or child-process requirement at runtime.
3. Confirm filesystem use is not required at request time on the Worker.
4. Check for a published `workerd` export condition when the package ships platform-specific entry points.
5. Add `serverExternalPackages` only when the package publishes a verified `workerd` entry and OpenNext cannot bundle it cleanly.
6. Run unit tests, Next.js build, OpenNext build (`pnpm cf:build`), and local Worker preview (`pnpm test:cf-preview`).
7. Record any compatibility flag or externalization rationale in the pull request.

## Automated gate

```bash
pnpm check:workers-deps
```

This script is an early denylist for known-incompatible direct dependencies. It is **not** proof of Worker compatibility. `pnpm cf:build` and `pnpm test:cf-preview` remain authoritative.

## Forbidden as direct runtime dependencies (denylist)

- `better-sqlite3`
- `canvas`
- `electron`
- `fs-ext`
- `node-gyp`

## When to escalate

If a package needs Node APIs outside Workers compatibility, prefer a pure-JS alternative, an edge-compatible SDK, or defer the capability until a supported binding exists. Do not paper over failures with stubs that hide production breakage.
