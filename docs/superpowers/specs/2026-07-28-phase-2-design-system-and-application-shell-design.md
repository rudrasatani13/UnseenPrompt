# Phase 2 — Design System and Application Shell Design

| Field             | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| Date              | 2026-07-28                                                   |
| Status            | Design approved; written specification awaiting review       |
| Phase             | 2 of the approved UnseenPrompt development roadmap           |
| Reference product | Prompt Cowboy, used for interaction and layout analysis only |

## 1. Goal

Build the reusable interface foundation for UnseenPrompt: semantic design tokens, accessible
shared primitives, product-specific presentation components, a responsive application shell, a
non-functional public product preview, application state boundaries, and a non-production
component gallery.

The design borrows Prompt Cowboy's interaction principles—a fixed desktop sidebar, a focused
central workspace, restrained controls, and progressive disclosure—without copying its branding,
copy, proprietary assets, font, or exact visual implementation.

## 2. Locked Context

The following project decisions remain unchanged:

- Application: Next.js App Router with strict TypeScript.
- Runtime: Cloudflare Workers through OpenNext.
- UI language: English.
- Supported product scope: websites and web applications only.
- Account scope: personal accounts only in the MVP.
- Interaction principle: show one active question or one active prompt at a time.
- Visual identity: Warm Editorial with Powder Pink semantic tokens.
- Accessibility: keyboard operation, reduced-motion behavior, and accessible contrast are release
  requirements.
- Architecture: one deployable application with the existing `src/` import boundaries.

## 3. Approved Design Decisions

### 3.1 Reference fidelity

Use Prompt Cowboy's interaction and layout DNA only. UnseenPrompt must retain an original visual
identity and must not reproduce Prompt Cowboy's name, copy, logo, imagery, proprietary font,
component source, or distinctive branded decoration.

### 3.2 Public homepage

The `/` route becomes a polished product preview using the real Phase 2 shell and design system.
The composer is non-editable and non-submitting. It must disclose that prompt generation is a
preview and becomes functional in a later phase. The page must not simulate AI output, capture
input, advertise unavailable account behavior, or make network mutations.

### 3.3 Typography

Use Manrope Variable, loaded through `next/font` and self-hosted in the application build. This
implements the approved soft-geometric direction without using Prompt Cowboy's Aeonik font.

### 3.4 Color direction

Use Whisper Pink:

- warm near-white working surfaces;
- Powder Pink for selected states and subtle grouping;
- muted rose for actions, focus, and meaningful state;
- independent green, amber, red, and blue status semantics;
- no immersive pink canvas or decorative saturation.

### 3.5 Shell structure

Use a fixed desktop sidebar with a centered, constrained workspace. Below the desktop breakpoint,
the sidebar becomes an accessible slide-over sheet. Do not introduce a bottom navigation bar.

### 3.6 Component architecture

Use Tailwind CSS v4, shadcn/ui with Radix-backed primitives, and locally owned generated component
source. Use Animate UI's icon registry only, with Motion for purposeful icon micro-interactions.
Do not adopt Animate UI as a second general-purpose component system.

### 3.7 Component gallery exposure

The `/design-system` route is available in local, preview, and staging environments. It returns
Next.js `notFound()` in production and always emits `noindex, nofollow` metadata.

### 3.8 Brand assets

Retain the supplied UnseenPrompt logo and its purposeful derivatives:

- `assets/brand/logo-source.png`;
- `src/app/favicon.ico`;
- `src/app/icon.png`;
- `src/app/apple-icon.png`;
- `public/brand/icon-192.png`;
- `public/brand/icon-512.png`;
- `public/brand/icon-maskable-512.png`;
- `src/app/opengraph-image.png`;
- `src/app/twitter-image.png`.

The Open Graph and Twitter images are byte-identical but intentionally use separate Next.js file
conventions so both social metadata tags are generated. They are not classified as removable
duplicates. Regenerate both cards with the approved soft-geometric typography.

Remove `.DS_Store` files during Phase 2 execution and add `.DS_Store` and `.superpowers/` to
`.gitignore`.

## 4. Architecture and Ownership

### 4.1 File ownership

