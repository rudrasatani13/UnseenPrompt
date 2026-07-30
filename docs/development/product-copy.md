# Product Copy

This guide applies to active public product surfaces: application UI, metadata, web manifest
content, email templates, README, and current product documentation. Dated plans and
specifications are historical records and are not rewritten to match new product copy.

## Voice

UnseenPrompt sounds like a small team explaining useful software to another person. It is:

- plain;
- specific;
- calm;
- slightly informal;
- technically accurate;
- honest about what exists now.

It does not sound like a category definition, investor deck, generated landing page, or chatbot.

## Public-copy rules

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

## Prohibited public language

Public-facing source must not introduce the phrases in this declaration:

```ts
const prohibited = [
  "Stateful Project Copilot",
  "AI-powered",
  "agent-ready",
  "revolutionary",
  "unlock",
  "supercharge",
  "seamless",
  "game-changing",
] as const;
```

It also does not use category labels such as copilot, intelligent, smart, next-generation,
effortless, cutting-edge, magic, or cheat code, or the phrase “transform your workflow.” Do not
use the standalone term “AI” as public positioning. Internal technical documentation may use it
only where required to describe an actual provider, model boundary, cost, security control, or
system behavior.

## Evidence rules

Never claim that a planned feature already exists. Never claim a time saving, quality improvement,
user count, launch date, or reliability level without evidence. Claims about results distinguish
between what a person reported, what evidence supports, what a person confirmed, and what a test
or runtime check verified.

## Approved production copy

### Navigation

- Brand: `UnseenPrompt`
- Secondary note: `Building now`

There are no fake navigation destinations, login button, pricing link, or social-proof claims.

### Landing page

Eyebrow:

> For the work between coding sessions

Headline:

> Bring the half-finished thing.

Body:

> A bug. A half-built feature. A project you haven’t touched in two weeks. UnseenPrompt is being
> built to keep the decisions, evidence, and next step together—and prepare one focused prompt for
> Claude Code, Codex, or Cursor.

Form label:

> Email address

Submit button:

> Tell me when I can try it

Consent:

> One confirmation email now. After that, we’ll only write when there’s something worth trying.
> Unsubscribe anytime.

Submit success:

> Check your inbox to confirm your email.

Status near the form:

> No countdown. We’ll share a date when one is real.

Secondary action:

> See the full example

Continuity rail:

> Bring what exists
>
> A note, error, screenshot, or half-built repo.
>
> Keep what matters
>
> Decisions, constraints, attempts, and evidence.
>
> Continue where you work
>
> Carry the handoff into Claude Code, Codex, Cursor, or wherever you work next.

Dark-section heading:

> The next tool gets the state, not the whole story.

Context-file objection:

> Why not just use CLAUDE.md?
>
> Keep using it.
>
> CLAUDE.md is useful for stable repository instructions—commands, conventions, architecture, and
> rules the tool should always follow.
>
> UnseenPrompt is for the moving state: what failed today, what you decided, which evidence is
> confirmed, and what the next session should do.

Closing CTA:

> One email when there’s something usable.

Footer:

> Built independently by Rudra Satani
>
> No tracking pixels. Email confirmation required. Unsubscribe anytime.

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

## Enforcement

Run `pnpm test:copy` before submitting public-copy changes. The test scans active source files and
reports each prohibited phrase with its repository-relative path. It excludes dependencies,
generated files, dated `docs/superpowers/plans` and `docs/superpowers/specs` records, and the
exact declaration above.
