# UnseenPrompt — Development Plan

---

**Version:** 1.0.0  
**Last Updated:** July 2026  
**Status:** Approved Plan — Pre-Development  
**Brand:** UnseenPrompt  
**Product:** Project-planning application
**Primary Domain:** `unseenprompt.com` (purchased)  
**Companion Doc:** `UnseenPrompt – PRODUCT_PLAN.md`

---

## About This Document

This is the development-only companion to the UnseenPrompt Master Plan. It defines what to build, in what order, with clear deliverables, dependencies, and exit criteria.

It intentionally contains:

- Architecture and project foundations.
- Data, AI, workflow, UI, billing, security, testing, and deployment work.
- Development sequencing and release gates.

It intentionally excludes:

- Product overview and strategic positioning beyond what development requires.
- Marketing, growth, publicity, content, partnerships, and sales execution.
- Pricing strategy and revenue projections.
- Source-code snippets and shell-command instructions.
- External research notes and citations.

The roadmap contains **18 phases numbered 0–17**.

---

## Locked Technology Stack

**Application:** Next.js App Router with strict TypeScript.  
**Hosting:** Cloudflare Workers through OpenNext.  
**Durable work:** Cloudflare Workflows.  
**Authentication:** Supabase Auth with Google OAuth and email magic link.  
**Database:** Supabase PostgreSQL with Row-Level Security.  
**File storage:** Supabase private Storage.  
**UI:** Token-based Warm Editorial design system with Powder Pink palette.  
**AI gateway:** Typed provider-neutral interface with structured outputs.  
**AI providers:** Anthropic, OpenAI, and Gemini Developer API.  
**Coding-agent targets:** Claude Code, OpenAI Codex, and Cursor.  
**Billing:** Paddle Billing with Paddle Checkout and customer portal.  
**Abuse controls:** Cloudflare rate limiting and Turnstile.  
**Validation:** Runtime schemas plus deterministic lifecycle and safety policies.  
**Error monitoring:** Sentry with sensitive-data filtering.  
**Product analytics:** Privacy-conscious PostHog events.  
**Runtime monitoring:** Cloudflare observability.

### Global Development Constraints

- The MVP supports websites and web applications only.
- The MVP supports personal accounts only.
- The application UI is English.
- User input may be multilingual.
- Coding-agent prompts are technical English.
- The interface presents one question or one active prompt at a time.
- Models propose state changes; deterministic code validates them; users confirm them.
- Claude Code, Codex, and Cursor share one canonical project state.
- Files are private, bounded, and treated as untrusted.
- No direct repository, IDE, or local-machine access exists in the MVP.
- No lifecycle mode is publicly enabled before its release gates pass.
- All state-changing operations are owner-scoped and idempotent.
- Cloudflare runtime compatibility is verified before production deployment.

---

## How This Plan Is Structured

| Milestone | Phases | Outcome |
|---|---:|---|
| M0 — Platform Foundation | 0–4 | Repository, Cloudflare environments, design system, Supabase data, authentication, profile, and memory |
| M1 — Stateful AI Core | 5–9 | Provider gateway, project state, adaptive discovery, confirmed brief, and tool-specific prompt generation |
| M2 — Evidence and Lifecycle | 10–13 | Private artifacts, result analysis, user-confirmed progression, and complete lifecycle modes |
| M3 — Product and Commercial Surface | 14–15 | Project library, usage, Paddle Free/Pro entitlements, and billing management |
| M4 — Hardening and Release | 16–17 | Security, reliability, evaluations, end-to-end validation, deployment, and public-beta readiness |

Each phase contains **Goal · Tasks · Deliverables · Exit criteria · Depends on**.

---

## Phase 0 — Repository and Engineering Foundations

**Goal:** Establish a maintainable application repository with development conventions and automated quality gates.

**Tasks**

- Create the UnseenPrompt repository structure for the Next.js application, shared domain modules, tests, database migrations, Cloudflare configuration, and documentation.
- Configure strict TypeScript, linting, formatting, import boundaries, and environment validation.
- Establish naming conventions for domain entities, routes, UI components, database migrations, workflows, and test fixtures.
- Define local, staging, and production environment contracts.
- Create the committed environment-variable template using dummy values only.
- Configure continuous integration for lint, typecheck, unit tests, database tests, build, and Cloudflare preview validation.
- Add the approved Master Plan, Development Plan, and design specification to project documentation.
- Configure application identity as UnseenPrompt with domain metadata prepared for `unseenprompt.com`.