| Path                          | Responsibility                                                     |
| ----------------------------- | ------------------------------------------------------------------ |
| `components.json`             | shadcn registry configuration and local aliases                    |
| `src/app/globals.css`         | Tailwind import, document reset, and global layout behavior        |
| `src/components/ui/theme.css` | semantic CSS variables and Tailwind theme mapping                  |
| `src/components/ui/**`        | locally owned shadcn-derived generic primitives                    |
| `src/components/ui/utils.ts`  | presentation-layer class merging utility                           |
| `src/components/ui/icons/**`  | curated Animate UI icon source and static fallbacks                |
| `src/components/brand/**`     | logo and wordmark presentation                                     |
| `src/components/shell/**`     | sidebar, mobile header, navigation sheet, and page frame           |
| `src/components/product/**`   | reusable product-specific presentation components                  |
| `src/components/providers/**` | client-only motion, tooltip, and toast providers                   |
| `src/app/(product)/**`        | public preview and future product routes under maintenance control |
| `src/app/design-system/**`    | non-production component gallery                                   |
| `src/app/loading.tsx`         | shell-preserving route loading boundary                            |
| `src/app/error.tsx`           | recoverable route error boundary                                   |
| `src/app/global-error.tsx`    | dependency-light global fallback                                   |
| `src/app/not-found.tsx`       | route-not-found surface                                            |

### 4.2 Import invariants

- `src/components/**` must not import from `src/app/**` or `src/features/**`.
- Generic UI components must not import product components.
- Product components may compose generic UI components but must not own workflows.
- Components accept typed data and callbacks; they do not perform authentication, persistence,
  billing, AI calls, uploads, analytics, or project mutations.
- shadcn's default `@/lib/utils` location is prohibited because it conflicts with the established
  presentation-layer boundary. `components.json` must map the utility alias to
  `@/components/ui/utils`.
- Client components are introduced only for state, portals, focus management, toasts, or motion.
- The homepage remains server-rendered except for explicitly isolated interactive providers and
  shell behavior.

### 4.3 Third-party source boundary

- shadcn and Animate UI registry output is copied into the repository, reviewed, formatted, tested,
  and committed as local source.
- There are no runtime registry requests.
- There are no externally hosted scripts or fonts.
- Registry output may not introduce `dangerouslySetInnerHTML`, dynamic code execution, unreviewed
  network requests, or remote assets.
- Animate UI usage is limited to the icons required by the Phase 2 component inventory.

## 5. Visual System

### 5.1 Typography

| Role            | Size | Intended use                                |
| --------------- | ---: | ------------------------------------------- |
| Metadata        | 12px | timestamps, helper metadata, compact labels |
| Secondary UI    | 14px | badges, descriptions, secondary controls    |
| Body/control    | 16px | default content and interactive controls    |
| Emphasized body | 18px | summaries and high-priority guidance        |
| Section heading | 24px | gallery and workspace sections              |
| Mobile display  | 32px | primary mobile page heading                 |
| Desktop display | 44px | primary desktop page heading                |

Display text uses approximately 1.2 line height. Guidance and longer body text use up to 1.6 line
height. Technical content must remain readable at 200% zoom without horizontal page scrolling.

### 5.2 Core semantic colors

| Token                    |     Value | Purpose                               |
| ------------------------ | --------: | ------------------------------------- |
| `--canvas`               | `#FEFAF8` | warm page background                  |
| `--surface`              | `#FFFFFF` | cards, composer, overlays             |
| `--surface-muted`        | `#FAF4F5` | selected navigation and subtle groups |
| `--text-primary`         | `#2B2426` | primary text                          |
| `--text-secondary`       | `#6F6266` | supporting text                       |
| `--brand-primary`        | `#A64763` | primary action, active state, focus   |
| `--brand-primary-hover`  | `#8D3852` | primary hover state                   |
| `--brand-primary-active` | `#762C43` | primary pressed state                 |
| `--border-control`       | `#8F8185` | input and essential control boundary  |
| `--border-subtle`        | `#E9DFE1` | cards and separators                  |

Measured WCAG contrast for the core pairs:

- primary text on canvas: 14.64:1;
- secondary text on canvas: 5.60:1;
- white text on brand primary: 5.67:1;
- brand primary on canvas: 5.47:1;
- control border on canvas: 3.59:1.

### 5.3 Status colors

| Status      | Foreground | Background | Measured contrast |
| ----------- | ---------: | ---------: | ----------------: |
| Success     |  `#17623A` |  `#E7F6ED` |            6.61:1 |
| Warning     |  `#7A4A00` |  `#FFF4D6` |            6.83:1 |
| Danger      |  `#8F2037` |  `#FDECEF` |            7.58:1 |
| Information |  `#1F4E79` |  `#EAF3FA` |            7.71:1 |

