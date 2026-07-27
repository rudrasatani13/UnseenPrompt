# Components layer

## Responsibility

Reusable presentation components with no feature-specific business orchestration. Components receive data and callbacks; they do not own product workflows.

## Permitted imports

- Other `src/components/**` modules
- Design-system tokens and shared UI utilities once introduced
- Third-party UI libraries when adopted

## Forbidden imports

- `@/app/**`
- `@/features/**`

## Representative future module

`src/components/prompt/prompt-card.tsx` — reusable card for displaying a single active prompt.