**Deliverables:** Repository skeleton, environment contract, automated quality pipeline, and project documentation.

**Exit criteria:** The application builds in continuous integration, the test runner executes, environment validation fails safely on missing required values, and the Cloudflare preview bundle is created successfully.

**Depends on:** —

---

## Phase 1 — Cloudflare Runtime and Environment Topology

**Goal:** Run the application reproducibly on Cloudflare Workers across isolated environments.

**Tasks**

- Configure Next.js deployment through the Cloudflare OpenNext adapter.
- Enable the required Workers compatibility settings.
- Create separate local, staging, preview, and production environment configurations.
- Define Cloudflare secrets, public build variables, observability, and deployment bindings.
- Configure preview deployments for non-production branches and controlled production deployment from the release branch.
- Add a runtime health surface that reports application readiness without exposing secrets.
- Define the Cloudflare Workflows binding and a minimal workflow health path.
- Establish a dependency policy that rejects packages incompatible with the Workers runtime.
- Prepare custom-domain configuration for `unseenprompt.com`; DNS and Cloudflare ownership verification remain deployment gates.

**Deliverables:** Cloudflare deployment configuration, staging deployment, environment isolation, health checks, and workflow binding.

**Exit criteria:** Staging serves the application through Cloudflare Workers, environment values remain isolated, runtime health passes, and the production bundle passes Workers preview validation.

**Depends on:** Phase 0.

---

## Phase 2 — Design System and Application Shell

**Goal:** Build the approved Warm Editorial interface foundation with Powder Pink semantic tokens.

**Tasks**

- Define semantic color, typography, spacing, radius, shadow, border, focus, status, and motion tokens.
- Validate accessible contrast for text, controls, focus rings, errors, warnings, success, and disabled states.
- Build reusable primitives for buttons, inputs, text areas, cards, badges, tabs, dialogs, sheets, dropdowns, progress, file items, skeletons, empty states, alerts, and toasts.
- Build product-specific primitives for lifecycle steps, confirmation cards, evidence labels, prompt panels, question choices, tool selection, usage meters, and risk warnings.
- Create responsive application navigation for New Project, Projects, Profile, and Usage.
- Add loading, error, not-found, and maintenance boundaries.
- Add reduced-motion behavior and full keyboard navigation.
- Create an internal component gallery for visual and accessibility review.

**Deliverables:** Design tokens, reusable component system, responsive shell, and component gallery.

**Exit criteria:** All primary interface patterns can be composed from the shared system, keyboard navigation works, contrast checks pass, and desktop/mobile layouts remain usable.

**Depends on:** Phase 0.

---

## Phase 3 — Supabase Data Platform and Ownership Model

**Goal:** Create the durable, owner-isolated data foundation for personal projects.

**Tasks**

- Provision isolated Supabase projects or branches for local development, staging, and production.
- Define migrations for profiles, preferences, subscriptions, entitlements, usage ledger, projects, requirements, decisions, milestones, project events, project summaries, generation runs, prompt versions, agent returns, artifacts, artifact extractions, and completion suggestions.
- Apply direct ownership or project-derived ownership to every user-controlled record.
- Implement Row-Level Security policies for reads, inserts, updates, and deletes.
- Define immutable prompt-version and append-only project-event constraints.
- Define atomic project projection and event-write behavior.
- Add idempotency records for generation, upload, workflow, lifecycle, and billing operations.
- Configure private Storage buckets and object-path ownership conventions.
- Create deterministic seed data for each lifecycle mode and user skill profile.

**Deliverables:** Versioned database schema, RLS policies, private storage structure, seed data, and migration tests.

**Exit criteria:** A fresh environment migrates cleanly, cross-user access is denied by database tests, prompt versions cannot be overwritten, project transitions record an event atomically, and private files cannot be accessed without authorization.

**Depends on:** Phase 1.

---

## Phase 4 — Authentication, Profile, and Basic Memory

**Goal:** Provide secure personal accounts and reusable preferences.

**Tasks**

- Implement Google OAuth and email magic-link authentication through Supabase Auth.
- Establish server-side session validation for protected routes and mutations.
- Create onboarding for skill level, preferred stack behavior, coding style, deployment preference, locale, and time zone.
- Build profile and preference management.
- Apply profile memory only through explicit fields controlled by the user.
- Allow per-project overrides without mutating global preferences.
- Implement account sign-out, project export preparation, and account-deletion request flow.
- Add authorization tests covering expired sessions, missing sessions, account switching attempts, and direct object access.

