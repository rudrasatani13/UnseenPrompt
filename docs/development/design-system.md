# UnseenPrompt Design System

Pure Monochrome / White Canvas is the approved active visual system. Prompt Cowboy is an
interaction and layout reference only — never copy its code, copywriting, logo,
imagery, Aeonik font, or exact visual implementation.

## Ownership

| Layer                | Path                     | Rule                                    |
| -------------------- | ------------------------ | --------------------------------------- |
| Tokens / primitives  | `src/components/ui`      | Generic, reusable, no product workflows |
| Product presentation | `src/components/product` | Typed data + callbacks only             |
| Shell                | `src/components/shell`   | Frame and navigation only               |
| Brand                | `src/components/brand`   | Supplied logo assets only               |

Import rules:

- `src/components/**` must not import `src/app/**` or `src/features/**`
- Generic UI must not import product components
- Map shadcn helpers to `@/components/ui/utils` (never `src/lib/utils.ts`)

## Semantic tokens

| Token                    | Value                                               |
| ------------------------ | --------------------------------------------------- |
| `--canvas`               | `#FFFFFF`                                           |
| `--surface`              | `#FFFFFF`                                           |
| `--surface-muted`        | `#F5F5F5`                                           |
| `--text-primary`         | `#000000`                                           |
| `--text-secondary`       | `#525252`                                           |
| `--brand-primary`        | `#000000`                                           |
| `--brand-primary-hover`  | `#262626`                                           |
| `--brand-primary-active` | `#404040`                                           |
| `--border-control`       | `#737373`                                           |
| `--border-subtle`        | `#D4D4D4`                                           |
| `--focus-ring-color`     | `#000000`                                           |
| status pairs             | monochrome success / warning / danger / info (see `theme.css`) |

Status surfaces:

| Status      | Surface   | Border         | Text     |
| ----------- | --------- | -------------- | -------- |
| Success     | `#F7F7F7` | `#737373`, 1px | `#000000` |
| Information | `#F5F5F5` | `#737373`, 1px | `#000000` |
| Warning     | `#EFEFEF` | `#525252`, 1px | `#000000` |
| Danger      | `#E8E8E8` | `#000000`, 2px | `#000000` |

Spacing: `4, 8, 12, 16, 24, 32, 40, 48, 64, 96px`
Radii: `0, 2, 4, 8px` and pill only where geometry requires it
Type: `12, 14, 16, 18, 24, 32, 44px`
Motion: micro `120–160ms`, overlays `180–220ms`
Focus: 2px ring, 2px white offset, ≥3:1 adjacent change
Elevation: cards use borders only; dialogs/sheets use
`0 16px 48px rgb(0 0 0 / 18%)`

Contrast pairs are locked in `src/components/ui/theme.test.ts`.

There is no dark mode, no decorative background artwork, and no hue-only status.

## Typography and social cards

- Runtime font: Manrope via `next/font/google` (self-hosted at build time)
- Social cards: local generator only

```bash
pnpm brand:social
```

Reads the canonical monochrome brand source and
`@fontsource-variable/manrope` (dev dependency). Writes identical bytes to
`src/app/opengraph-image.png` and `src/app/twitter-image.png`.

## Component inventory

**Core:** Button, Input, Textarea, Card, Badge, Separator, Tooltip, ScrollArea,
Tabs, Dialog, AlertDialog, Sheet, DropdownMenu, Progress, FileItem, Skeleton,
EmptyState, Alert, Toast

**Product:** LifecycleSteps, ConfirmationCard, EvidenceLabel, PromptPanel,
QuestionChoice, ToolSelector, UsageMeter, RiskWarning

Components receive props and callbacks. They do not own authorization,
persistence, server actions, or AI calls.

## Responsive shell

| Boundary       | Value                                                |
| -------------- | ---------------------------------------------------- |
| Desktop shell  | `min-width: 1024px`, fixed 232px sidebar             |
| Mobile/tablet  | below 1024px, 56px header + Sheet `min(88vw, 320px)` |
| Main workspace | max 960px, gutters 16 / 24 / 40                      |
| Prompt panel   | max 800px                                            |
| Targets        | ≥40px desktop, ≥44px mobile                          |

## Accessibility

- WCAG 2.2 AA
- Keyboard: Sheet, dialogs, tabs, radio groups, copy feedback, retry, focus restore
- Text or iconography with color for every state (status is monochrome)
- Reduced motion must keep equivalent non-motion feedback
- Forced colors keep focus, selection, and control borders visible
- Destructive actions remain explicit user confirmations

## Registry policy

shadcn and Animate UI registry output is untrusted supply-chain input:

1. Review dry-run destinations and source
2. Commit only local files under `src/components/ui`
3. Reject network calls, remote assets, `dangerouslySetInnerHTML`, `eval`, install scripts
4. Re-run interaction tests after any registry update

Animate UI provenance lives in `src/components/ui/icons/README.md`.

## Gallery exposure

`/design-system` is available in `local`, `preview`, `staging`, and `test`.
In `production` it resolves to not-found and emits `noindex, nofollow`.
This is a UI exposure guard, not authorization. Fixtures are synthetic only.

## Maintenance presentation

`MAINTENANCE_MODE=on|off` (default `off`) replaces product children with
`MaintenanceNotice` inside the product shell. Health routes stay outside the
product group. Phase 2 does not claim HTTP 503 for maintenance.

## Commands

```bash
pnpm test:unit
pnpm test:e2e
pnpm test:e2e:maintenance
pnpm test:e2e:production
pnpm brand:social
pnpm check
```
