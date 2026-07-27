# Shared infrastructure layer

## Responsibility

Shared technical adapters and utilities: HTTP helpers, logging facades, provider clients, and other infrastructure that is not feature-specific.

## Permitted imports

- `src/domain/**`
- Third-party libraries appropriate to adapters

## Forbidden imports

- `@/app/**`
- `@/components/**`
- `@/features/**`

## Representative future module

`src/lib/supabase/server-client.ts` — server-side Supabase client factory used by features and routes.