**Deliverables:** Authentication flows, protected application shell, profile, basic memory, and deletion flow.

**Exit criteria:** Users can sign in through both approved methods, protected data remains private, preferences affect new projects, project overrides remain local, and unauthorized access tests pass.

**Depends on:** Phases 2 and 3.

> **End of M0 — Platform Foundation.**

---

## Phase 5 — Typed Model Gateway and Provider Contracts

**Goal:** Provide one validated AI interface across Anthropic, OpenAI, and Gemini.

**Tasks**

- Define provider-neutral request, response, usage, error, timeout, and retry contracts.
- Create provider adapters for Anthropic, OpenAI, and Gemini Developer API.
- Define structured schemas for intent detection, discovery sufficiency, clarification questions, project deltas, stack recommendations, action specifications, evidence analysis, completion suggestions, and risk flags.
- Validate every provider response before application use.
- Add one structured repair attempt for malformed model output.
- Add controlled fallback when the primary provider fails.
- Record provider, model, latency, tokens, estimated cost, retry count, validation result, and correlation ID.
- Exclude prompts, files, and extracted project content from ordinary logs.
- Add configuration for primary, fallback, and optional reviewer models.

**Deliverables:** Typed model gateway, three provider adapters, schema validation, fallback policy, and usage metadata.

**Exit criteria:** All providers pass the same contract suite, malformed output cannot reach project state, fallback preserves the schema, and sensitive content does not appear in diagnostic logs.

**Depends on:** Phases 1 and 3.

---

## Phase 6 — Project State Engine and Context Compiler

**Goal:** Make confirmed structured state the durable source of truth for every project.

**Tasks**

- Define lifecycle modes: New Build, Feature, Bug, Review, Test, Deploy, and Improve.
- Define project stages from discovery through iteration, completion, blocking, and archive.
- Implement allowed transition rules and confirmation requirements.
- Store proposed and confirmed requirements separately.
- Store architectural decisions with rationale, source, and change history.
- Store milestones with suggested and user-confirmed status.
- Build the append-only project event model and current project projection.
- Build the Context Compiler that selects confirmed requirements, active mode/stage, relevant decisions, user preferences, recent evidence, and active milestone context.
- Enforce token and size budgets without discarding confirmed invariants.
- Add contradiction detection when new proposals conflict with confirmed decisions.

**Deliverables:** Lifecycle engine, confirmed project model, event log, project projection, and Context Compiler.

**Exit criteria:** Project state survives repeated sessions, invalid transitions fail safely, duplicate transitions remain idempotent, confirmed decisions remain present in compiled context, and conflicting proposals require reconfirmation.

**Depends on:** Phases 3 and 5.

---

## Phase 7 — Home Composer, Intent Routing, and Adaptive Discovery

**Goal:** Turn a natural-language request into sufficient confirmed project context without a fixed questionnaire.

**Tasks**

- Build the Home Composer with multilingual input and optional attachment entry.
- Detect the lifecycle mode with confidence and rationale.
- Display the detected mode and allow correction.
- Implement the discovery-sufficiency evaluator.
- Generate one question at a time with an explanation, suggested answers, and free text.
- Let every confirmed answer influence the next sufficiency decision.
- Stop discovery as soon as required context is sufficient.
- Persist question, answer, rationale, and confirmation events.
- Support interruption and later resume without repeating answered questions.
- Add abandonment, retry, loading, and provider-failure states.

**Deliverables:** Home Composer, intent selector, adaptive question flow, and resumable discovery state.

**Exit criteria:** Each supported intent reaches a sufficient-state proposal from representative inputs, discovery does not use a fixed question count, resumed projects do not repeat confirmed questions, and multilingual input produces clear English project facts.

**Depends on:** Phases 2, 5, and 6.

---

## Phase 8 — Brief Confirmation and Stack Recommendation

**Goal:** Convert discovery into an explicit, user-approved project brief and stack decision.

**Tasks**

- Generate a concise project summary covering audience, problem, goals, scope, constraints, success criteria, risks, and unresolved blockers.
- Generate a technology-stack recommendation with rationale based on project needs and user skill.
- Allow the user to accept, edit, or replace each proposed decision.
- Record confirmed requirements and decisions as durable state.
- Require explicit reconfirmation when a later change affects dependent decisions.
- Show the downstream impact of replacing the confirmed stack.
- Create a readiness gate that prevents prompt generation when critical context remains unresolved.