Status must also use text and/or iconography; color alone never communicates state.

### 5.4 Spacing, radius, border, and elevation

- Spacing scale: `4, 8, 12, 16, 24, 32, 40, 48, 64, 96px`.
- Radius scale: `4, 8, 12, 16px`, plus full pill.
- Essential controls use visible boundaries or an equivalent 3:1 state difference.
- Cards use subtle one-pixel borders.
- Elevation has two levels: low panel elevation and warmer composer/dialog elevation.
- Avoid heavy glassmorphism, high-blur backgrounds, and stacked shadows.

### 5.5 Focus

- Use a two-pixel visible focus indicator with a two-pixel offset.
- Focus treatment must achieve at least a 3:1 change against adjacent colors.
- Do not remove outlines without providing the approved replacement.
- Focus must not be obscured by the sidebar, mobile header, sheets, dialogs, or toasts.

### 5.6 Theme scope

Phase 2 ships a complete accessible light theme. Dark mode is explicitly deferred.

## 6. Motion System

### 6.1 Durations

- hover and press feedback: 120–160ms;
- dialog, sheet, tabs, and toast transitions: 180–220ms;
- no product interaction should wait on decorative motion.

### 6.2 Animate UI icon policy

Animated icons are permitted for:

- copy changing to success;
- menu open and close;
- panel expansion and collapse;
- upload and retry feedback;
- success or verified state;
- navigation acknowledgement;
- dropdown expansion.

Animated icons are not permitted for:

- autoplaying decoration;
- continuous ambient loops;
- motion-only state communication;
- large transforms unrelated to an action;
- high-frequency attention capture.

### 6.3 Reduced motion

Wrap the application with `MotionConfig reducedMotion="user"`. CSS transitions must also provide
`prefers-reduced-motion` fallbacks. Reduced motion removes transform and layout movement while
retaining immediate color or opacity feedback. Static Lucide-compatible SVG presentation is the
fallback if an animated icon cannot run.

## 7. Core UI Components

The locally owned shadcn layer includes:

- Button: primary, secondary, outline, ghost, destructive, and icon variants.
- Input and Textarea: labels, descriptions, errors, disabled, read-only, and character-count
  states.
- Card.
- Badge.
- Separator.
- Tooltip.
- ScrollArea.
- Tabs.
- Dialog.
- AlertDialog.
- Sheet.
- DropdownMenu.
- Progress.
- Skeleton.
- Alert.
- EmptyState.
- FileItem.
- Sonner-based toast presentation.

Rules:

- Icon-only controls require an accessible name.
- Tooltips supplement but do not replace accessible names.
- Cards are interactive only when they represent a selection or navigation target.
- Disabled controls explain why they are unavailable when that information matters.
- Loading states preserve layout dimensions.
- Persistent errors render inline and associate with their control.
- Toasts are limited to transient confirmation or recoverable background feedback.
- FileItem supports filename, file type, byte size, upload/processing status, error, retry, and
  removal callbacks. It does not upload, parse, or persist a file in Phase 2.

## 8. Product Components

### 8.1 LifecycleSteps

A semantic ordered list with complete, current, pending, and blocked states. State is communicated
through text, icon, and color.

### 8.2 ConfirmationCard

Displays a proposed change and explicit confirm/reject callbacks. It does not apply state or call a
server action.

### 8.3 EvidenceLabel

Supports exactly four evidence states:

- Claimed;
- Evidence supplied;
- User confirmed;
- Verified.

### 8.4 PromptPanel

Presents one active prompt with slots for:

- copy action;
- prompt metadata;
- expected result;
- acceptance criteria.

Copy failure leaves selectable prompt text visible and provides an actionable inline message.

### 8.5 QuestionChoice

Uses radio-group semantics, a visible group label, optional supporting descriptions, and standard
arrow-key selection behavior.

### 8.6 ToolSelector

Uses radio-group semantics for Claude Code, OpenAI Codex, and Cursor. Tool cards are not generic
clickable containers.

### 8.7 UsageMeter

Uses accessible progress semantics and always exposes visible used and remaining values.

### 8.8 RiskWarning

Supports warning and destructive presentation. High-risk acknowledgement composes AlertDialog and
requires an explicit action; it cannot infer authorization.

## 9. Application Shell

