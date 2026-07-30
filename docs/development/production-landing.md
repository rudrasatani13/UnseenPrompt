# Production Landing

**Status:** Active

**Last updated:** 2026-07-30

This document is the source of truth for the production waitlist page. Product wording is also
recorded in [`product-copy.md`](product-copy.md); visual tokens and component rules live in
[`design-system.md`](design-system.md).

## Positioning

UnseenPrompt is being built as project continuity between coding sessions. It keeps changing work
state—decisions, constraints, attempts, evidence, and one next action—separate from static
repository instructions and noisy chat history. It then prepares one focused prompt for the coding
tool the person already uses.

The production page must not imply that the product is already usable or connected to a real
repository.

## Page sequence

1. Header with brand and `Building now`
2. Situation-first hero and waitlist form
3. User-controlled synthetic checkout handoff
4. Three-part continuity rail
5. Black project-state section
6. `Why not just use CLAUDE.md?` objection
7. Final waitlist CTA
8. Founder and privacy trust details

## Hero

- Eyebrow: `For the work between coding sessions`
- Headline: `Bring the half-finished thing.`
- Body: `A bug. A half-built feature. A project you haven’t touched in two weeks. UnseenPrompt is
being built to keep the decisions, evidence, and next step together—and prepare one focused
prompt for Claude Code, Codex, or Cursor.`
- Primary CTA: `Tell me when I can try it`
- Secondary CTA: `See the full example`
- Status: `No countdown. We’ll share a date when one is real.`

## Interactive proof

The checkout handoff is a synthetic, local UI example labeled `Example`. It is not connected to
user data, a repository, or a product backend. Public copy avoids calling it “real” or
“anonymized.”

Required states:

1. What happened
2. Decisions
3. Evidence
4. Next prompt

The tabs must be keyboard operable. Nothing autoplays. Copying the next prompt announces success or
failure through a live region.

## Black-section meaning

Black is reserved for the compact state delivered to the next coding session:

1. What happened
2. What stays decided
3. What counts as proof
4. What happens next

Do not place a blur, glow, gradient, or empty transition band before the section. The color change
is a deliberate semantic boundary.

## Trust constraints

- No launch date or countdown unless a real date is approved.
- No user counts, testimonials, counters, or invented social proof.
- No tracking pixels or newsletter claim.
- Email confirmation and unsubscribe behavior must remain accurately described.
- `Built independently by Rudra Satani` is the only founder claim.
- Only real contact and policy links may be rendered.

## Typography

- Mona Sans Variable: headings and body
- IBM Plex Mono: eyebrows, state labels, step numbers, and prompt metadata
- Do not apply mono to the whole product example.
- Do not use serif display type on the production landing.

## Validation

Automated checks cover semantics, keyboard-accessible tabs, copy feedback, responsive rendering,
and WCAG 2.2 AA serious/critical issues. Human comprehension validation follows
[`production-landing-comprehension-test.md`](../research/production-landing-comprehension-test.md).
