# Domain layer

## Responsibility

Framework-independent domain types and deterministic rules for UnseenPrompt. This layer owns pure business concepts and validation that do not depend on Next.js, React, Supabase clients, or external providers.

## Permitted imports

- Other `src/domain/**` modules only

## Forbidden imports

- `@/app/**`
- `@/components/**`
- `@/features/**`
- `@/lib/**`
- Framework, UI, and infrastructure packages used for adapters

## Representative future module

`src/domain/project/project-decision.ts` — pure types and pure functions for confirmed project decisions.