### 9.1 Desktop

- Desktop breakpoint: `1024px`.
- Sidebar width: `232px`.
- Navigation order: New Project, Projects, Profile, Usage.
- Main content maximum width: `960px`.
- Composer maximum width: `800px`.
- Sidebar uses a white surface, subtle separator, and no heavy elevation.
- Active navigation uses muted Powder Pink with rose text/icon treatment.

### 9.2 Mobile and tablet

- Below `1024px`, render a 56px brand header and a menu control.
- Navigation opens in a shadcn Sheet with width `min(88vw, 320px)`.
- Opening the sheet moves focus inside.
- Tab and Shift+Tab stay inside while open.
- Escape closes the sheet.
- Closing returns focus to the menu trigger.
- Do not render a mobile bottom navigation bar.

### 9.3 Navigation contract

The shell accepts navigation items with label, icon, active state, availability status, and
optional `href`.

- Items with an `href` render as links.
- Unavailable preview items render as non-interactive text with a visible `Soon` label.
- Unavailable items are not fake links and are not inserted into the tab order.

## 10. Routes and Application Boundaries

### 10.1 Product route group

Move the public preview into `src/app/(product)/page.tsx`. A product route-group layout reads the
validated maintenance value without affecting API health routes or the design-system gallery.

### 10.2 Preview composer

The preview composer:

- is presentation markup, not an editable form control;
- shows representative product copy;
- displays a visible `Preview` disclosure;
- states that prompt generation arrives in a later phase;
- performs no submission, storage, logging, analytics, or network request.

### 10.3 Component gallery

The gallery:

- renders all core and product components;
- covers normal, disabled, loading, error, long-text, and reduced-motion states;
- includes usage constraints and keyboard notes;
- displays the approved color and contrast pairs;
- uses synthetic fixtures only;
- emits `noindex, nofollow`;
- calls `notFound()` when `APP_ENV` is `production`.

### 10.4 Loading boundary

Preserve the shell's dimensions and use representative skeletons. Loading indicators must have an
accessible label when progress is otherwise not apparent.

### 10.5 Recoverable error boundary

Provide a concise error explanation and retry action. Persistent errors remain on screen; they are
not represented only by a toast.

### 10.6 Global error boundary

Render the required `html` and `body` structure with minimal inline-safe presentation. Do not
depend on Tailwind providers, portals, animated icons, or component-system initialization.

### 10.7 Not-found boundary

Explain that the requested page is unavailable and provide a return-home action.

### 10.8 Maintenance boundary

Add validated `MAINTENANCE_MODE` values `off` and `on`, defaulting to `off`. The product route-group
layout renders the maintenance state when enabled.

Health endpoints and the design-system gallery remain outside the product route group. Phase 2
implements the presentation boundary only; returning HTTP 503 at the Cloudflare edge is deferred
to deployment hardening.

## 11. Accessibility Requirements

The target is WCAG 2.2 AA, plus the stronger approved focus appearance.

- Provide a skip link to the main workspace.
- Use semantic landmarks and a logical heading hierarchy.
- Do not use positive `tabindex`.
- Primary target size is at least 40px on desktop and 44px on mobile.
- Support complete keyboard operation.
- Support 200% zoom and responsive reflow.
- Do not clip focused elements.
- Dialogs and sheets trap focus, close with Escape, include a visible close/cancel action, and
  restore focus.
- QuestionChoice and ToolSelector follow the WAI-ARIA radio-group keyboard pattern.
- Tabs follow the WAI-ARIA tabs keyboard pattern.
- Live regions must not produce duplicate announcements.
- Decorative icons use `aria-hidden`.
- Semantic icon controls have explicit accessible names.
- Forced-colors mode must preserve focus and state visibility.
- Motion is never the only indication of a state change.

## 12. Data and Trust Boundaries

Phase 2 contains no durable product data flow.

- Homepage and gallery fixtures are static and synthetic.
- No customer, project, prompt, or production content appears in fixtures or screenshots.
- Components expose typed props and callbacks only.
- No component reads or writes local storage, cookies, databases, Supabase, billing systems, or AI
  providers.
- The preview does not log user content because it accepts no user input.
- `MAINTENANCE_MODE` is a non-secret, server-validated environment value.
- Brand assets are local and reviewed.

## 13. Failure Modes