**Deliverables:** Confirmed project brief, stack recommendation flow, decision-change flow, and readiness gate.

**Exit criteria:** The user can review and confirm the project definition, critical gaps block generation, stack changes are versioned, and accepted decisions appear in future compiled context.

**Depends on:** Phases 6 and 7.

---

## Phase 9 — Prompt Orchestrator, Tool Adapters, and Versioning

**Goal:** Generate one high-quality, traceable prompt for Claude Code, Codex, or Cursor.

**Tasks**

- Define the canonical action specification: purpose, context, boundaries, task, expected result, acceptance criteria, verification, and risk flags.
- Build the Prompt Orchestrator using confirmed state and the active milestone.
- Build deterministic adapters for Claude Code, Codex, and Cursor.
- Keep tool wording separate from project truth.
- Add completeness, contradiction, secret-reference, destructive-action, and scope linting.
- Display one selected-tool prompt at a time.
- Allow copy, edit, regenerate, and tool switch.
- Create an immutable prompt version for every delivered or user-edited prompt.
- Record the exact project-state version and generation run used.
- Prevent future prompts from being shown as a bundle.

**Deliverables:** Canonical action specification, three tool adapters, prompt workspace, linting, and immutable versions.

**Exit criteria:** All three tool prompts preserve identical confirmed requirements, every prompt contains an expected result and acceptance criteria, high-risk prompts include safety expectations, edits create new versions, and only one action is active.

**Depends on:** Phases 5, 6, and 8.

> **End of M1 — Stateful AI Core.**

---

## Phase 10 — Private Artifact Intake and Cloudflare Processing

**Goal:** Accept useful evidence safely without exposing private files or allowing uncontrolled processing.

**Tasks**

- Implement signed private uploads for approved text, source-code, PDF, and image types.
- Enforce plan-based file count and size limits.
- Reject executable binaries, archives, unsupported media, and MIME mismatches.
- Store object metadata, ownership, type, size, and content hash.
- Trigger an idempotent Cloudflare Workflow for extraction.
- Extract bounded text and screenshot OCR where supported.
- Detect and redact likely secrets before model transmission.
- Treat embedded instructions as untrusted evidence.
- Store original artifact and validated extraction separately.
- Support retry, deletion, purge scheduling, and extraction-status visibility.

**Deliverables:** Private upload flow, validation, Workflow extraction, redaction, and artifact lifecycle.

**Exit criteria:** Unauthorized file access fails, unsupported files are rejected, duplicate uploads do not duplicate processing, extraction failures are recoverable, and detected secrets are excluded from model context.

**Depends on:** Phases 1, 3, and 4.

---

## Phase 11 — Returned Result Analysis and Confirmed Progress

**Goal:** Turn coding-agent output and evidence into a controlled project-state update.

**Tasks**

- Build result intake for pasted output, logs, screenshots, and relevant files.
- Link every return to the prompt version that produced it.
- Extract claimed changes, errors, blockers, test results, and referenced files.
- Compare evidence against the prompt's acceptance criteria.
- Produce one suggested state: completed, needs verification, blocked, or still in progress.
- Display separate Claimed, Evidence Supplied, User Confirmed, and Verified labels.
- Require user confirmation before updating milestones or lifecycle stage.
- Record rejected suggestions without changing confirmed state.
- Generate the next action only after the progress decision is resolved.
- Preserve a manual correction path when analysis is wrong.

**Deliverables:** Result-intake workspace, evidence analysis, completion suggestion, confirmation flow, and next-action trigger.

**Exit criteria:** Agent prose alone never becomes Verified, user rejection leaves durable state unchanged, accepted progress writes one atomic event, duplicate returns remain idempotent, and the next action reflects the confirmed result.

**Depends on:** Phases 6, 9, and 10.

---

## Phase 12 — Feature, Bug, Review, and Test Modes

**Goal:** Extend the proven stateful loop beyond New Build while preserving one project truth.

**Tasks**

- Implement Feature mode discovery, impact analysis, acceptance criteria, and integration prompts.
- Implement Bug mode evidence intake, reproduction requirements, root-cause guidance, regression expectations, and safe-fix prompts.
- Implement Review mode scopes for maintainability, accessibility, performance, and security.
- Implement Test mode planning for unit, integration, end-to-end, accessibility, and failure-path coverage.
- Allow a mode to operate within any current project stage.
- Preserve confirmed requirements and stack invariants across mode changes.
- Add mode-specific prompt linting and evidence expectations.
- Build representative fixtures and evaluation cases for each mode and skill level.

