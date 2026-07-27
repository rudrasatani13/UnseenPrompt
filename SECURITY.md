# Security Policy

## Reporting a vulnerability

Until a dedicated security email exists, report exploitable findings through the repository **security advisory** flow (private disclosure).

Do **not** file public issues that describe exploitable vulnerabilities, include credentials, or paste production customer data.

## Secret handling

- Never commit `.env*`, `.dev.vars*`, service-role keys, tokens, or provider credentials.
- `.env.example` contains dummy local defaults only.
- If a secret is accidentally exposed: revoke and rotate it first, then clean history or force-expire the credential, then notify maintainers.

## Customer and project content

- Do not place real customer, project, or prompt content in fixtures, snapshots, logs, or error messages.
- Treat uploaded files as private, bounded, and untrusted (enforced in later phases).

## Scope notes (Phase 0)

Phase 0 does not provision remote Cloudflare, Supabase, Sentry, PostHog, Paddle, or AI-provider resources. No production secrets should exist in this repository.
