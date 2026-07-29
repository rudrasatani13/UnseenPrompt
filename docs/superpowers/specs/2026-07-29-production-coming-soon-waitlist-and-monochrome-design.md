# Production Coming-Soon, Waitlist, and Pure Monochrome Design

**Date:** 2026-07-29

**Status:** Approved in conversation; awaiting written-spec review

**Scope:** Production landing page, waitlist, environment isolation, project-wide copy rules, and
project-wide colour-system migration

## Goal

Ship an honest production surface for UnseenPrompt while the application is still being built.
Production shows a focused coming-soon page and a working, privacy-conscious waitlist. Staging,
preview, local, and test continue to show the Phase 2 application shell.

The same change replaces the existing Powder Pink identity with the approved **Pure Monochrome /
White Canvas** system across the repository's active product surfaces. The change also establishes
a plainspoken product voice so generic software-marketing language does not return.

## Locked Decisions

1. Production renders a coming-soon page and waitlist at `/`.
2. Production never renders or briefly streams the application shell.
3. Staging, preview, local, and test continue to render the Phase 2 application shell.
4. Production `/design-system` remains an exact HTTP 404 with `noindex, nofollow`.
5. The production deployment gate remains disabled until the coming-soon release is approved.
6. The primary headline is **“Start with the messy version.”**
7. Public copy is specific, plainspoken, and free of invented product categories.
8. The waitlist uses Supabase, Cloudflare Turnstile, and Resend double opt-in.
9. The primary canvas is pure white. The system does not add dark mode.
10. The active product identity is pure monochrome: white, black, and neutral gray only.
11. Backgrounds contain no decorative lines, circles, gradients, textures, blobs, or artwork.
12. The existing logo shape is retained but regenerated as a true monochrome asset.
13. Status feedback is monochrome and never relies on color; it always includes an icon and text.
14. Production is promoted once through a controlled release, then the promotion gate is explicitly
    returned to `false` and verified.
15. UI implementation stays on the repository's shadcn/ui, Tailwind CSS, Lucide, and Motion stack.
    Animated icons come from the configured open-source Animate UI registry as owned source code.

## Scope

### Included

- Environment-aware root presentation.
- Production coming-soon and confirmation pages.
- Waitlist submit, confirm, and remove flows.
- A narrow Supabase waitlist migration and database tests.
- Turnstile validation and abuse controls.
- Resend confirmation delivery with retry-safe idempotency.
- Project-wide semantic color-token replacement.
- Monochrome logo, favicon, manifest icons, and social-card regeneration.
- Removal of unused pink or duplicate generated assets after a reference audit.
- Public UI, metadata, manifest, active product-document, and email copy updates.
- A product-copy guide and automated public-copy checks.
- Accessibility, visual regression, database, integration, and deployment verification.
- Runbook updates for candidate review, promotion, pause, and rollback.

### Excluded

- Authentication or account creation.
- Product onboarding or real project workflows.
- Referral codes, waitlist position, scarcity claims, launch countdowns, or gamification.
- Marketing analytics, tracking pixels, ad pixels, or behavior profiling.
- Newsletter campaigns or automated nurture sequences.
- A product dashboard or simulated product output on production.
- Dark mode.
- A general Phase 3 data model. The waitlist schema is isolated and must not pre-empt project,
  account, billing, or usage tables.
- Rewriting dated historical implementation records solely to modernize their old wording.

## Research Basis

The copy direction is based on current product sites that explain a familiar situation and visible
outcome instead of relying on category jargon:

- [Basecamp](https://basecamp.com/) describes recognizable work problems in ordinary language.
- [Screen Studio](https://screen.studio/) names the output, platform, and time to result.
- [Plausible](https://plausible.io/) explains what it replaces and the concrete tradeoff.
- [SavvyCal](https://savvycal.com/) explains the experience for both sides of scheduling.
- [Fathom](https://usefathom.com/) uses direct product and privacy claims with supporting detail.
- [Prompt Cowboy](https://www.promptcowboy.ai/) remains an interaction and layout reference only.
  Its copy, branding, assets, code, font, and visual implementation are not copied.
- [Animate UI](https://animate-ui.com/docs/icons/get-started) supplies the selected open-source,
  Motion-powered Lucide icon source through the repository's existing shadcn registry.

The writing rules also follow:

- [Mailchimp Voice and Tone](https://styleguide.mailchimp.com/voice-and-tone/): plain language,
  clarity over forced personality, and no hype.
- [Nielsen Norman Group web-writing research](https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/):
  concise, scannable, factual copy instead of promotional “marketese.”

Technical choices follow:

- [Cloudflare Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
- [Cloudflare Turnstile test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
- [Supabase server-side secret-key guidance](https://supabase.com/docs/guides/troubleshooting/performing-administration-tasks-on-the-server-side-with-the-servicerole-secret-BYM4Fa).
- [Supabase Cron](https://supabase.com/docs/guides/cron).
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Product Voice

### Voice

UnseenPrompt sounds like a small team explaining useful software to another person. It is:

- plain;
- specific;
- calm;
- slightly informal;
- technically accurate;
- honest about what exists now.

It does not sound like a category definition, investor deck, generated landing page, or chatbot.

### Public-copy rules

1. Name the situation before describing the product.
2. Prefer visible actions and outcomes over adjectives.
3. Use familiar verbs: bring, ask, keep, prepare, confirm, try, remove.
4. Name Claude Code, Codex, or Cursor only when the exact tool names improve understanding.
5. Use “coding tool” when the individual product names do not matter.
6. Never claim that a planned feature already exists.
7. Never claim a time saving, quality improvement, user count, launch date, or reliability level
   without evidence.
8. Keep one idea per paragraph.
9. Button text describes the result of pressing the button.
10. Error copy tells the person what happened and what they can do next.

### Prohibited public language

Public-facing source must not introduce:

- AI-powered
- copilot
- stateful project copilot
- intelligent
- smart
- revolutionary
- next-generation
- unlock
- supercharge
- transform your workflow
- seamless
- effortless
- game-changing
- cutting-edge
- agent-ready
- magic
- cheat code

The standalone term “AI” is not used as public positioning. Internal technical documentation may
use it only where required to describe an actual provider, model boundary, cost, security control,
or system behavior. Historical dated plans remain records and are not sources for new product copy.

### Repository enforcement

Create `docs/development/product-copy.md` as the active copy guide. Add a focused copy-policy test
that scans user-facing application source, metadata, manifest content, email templates, README, the
master product plan, and future active product documentation. It must not scan dependencies,
generated files, fixtures that intentionally test rejected copy, dated historical plans, or the
exact policy declarations that enumerate rejected phrases.

The exact phrase `Stateful Project Copilot` must be removed from:

- runtime UI;
- metadata;
- web manifest;
- generated social cards;
- README identity;
- active master and development-plan identity fields;
- new email templates;
- all newly written product documentation.

## Approved Production Copy

### Navigation

- Brand: `UnseenPrompt`
- Secondary note: `Work in progress`

There are no fake navigation destinations, login button, pricing link, or social-proof claims.

### Landing page

Eyebrow:

> UnseenPrompt is being built

Headline:

> Start with the messy version.

Body:

> Bring the idea, bug, or half-built website. UnseenPrompt asks what matters, keeps track of the
> decisions, and prepares the next prompt for Claude Code, Codex, or Cursor.

Form label:

> Email address

Submit button:

> Keep me posted

Consent:

> Email me when UnseenPrompt is ready. I can unsubscribe at any time.

Submit success:

> Check your inbox. We sent a confirmation email.

### Confirmation email

From:

> UnseenPrompt <hello@unseenprompt.com>

Subject:

> Confirm your UnseenPrompt email

Body:

> You asked to hear when UnseenPrompt is ready to try.
>
> Confirm my email
>
> This link expires in 24 hours. If you did not ask for this, ignore this email.

The HTML and plain-text versions contain the same meaning. Open and click tracking are disabled.

### Confirmation page

Heading before confirmation:

> Confirm your email

Body:

> Confirm this address and we’ll write when there is something ready to try.

Button:

> Confirm my email

Success:

> You’re on the list.
>
> We’ll write when there’s something ready to try.

### Error copy

Invalid email:

> Enter a complete email address.

Turnstile rejection or expiry:

> We couldn’t verify this submission. Please try again.

Temporary database or email failure:

> We couldn’t send the confirmation email. Try again in a minute.

Expired confirmation:

> This confirmation has expired. Enter your email again.

Invalid or removed confirmation:

> This confirmation link is no longer available.

Removal success:

> Your email has been removed.

No response reveals whether an email was already pending, confirmed, removed, or absent.

## Environment and Routing Design

### Root selection

The environment decision is server-owned.

| Environment  | `/`                                   | Application shell | Waitlist writes |
| ------------ | ------------------------------------- | ----------------- | --------------- |
| `local`      | Phase 2 product preview by default    | Yes               | Test adapter    |
| `test`       | Selected by the test case             | Test-controlled   | Test adapter    |
| `preview`    | Phase 2 product preview               | Yes               | Disabled        |
| `staging`    | Phase 2 product preview               | Yes               | Disabled        |
| `production` | Coming-soon landing and real waitlist | No                | Enabled         |

The production branch is selected before product-shell markup is rendered. Production does not
download, stream, or flash the sidebar, mobile application header, preview cards, or disabled
product navigation.

The existing product presentation moves behind a named `ProductPreview` component. The production
presentation is a separate `ComingSoonLanding` component. The product route-group layout renders
the application shell only for non-production environments and returns production children
directly otherwise.

### Metadata

Metadata is environment-aware:

- Production title: `UnseenPrompt`
- Production description: `Start with the messy version. Keep the decisions together and know what
to ask for next.`
- Non-production metadata remains honest about being a product preview but uses the new voice.
- Canonical production URL remains `https://unseenprompt.com`.
- The coming-soon page is indexable.
- Confirmation, removal, API, design-system, error, and internal health surfaces are `noindex`.

### Production-only route guarantees

- `/design-system` remains an exact HTTP 404.
- Health routes remain available and do not expose waitlist secrets or counts.
- Confirmation and removal pages are available only as required for production email links.
- The waitlist API rejects writes outside production except through explicit test adapters.
- Preview and staging never connect to the production waitlist database.

## Pure Monochrome / White Canvas System

### Identity palette

The primary system has one light token set and no dark variant.

| Semantic token           | Value     | Use                                    |
| ------------------------ | --------- | -------------------------------------- |
| `--canvas`               | `#FFFFFF` | Page background                        |
| `--surface`              | `#FFFFFF` | Cards, dialogs, sheets, inputs         |
| `--surface-muted`        | `#F5F5F5` | Disabled and quiet grouped surfaces    |
| `--text-primary`         | `#000000` | Primary text and high-emphasis icons   |
| `--text-secondary`       | `#525252` | Supporting copy                        |
| `--brand-primary`        | `#000000` | Primary actions                        |
| `--brand-primary-hover`  | `#262626` | Primary action hover                   |
| `--brand-primary-active` | `#404040` | Primary action active                  |
| `--border-control`       | `#737373` | Input and interactive control borders  |
| `--border-subtle`        | `#D4D4D4` | Section and component separation       |
| `--focus-ring-color`     | `#000000` | Focus ring with a visible white offset |

All exact pairs require measured contrast tests. Secondary text must remain at least WCAG 2.2 AA
against white. Focus indicators must remain at least 3:1 against adjacent colors. A white gap
between a black control and black focus ring preserves the indicator boundary.

### Status presentation

Status is monochrome. The semantic mapping is fixed:

| Status      | Surface   | Border         | Icon             | Visible label |
| ----------- | --------- | -------------- | ---------------- | ------------- |
| Success     | `#F7F7F7` | `#737373`, 1px | Check circle     | `Success`     |
| Information | `#F5F5F5` | `#737373`, 1px | Information      | `Information` |
| Warning     | `#EFEFEF` | `#525252`, 1px | Warning triangle | `Warning`     |
| Danger      | `#E8E8E8` | `#000000`, 2px | Circle X         | `Error`       |

All four states use `#000000` text. They also use:

- an explicit status word;
- a distinct icon;
- a visible neutral border;
- black text;
- a neutral-gray surface;
- structure or border weight when extra emphasis is required.

No state is distinguished by hue or shade alone. Destructive controls use explicit destructive
wording and a confirmation step; they do not depend on a red button. Automated contrast tests must
verify the locked pairs rather than changing them by visual approximation.

### Shape, elevation, and typography

- Keep Manrope as the single runtime family.
- Do not introduce a decorative serif or script family.
- Reduce the general radius scale to `0, 2, 4, 8px`; pill shapes remain only where the component
  meaning requires them.
- Normal cards and panels use borders instead of decorative shadows.
- Dialogs and sheets use `0 16px 48px rgb(0 0 0 / 18%)`; cards and normal panels have no shadow.
- Backgrounds and large sections remain pure white.
- Black full-width decorative sections are not part of the selected system.
- Motion remains functional: focus, open/close, progress, and state changes only.
- No ambient, looping, parallax, cursor-following, or decorative background motion.
- Animate UI icon source may animate once on a direct interaction or state change. It renders
  statically under reduced motion and never delays or replaces the text announcement.

### Logo and generated assets

Retain the supplied logo geometry but replace pink fills with a real monochrome rendering. Do not
apply a runtime CSS filter as the production solution.

The asset migration must:

1. create one canonical monochrome source;
2. regenerate favicon, Next.js icons, Apple icon, manifest icons, maskable icon, Open Graph image,
   and Twitter image;
3. use pure white and black only in brand artwork;
4. preserve transparency where required;
5. verify maskable safe zones;
6. search all source references before deleting any asset;
7. delete only assets proven unused or byte-for-byte redundant;
8. preserve the old artwork through Git history rather than retaining unused pink duplicates.

### Coming-soon layout

The approved page is a single, left-aligned responsive column:

1. A thin top navigation row with the monochrome mark, `UnseenPrompt`, and `Work in progress`.
2. A vertically centered main block.
3. Eyebrow, large sans-serif headline, short body, and inline email form.
4. Consent copy immediately below the form.
5. Minimal footer links for Privacy and Terms.

Desktop keeps the reading width bounded and does not stretch the copy across the viewport. Mobile
stacks the email field and button when the inline layout would reduce either touch target below
44px. The design does not contain a mock dashboard, waitlist card, decorative illustration, grid,
circle, line pattern, gradient, or background image.

## Component and Module Boundaries

### Presentation

- `ComingSoonLanding`: static page structure and approved copy.
- `WaitlistForm`: client-side form state, Turnstile widget, accessible validation, and live-region
  feedback.
- `WaitlistConfirmationPage`: reads a token from the URL fragment in the browser, presents a
  confirmation button, and submits the token in a request body.
- `WaitlistRemovalPage`: presents an explicit removal action and result.
- `ProductPreview`: the renamed non-production Phase 2 preview.

Presentation components do not instantiate Supabase or Resend clients and do not read server
secrets.

### Domain

A waitlist domain module owns:

- email normalization and validation;
- Turnstile result validation;
- random confirmation-token creation;
- SHA-256 confirmation-token hashing;
- confirmation expiry;
- request and delivery idempotency;
- persistence operations;
- confirmation-state transitions;
- removal-state transitions;
- public error mapping.

External dependencies sit behind narrow interfaces:

- `TurnstileVerifier`
- `WaitlistRepository`
- `ConfirmationMailer`
- `TokenGenerator`
- `Clock`

Tests use deterministic implementations of these interfaces. Production adapters use Cloudflare,
Supabase, Resend, Web Crypto, and the runtime clock.

### HTTP boundary

- `POST /api/waitlist/request`
- `POST /api/waitlist/confirm`
- `POST /api/waitlist/remove`

All three accept bounded JSON bodies, reject unsupported content types, validate with runtime
schemas, return discriminated public results, set `Cache-Control: no-store`, and never include
internal provider responses.

The confirmation email links to `/waitlist/confirm#token=<opaque-token>`. A URL fragment is not sent
in the initial HTTP request or referrer. Client code copies the token into the confirmation POST
body only after the person presses **Confirm my email**. Automated email scanners may load the
page, but a page load does not change waitlist state.

The same rule applies to removal links: loading a page never removes an address.

## Waitlist Data Design

### Table

Create an isolated `public.waitlist_entries` table with:

| Column                         | Purpose                                                   |
| ------------------------------ | --------------------------------------------------------- |
| `id`                           | Random UUID primary key                                   |
| `email`                        | Address required for confirmation and later launch notice |
| `email_normalized`             | Trimmed, lowercase unique lookup value                    |
| `status`                       | `pending`, `confirmed`, or `removed`                      |
| `consent_at`                   | Server timestamp for explicit waitlist consent            |
| `confirmation_token_hash`      | SHA-256 hash; raw token is never stored                   |
| `confirmation_expires_at`      | 24-hour confirmation deadline                             |
| `confirmation_sent_at`         | Delivery cooldown and audit boundary                      |
| `confirmation_idempotency_key` | Stable key for retrying the same Resend request           |
| `confirmed_at`                 | Server confirmation timestamp                             |
| `management_version`           | Integer used to revoke signed removal links               |
| `removed_at`                   | Server removal timestamp                                  |
| `created_at`                   | Server creation timestamp                                 |
| `updated_at`                   | Server-maintained update timestamp                        |

Do not store IP addresses, user-agent strings, page histories, referral codes, geolocation,
fingerprints, Turnstile tokens, raw confirmation tokens, or provider API responses.

`email` is personal data and remains readable only to the server role and authorized database
operators. It must not appear in application logs, analytics, health responses, error reports, test
fixtures, or deployment artifacts.

### Database security

- Enable Row-Level Security.
- Grant no table policy to `anon` or `authenticated`.
- Revoke direct function execution from public roles.
- Use a separate server-only Supabase client with `SUPABASE_SECRET_KEY`.
- Never import the server client into a client component.
- Never prefix the secret key with `NEXT_PUBLIC_`.
- Fix function `search_path` values explicitly.
- Use constrained function arguments and return enums rather than rows containing email.

Database functions make concurrent transitions atomic:

- `request_waitlist_confirmation(...)`
- `confirm_waitlist_entry(...)`
- `remove_waitlist_entry(...)`
- `purge_expired_waitlist_entries(...)`

The request function owns unique-email concurrency and returns only the internal action the server
must take: send confirmation, respect cooldown, return already-confirmed without sending mail, or
retry failed delivery. Public HTTP responses remain non-enumerating.

### Retention

- Confirmation tokens expire after 24 hours.
- After confirmation, the hash and original expiry remain only until that 24-hour window ends so a
  repeated confirmation request can return the same safe result. The daily purge clears both
  confirmation fields from confirmed rows after expiry.
- Pending entries older than 30 days are deleted.
- Removed entries are deleted by the daily purge after 24 hours; no suppression list is created in
  this phase.
- Confirmed entries remain until removal or the waitlist is closed.
- Before any later marketing or launch campaign, the retention period and removal link must be
  reviewed again.

Supabase Cron runs `purge_expired_waitlist_entries()` daily. The migration creates a named,
idempotent cron job. Database tests verify the purge function; environment verification confirms
that the hosted cron job exists and records successful runs.

## Request Flow

1. The form validates the bounded email shape locally for immediate feedback.
2. Turnstile creates a token using the production-only widget.
3. The client sends the email, Turnstile token, action name, and a request UUID to the server.
4. The server validates sizes and types before any external call.
5. The server verifies Turnstile through Siteverify.
6. It validates `success`, the expected action, and the approved hostname.
7. The server normalizes the email.
8. The database function atomically creates or updates the pending entry.
9. When delivery is required, Resend receives HTML and plain text with the stored idempotency key.
10. The server records successful delivery metadata without storing the provider response body.
11. The public response displays the same success message for new, pending, and confirmed
    addresses.

Turnstile validation uses a UUID idempotency key for retrying a transient Siteverify failure. It
does not trust the widget alone. Production keys allow only approved production hostnames. Local
and automated tests use Cloudflare's official test keys.

The Cloudflare widget uses Managed mode with light theme, `appearance: "interaction-only"`, and
`execution: "execute"`. The form requests a token on submit, displays the widget only if Cloudflare
requires interaction, and restores the submit control after expiry or failure. The Content Security
Policy admits only the documented Turnstile origins required by the widget and Siteverify flow.

## Delivery and Retry Behavior

Resend delivery is synchronous for this low-volume waitlist. No queue or Workflow is introduced.

- The same confirmation email retry reuses its Resend idempotency key.
- A pending address cannot trigger another new message within ten minutes.
- After the cooldown, the server rotates the confirmation token and expiry before sending again.
- A lost Resend response is retried with the same payload and idempotency key.
- A confirmed address receives the same public form response. It must not trigger repeated
  confirmation mail.
- Provider timeouts are bounded.
- Provider `429` and `5xx` responses map to the temporary public failure.
- Provider `4xx` configuration failures are logged as internal configuration events and still map
  to safe public copy.

Logs may contain an opaque request UUID, provider name, response category, duration, and terminal
status. Logs must not contain email, tokens, request bodies, API keys, confirmation URLs, or
provider response bodies.

## Confirmation and Removal

### Confirmation

1. The person opens the fragment-based email link.
2. The page does not mutate data on load.
3. Pressing **Confirm my email** sends the token in a no-store POST body.
4. The server hashes the token.
5. The database function returns `confirmed`, `already_confirmed`, `expired`, or `invalid`.
6. `confirmed` and `already_confirmed` show the same success state.
7. `expired` and `invalid` use the approved safe messages.

The operation is concurrency-safe and repeat-safe. Confirmation retains the token hash and original
expiry only for the remainder of its 24-hour window so an immediate retry can return the same safe
result. The daily purge then clears both confirmation fields from confirmed rows.

### Removal

Every post-confirmation email must include a route to an explicit removal page. The server creates
an HMAC-signed opaque token containing only the entry UUID and current `management_version`; it
contains no email address and the raw token is not stored. The link uses
`/waitlist/remove#token=<opaque-token>` so the token is not included in the initial request or
referrer. Loading the page does not remove data. Pressing **Remove my email** sends the token in a
no-store POST body and performs the idempotent removal.

A successful removal sets the status and timestamp and atomically increments
`management_version`, invalidating every previous removal link. Signature comparison is
constant-time. The token remains valid until removal, explicit version rotation, waitlist closure,
or application-secret rotation; manual removal remains available through the privacy address.

The privacy page also provides `privacy@unseenprompt.com` for manual requests. No marketing message
may be sent until its removal path is verified end to end.

## Privacy and Legal Surface

Production includes first-party `/privacy` and `/terms` pages before the waitlist is enabled. The
Privacy notice must state:

- the email address is collected to confirm and later announce availability;
- Supabase stores the entry;
- Resend delivers the confirmation and future approved messages;
- Cloudflare Turnstile processes anti-abuse signals;
- no marketing analytics or tracking pixels are used;
- pending entries are removed after 30 days;
- confirmed entries remain until removal or waitlist closure;
- how to request deletion.

Consent is not bundled with unrelated terms. The form does not pre-check a hidden marketing
preference and does not claim that joining creates an account.

## Environment Variables and Secrets

| Name                             | Visibility | Owner       | Purpose                                 |
| -------------------------------- | ---------- | ----------- | --------------------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public     | Cloudflare  | Production widget identifier            |
| `TURNSTILE_SECRET_KEY`           | Secret     | Cloudflare  | Siteverify server credential            |
| `SUPABASE_URL`                   | Server     | Supabase    | Waitlist project URL                    |
| `SUPABASE_SECRET_KEY`            | Secret     | Supabase    | Server-only database access             |
| `RESEND_API_KEY`                 | Secret     | Resend      | Confirmation delivery                   |
| `WAITLIST_TOKEN_SECRET`          | Secret     | Application | Signed management-token integrity       |
| `WAITLIST_FROM_EMAIL`            | Server     | Application | `UnseenPrompt <hello@unseenprompt.com>` |

The environment schema, dummy templates, GitHub environment documentation, Wrangler bindings, and
generated Worker types must stay aligned. Real values exist only in environment secret stores.
Dummy local and CI values must be visibly non-production.

Production startup fails closed when the coming-soon waitlist is enabled but a required secret is
missing or malformed. Non-production product preview builds do not require real waitlist secrets.

## Accessibility and Interaction

- One visible `<h1>`.
- The email input has a persistent label, appropriate autocomplete, input mode, and error
  association.
- Submit and confirmation status uses a stable polite live region.
- Failure uses `role="alert"` only when immediate attention is required.
- Turnstile expiration resets the widget and explains the next action.
- All controls remain keyboard reachable with visible monochrome focus indicators.
- Touch targets are at least 44px on mobile.
- The form remains usable at 200% text zoom without horizontal scrolling.
- Reduced motion removes nonessential movement.
- Forced colors preserve borders, focus, status icons, selection, and button affordance.
- Confirmation and removal never depend on color or icon alone.
- Email HTML has a logical reading order and a complete plain-text alternative.

## Testing Strategy

### Unit and component

- Email normalization, length bounds, and invalid forms.
- Token entropy boundary, SHA-256 hashing, expiry, and constant-time signature verification where
  applicable.
- Turnstile success, action mismatch, hostname mismatch, expiry, duplicate token, timeout, and
  provider failure.
- Resend success, retry with the same idempotency key, `409`, `429`, timeout, and `5xx`.
- New, pending-within-cooldown, pending-after-cooldown, confirmed, expired, removed, and concurrent
  submissions.
- Public response non-enumeration.
- Waitlist form pending, success, validation, verification, provider-failure, and retry states.
- Stable live-region and focus behavior.
- Environment-aware metadata and manifest copy.
- Public-copy policy rejects prohibited phrases in the defined scope.

### Database

- Migration from a fresh database.
- RLS enabled and direct `anon` / `authenticated` access denied.
- Server-role request, confirm, remove, and purge functions.
- Unique normalized email under concurrent requests.
- Atomic confirmation and idempotent repeat.
- Token expiry and ten-minute resend cooldown.
- Thirty-day pending purge.
- Functions cannot leak email or token hashes in public return values.

### Browser

- Production `/` contains only the coming-soon page.
- Production does not contain shell navigation, preview cards, disabled product links, environment
  variables, or secrets.
- Staging/preview/local continue to contain the product shell.
- Production `/design-system` returns exactly 404.
- Successful request uses test adapters and shows the approved live-region copy.
- Invalid email, Turnstile failure, provider failure, confirmation, expiry, and removal.
- Keyboard-only flow, focus order, 200% zoom, reduced motion, and forced colors.
- Axe serious-impact checks on landing, confirmation, removal, Privacy, and Terms.
- Pure-white monochrome visual baselines on Darwin and Linux at mobile and wide viewports.
- Visual assertions reject pink pixels outside image antialiasing tolerance and reject decorative
  background patterns.

### Build and Worker

- Next.js production build for each supported application environment.
- Cloudflare OpenNext build and dry run.
- Generated Worker types.
- Worker dependency policy.
- Public health and authenticated Workflow smoke.
- Immutable candidate URL reports the expected release SHA.
- Candidate `/`, `/design-system`, confirmation page, and API method behavior.

## Release Design

### Before merge

1. Keep repository variable `PRODUCTION_DEPLOY_ENABLED=false`.
2. Run full local verification.
3. Run PR Quality, Database, Cloudflare Preview, and secret scanning.
4. Build and test with `APP_ENV=production`.
5. Upload an immutable production candidate without assigning live traffic.
6. Smoke the candidate URL and review the final screenshots and real page.

Candidate validation is non-mutating: it checks page rendering, route status, headers, and rejected
HTTP methods but never submits the live form. Domain integration tests use deterministic test
adapters in CI. A controlled synthetic address is used only after the version is promoted to the
production hostname, then confirmed and removed during the same smoke procedure.

### Promotion

1. Merge only after the approved candidate and green CI.
2. Let the normal `main` release deploy and smoke the Phase application on staging.
3. Confirm the merged SHA and production candidate match.
4. Set `PRODUCTION_DEPLOY_ENABLED=true`.
5. Invoke the protected release workflow for the exact `main` SHA.
6. Upload and promote the production version.
7. Smoke the production hostname, release identity, landing page, hard design-system 404, and one
   controlled waitlist path.
8. Set `PRODUCTION_DEPLOY_ENABLED=false` immediately after successful smoke.
9. Verify the variable read-back is exactly `false`.

The release workflow gains a protected manual trigger for an exact `main` SHA. It retains the
existing staging dependency, domain-verification gate, environment secrets, concurrency control,
dry run, version upload, explicit promotion, and smoke test. A manual trigger does not bypass the
production-enable variable.

### Later Phase merges

With the production variable false, later merges continue to deploy and smoke staging while the
coming-soon production version remains untouched. Replacing the coming-soon page with the product
requires a separate approved release decision.

### Rollback

If production smoke fails:

1. disable production promotion;
2. redeploy the last known-good coming-soon Worker version;
3. smoke the rollback release identity and public routes;
4. verify no migration needs reversal;
5. preserve waitlist rows unless the incident involves data integrity or exposure;
6. rotate any credential involved in an exposure.

Database migrations in this scope are additive. Rollback must not drop the waitlist table or delete
confirmed addresses.

## Operational Controls

- Turnstile hostname restrictions and analytics are reviewed after release.
- An edge rate limit allows five waitlist requests per source per minute with a one-minute
  mitigation window. The application does not store the source address.
- Supabase Cron history is checked for daily cleanup failures.
- Resend domain verification and tracking-disabled configuration are release gates.
- Logs and error monitoring use opaque IDs only.
- Waitlist count is not public.
- No administrator list UI is added in this phase.
- Any manual export is owner-authorized, access-controlled, and excluded from source control.

## Exit Criteria

The work is complete only when:

1. Production serves the approved pure-white coming-soon page.
2. Staging still serves the Phase application shell.
3. Production `/design-system` is an exact 404.
4. The repository contains no active Powder Pink product tokens or generated pink brand assets.
5. The logo, icons, manifest, and social cards are monochrome.
6. Public runtime copy follows the approved voice and prohibited phrases are guarded.
7. A real production address can request, receive, and confirm once.
8. Duplicate and concurrent requests do not send duplicate emails.
9. Pending records purge after 30 days.
10. Removal works without exposing whether another address exists.
11. No client bundle, log, response, or artifact contains a secret or waitlist email.
12. Accessibility and platform-specific visual gates pass.
13. The immutable candidate and production release report the expected SHA.
14. Production promotion is paused again after release.
15. Staging continues to deploy automatically for later Phase work.