**Deliverables:** Feature, Bug, Review, and Test workflows integrated into the common state engine.

**Exit criteria:** Each mode completes the full discovery-to-return loop, mode changes do not erase project context, bug fixes include regression expectations, reviews stay within the selected scope, and all mode evaluation gates pass.

**Depends on:** Phases 7–11.

---

## Phase 13 — Deploy and Improve Modes with Risk Controls

**Goal:** Complete the lifecycle with controlled deployment and post-build improvement workflows.

**Tasks**

- Implement Deploy mode discovery for environment, hosting, database, migrations, secrets, domain, monitoring, rollback, and verification.
- Detect production-impacting actions and require explicit acknowledgment.
- Generate deployment prompts that verify targets and preserve rollback paths.
- Prevent inferred authorization for destructive database, Git, billing, auth, or infrastructure operations.
- Implement Improve mode discovery for usability, accessibility, maintainability, performance, reliability, and security goals.
- Prioritize improvements using project evidence and user goals.
- Keep speculative refactors out of generated prompts unless explicitly selected.
- Add lifecycle completion and iteration transitions.
- Prepare production-domain handling for `unseenprompt.com`.

**Deliverables:** Deploy and Improve workflows, high-risk confirmation policy, rollback-aware prompts, and lifecycle completion.

**Exit criteria:** Production prompts include target, migration, secret, monitoring, rollback, and verification expectations; destructive actions cannot be silently authorized; improvement prompts remain scoped; and all lifecycle modes share one project state.

**Depends on:** Phases 9, 11, and 12.

> **End of M2 — Evidence and Complete Lifecycle.**

---

## Phase 14 — Project Library, Search, History, and User Controls

**Goal:** Let users manage and resume long-running personal projects.

**Tasks**

- Build the personal project library with search and filters by mode, stage, tool, and update time.
- Show current stage, active milestone, selected tool, last activity, and blockers.
- Implement resume, archive, restore, and delete flows.
- Build prompt-version and project-event history views.
- Build requirement and decision views with confirmation and change history.
- Add artifact management and per-project storage visibility.
- Build profile memory controls and per-project overrides.
- Add project export containing user-owned structured state and prompt history.
- Ensure empty, loading, permission, deleted, and partial-processing states are understandable.

**Deliverables:** Personal library, project history, state inspection, artifact controls, and export.

**Exit criteria:** Users can find and resume projects, archived projects remain recoverable, deleted projects become inaccessible immediately, history accurately explains changes, and exports contain only the requesting user's data.

**Depends on:** Phases 4, 6, 9, 10, and 11.

---

## Phase 15 — Paddle Billing, Entitlements, and Usage Ledger

**Goal:** Enforce Free and Pro access through reliable server-side commercial state.

**Tasks**

- Define Free and Pro entitlement records for generations, premium models, storage, file processing, and retention.
- Integrate Paddle Checkout and the customer portal.
- Store Paddle customer and subscription identifiers against the authenticated user.
- Verify webhook signatures against the original payload.
- Deduplicate webhook events and reject stale state changes.
- Handle subscription creation, activation, update, past-due, pause, cancellation, and scheduled changes.
- Maintain a lean local entitlement cache.
- Reconcile active subscriptions periodically through Cloudflare Workflows.
- Implement a generation and file-processing usage ledger.
- Charge usage only for accepted provider execution and successful billable processing.
- Build Usage and Billing screens with plan, remaining allowance, renewal state, and portal access.
- Keep paid checkout disabled until Paddle seller approval is complete.

**Deliverables:** Paddle checkout, portal, webhook synchronization, entitlements, usage ledger, and billing UI.

**Exit criteria:** Client events cannot grant Pro access, duplicate/out-of-order webhooks do not corrupt entitlements, reconciliation repairs drift, quota checks are server-side, and sandbox subscription lifecycle tests pass.

**Depends on:** Phases 3, 4, 5, and 14.

> **End of M3 — Product and Commercial Surface.**

---

## Phase 16 — Security, Reliability, Privacy, and Observability

**Goal:** Harden all boundaries before public release.

**Tasks**

