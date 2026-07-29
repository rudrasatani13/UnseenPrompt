# Curated animated icons

This directory is the only place UnseenPrompt owns Animate UI source.

## Provenance

| Field          | Value                                     |
| -------------- | ----------------------------------------- |
| Upstream       | <https://github.com/imskyleen/animate-ui> |
| License        | MIT                                       |
| Retrieved      | 2026-07-28                                |
| Registry route | `@animate-ui` in `components.json`        |

Registry items adopted:

1. `@animate-ui/icons-icon`
2. `@animate-ui/icons-copy`
3. `@animate-ui/icons-check`
4. `@animate-ui/icons-menu`
5. `@animate-ui/icons-panel-left-open`
6. `@animate-ui/icons-panel-left-close`
7. `@animate-ui/icons-upload`
8. `@animate-ui/icons-refresh-cw`
9. `@animate-ui/icons-circle-check-big`
10. `@animate-ui/icons-chevron-down`

## Local modification policy

The registry writes to `src/hooks/` and `src/components/animate-ui/`, which are
outside this project's approved layers. Every adopted file is therefore relocated
into `src/components/ui/icons/` and **only** its import specifiers are rewritten:

| Registry path                                           | Owned path             |
| ------------------------------------------------------- | ---------------------- |
| `src/hooks/use-is-in-view.tsx`                          | `./use-is-in-view.tsx` |
| `src/components/animate-ui/primitives/animate/slot.tsx` | `./animate-slot.tsx`   |
| `src/components/animate-ui/icons/*.tsx`                 | `./*.tsx`              |

No icon logic, animation variant, or path geometry is edited. Nothing else from
the Animate UI registry may be added here: general-purpose Animate UI components
are out of scope, because this project already owns one component system built on
shadcn and Radix.

## Usage rules

- Animation runs only in response to the associated user action or state change.
  There is no ambient or looping icon motion.
- When reduced motion is active, or when Motion has not initialised, the icon
  renders its static Lucide-compatible SVG frame. Motion is never the only signal
  for a state; text or an independent icon always carries the meaning.
- A decorative instance sets `aria-hidden="true"` and `focusable="false"`.
- An icon-only control takes its accessible name from the button, never from the
  SVG.
- An icon that carries meaning on its own sets `role="img"` with an explicit
  `aria-label`. These components render their own paths, so a child `<title>`
  element is not part of their API.

## Updating

A registry update is a supply-chain change. Repeat the full procedure:

1. Review the upstream diff with `pnpm exec shadcn view @animate-ui/icons-<name>`.
2. Re-run the add, relocate the files, and rewrite only import paths.
3. Re-run `src/components/ui/icons/animated-icons.test.tsx`, which fails on any
   network, dynamic-evaluation, or timer pattern, and on any import outside
   React, Motion, and locally owned modules.
4. Re-run the Chromium reduced-motion checks in `tests/e2e/accessibility.spec.ts`.
