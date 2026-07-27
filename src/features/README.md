# Features layer

## Responsibility

Feature-specific behavior that composes domain rules, infrastructure, and presentation for a single product capability.

## Permitted imports

- `src/domain/**`
- `src/lib/**`
- `src/components/**`
- Other modules within the same feature folder

## Forbidden imports

- `@/app/**` (routes compose features; features do not import routes)

## Representative future module

`src/features/prompt-generation/generate-prompt.ts` — feature orchestration for producing a coding-agent prompt from confirmed project state.