- Review authentication, session, authorization, RLS, private storage, signed access, and administrative paths.
- Verify service-role, model, Paddle, and Cloudflare secrets never enter client bundles or logs.
- Add Turnstile and rate limiting to authentication, upload, and generation abuse paths.
- Enforce request size, schema, ownership, state-transition, and idempotency checks.
- Verify secret redaction and prompt-injection boundaries for artifacts.
- Add sensitive-data filtering to Sentry and product analytics.
- Add structured correlation across requests, model calls, workflows, state events, and billing events.
- Add retries and manual recovery for provider, extraction, workflow, and webhook failures.
- Add periodic cleanup and account/project/artifact purge workflows.
- Define health indicators and operational alerts for provider failures, workflow backlog, database issues, and billing drift.
- Complete a dependency and runtime-compatibility review.

**Deliverables:** Hardened authorization, abuse controls, privacy filters, recovery paths, cleanup workflows, monitoring, and security checklist.

**Exit criteria:** Cross-user access tests fail closed, secrets do not appear in builds/logs, abuse controls activate, partial failures recover without duplicate state or charges, deletion policies execute, and security review findings are resolved.

**Depends on:** Phases 1–15.

---

## Phase 17 — Evaluation, End-to-End Testing, and Public-Beta Readiness

**Goal:** Prove the complete product works safely and consistently before release.

**Tasks**

- Build a versioned evaluation set across all lifecycle modes, three user skill levels, multilingual input, all three coding tools, long project histories, changed decisions, conflicting evidence, and high-risk operations.
- Score continuity, contradiction rate, actionability, tool fit, safety, unnecessary questions, acceptance-criteria completeness, and evidence-label correctness.
- Establish blocking regression thresholds for every advertised mode.
- Complete unit tests for transitions, Context Compiler selection, adapters, linting, quotas, and webhook ordering.
- Complete RLS, immutable-version, event-atomicity, and idempotency database tests.
- Complete provider contract tests for Anthropic, OpenAI, and Gemini.
- Complete integration tests for Auth, private files, Cloudflare Workflows, model fallback, Paddle sandbox, and reconciliation.
- Complete end-to-end journeys from project creation through multiple returned results and final lifecycle progression.
- Complete accessibility, keyboard, responsive, performance, and failure-path validation.
- Validate staging deployment through the Cloudflare production runtime.
- Configure `unseenprompt.com` only after DNS and Cloudflare ownership are verified.
- Publish only lifecycle modes that pass their complete release gates.
- Prepare operational recovery and rollback documentation.

**Deliverables:** Evaluation suite, complete automated tests, accessibility and performance results, release checklist, deployment validation, and operational runbook.

**Exit criteria:** All blocking suites pass, no advertised mode fails its evaluation threshold, staging reproduces production behavior, critical/high security findings are closed, billing and deletion flows are verified, and the release checklist is signed off.

**Depends on:** Phases 0–16.

> **End of M4 — UnseenPrompt Public-Beta Ready.**

---

## Cross-Cutting Development Principles

- **One canonical project state.** Every mode and coding tool reads the same confirmed truth.
- **One next action.** Future prompts remain hidden until the current result is resolved.
- **Typed AI boundaries.** Model output is untrusted until schema and policy validation pass.
- **User-controlled truth.** Models suggest; users confirm; deterministic code writes state.
- **Evidence honesty.** Claimed, supplied, confirmed, and verified are separate labels.
- **Idempotent execution.** Retries never duplicate state, artifacts, usage, workflows, or billing events.
- **Private by default.** Every project and file is personal and owner-scoped.
- **Runtime parity.** Cloudflare preview validation is mandatory before deployment.
- **Provider portability.** Anthropic, OpenAI, and Gemini remain replaceable behind one contract.
- **Tool portability.** Claude Code, Codex, and Cursor never own project truth.
- **No silent scope growth.** Repository integration, autonomous execution, teams, and native apps remain outside the MVP.
- **Release by evidence.** A lifecycle mode is public only after its evaluation and end-to-end gates pass.

---

## Development Plan Exclusions

This document does not schedule:

- Marketing campaigns.
- Social media content.
- Publicity and public relations.
- Sales outreach.
- Partnerships.
- Pricing experiments.
- Revenue projections.
- Community management.
- Day-to-day post-launch business operations.

These belong in the Master Plan or a future business execution document. Deployment, monitoring, security, testing, and incident recovery remain included because they are part of building and shipping reliable software.

---

## Companion Document

- **`UnseenPrompt – PRODUCT_PLAN.md`** — product and business Master Plan.

---

*UnseenPrompt Development Plan v1.0.0 — July 2026*  
*18 phases: 0–17 · Development only · No code snippets*