| Failure                                 | Required behavior                                                     |
| --------------------------------------- | --------------------------------------------------------------------- |
| Invalid environment value               | environment parsing fails closed with an actionable validation error  |
| Dialog or sheet initialization failure  | document remains operable and is not left inert                       |
| Copy API failure                        | prompt text remains selectable and an inline recovery message appears |
| Animated icon failure                   | static semantic icon remains visible                                  |
| Reduced-motion preference               | transforms/layout motion are disabled without losing state feedback   |
| Component-gallery request in production | route resolves through `notFound()`                                   |
| Long labels or translated user content  | layout wraps without clipping controls or causing page overflow       |
| Global styling/provider failure         | global error boundary remains renderable                              |

## 14. Verification Strategy

### 14.1 Component tests

Continue using Vitest and Testing Library. Add:

- `@testing-library/user-event` for realistic keyboard and pointer input;
- `vitest-axe` and `axe-core` for automated accessibility assertions.

Test default, disabled, loading, error, and reduced-motion states for every component. Test focus
entry, focus trapping, Escape closure, focus restoration, arrow-key behavior, and live-region
semantics.

### 14.2 Browser tests

Add Playwright for real-browser verification.

Required viewports:

- 390x844;
- 768x1024;
- 1024x768;
- 1440x900.

Required assertions:

- no horizontal page overflow;
- no obscured focus;
- navigation sheet is keyboard operable;
- dialogs and sheets do not leak focus;
- homepage preview has no editable input or submit action;
- production hides `/design-system`;
- non-production environments render `/design-system`;
- maintenance mode changes product presentation without affecting health routes;
- reduced-motion behavior remains usable.

### 14.3 Contrast checks

Implement deterministic checks against the committed semantic token values for every approved
text, control, focus, and status pair. Automated browser accessibility scans supplement but do not
replace the token checks.

### 14.4 Visual regression

Create stable Playwright screenshots for the homepage and component gallery at desktop and mobile
sizes. Disable motion for screenshot assertions.

Manual gallery review covers:

- typography and density;
- icon consistency;
- long text;
- 200% zoom;
- reduced motion;
- forced colors where supported;
- mobile and desktop composition.

### 14.5 Repository and asset checks

- Remove repository `.DS_Store` files.
- Ignore `.DS_Store` and `.superpowers/`.
- Preserve all purposeful logo derivatives.
- Regenerate Open Graph and Twitter images with Manrope.
- Verify asset dimensions, manifest references, metadata output, and brand-cache headers.
- Validate new dependencies against the Cloudflare Workers dependency policy.

### 14.6 Final command gates

Run and observe:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm build
pnpm cf:types:check
pnpm check:workers-deps
pnpm cf:build
pnpm test:cf-preview
```

## 15. Exit Criteria

Phase 2 is complete only when:

1. Every approved core and product component is represented in `/design-system`.
2. The production environment returns not-found for `/design-system`.
3. The homepage presents the non-functional preview without accepting or transmitting input.
4. Desktop and mobile shell behavior matches the approved structure.
5. Keyboard-only navigation completes every Phase 2 interaction.
6. Automated accessibility checks pass with no serious or critical violations.
7. Approved contrast pairs pass deterministic checks.
8. Reduced-motion behavior preserves equivalent feedback.
9. Target viewports have no horizontal overflow or clipped critical controls.
10. Brand metadata and manifest assets resolve correctly.
11. All Next.js and Cloudflare command gates pass.

## 16. Explicitly Deferred

- Functional discovery or prompt generation.
- Authentication and account navigation behavior.
- Project persistence and project library data.
- File upload, parsing, or storage.
- AI, billing, analytics, and production telemetry.
- Dark mode.
- HTTP 503 enforcement at the Cloudflare edge.
- Autonomous repository, IDE, or agent execution.

## 17. External References

- [Prompt Cowboy](https://promptcowboy.com/) — visual and interaction reference only.
- [shadcn/ui repository](https://github.com/shadcn-ui/ui) — MIT-licensed open-code component
  distribution.
- [shadcn/ui Next.js installation](https://ui.shadcn.com/docs/installation/next).
- [Animate UI repository](https://github.com/imskyleen/animate-ui) — MIT-licensed animated component
  and icon distribution.
- [Animate UI accessibility guidance](https://animate-ui.com/docs/accessibility).
- [Next.js app icon conventions](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons).
- [Next.js Open Graph and Twitter image conventions](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image).
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- [WAI-ARIA radio-group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/).
- [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
