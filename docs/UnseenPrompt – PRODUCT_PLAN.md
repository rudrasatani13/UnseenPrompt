# UnseenPrompt — Master Plan (Product & Business)

---

**Version:** 1.0.0  
**Last Updated:** July 2026  
**Status:** Approved Concept — Pre-Development  
**Brand:** UnseenPrompt  
**Product:** UnseenPrompt project-planning application
**Domain:** `unseenprompt.com` (purchased)  
**Companion Doc:** `UnseenPrompt – DEVELOPMENT_PLAN.md`

---

## About This Document

This is the product and business master plan for UnseenPrompt. It defines why the product exists, what it does, who it serves, how it is positioned, the approved MVP boundary, the business model, and the long-term direction.

It does **not** contain phase-by-phase implementation instructions. The build sequence, deliverables, dependencies, testing gates, and launch-readiness criteria live in the companion Development Plan.

---

## Table of Contents

1. Product Overview
2. Strategic Context
3. Core Product Identity
4. Product Principles
5. Target Users and Use Cases
6. Product Experience
7. MVP Scope
8. Technology Summary
9. AI and Prompt Strategy
10. Trust, Privacy, and Safety
11. Monetization and Pricing Model
12. Distribution Strategy
13. Product Roadmap
14. Risks and Mitigation
15. Success Criteria
16. Core Principles

---

## Product Overview

UnseenPrompt is a planned web application for people building websites and web applications with Claude Code, OpenAI Codex, and Cursor.

Most AI coding sessions fail before the code fails. Users begin with an underspecified idea, receive a large generic prompt, lose earlier decisions across sessions, accept contradictory recommendations, and struggle to decide what to ask next. Existing prompt improvers can rewrite a request, but they usually do not maintain a durable understanding of the complete software project.

UnseenPrompt converts a vague idea or development problem into a guided, persistent build journey:

1. The user describes what they want in any language.
2. UnseenPrompt detects whether the intent is a new build, feature, bug, review, test, deployment, or improvement.
3. It asks one adaptive question at a time.
4. It stops when enough context exists.
5. It confirms requirements, constraints, success criteria, and the recommended stack.
6. It generates one copy-ready prompt for the selected coding agent.
7. The user runs that prompt and returns with the response, files, logs, errors, or screenshots.
8. UnseenPrompt analyzes the evidence, suggests progress, waits for confirmation, and produces the next best prompt.

The product does not overwhelm users with a pack of future prompts. A complete structured project plan exists behind the experience, but the interface reveals only the action needed now.

---

## Strategic Context

### The Problem

AI coding tools are powerful, but they assume the user can:

- Explain the product clearly.
- Choose a suitable stack.
- Preserve architectural decisions.
- Break work into safe implementation steps.
- Recognize missing requirements.
- Distinguish a claimed result from a verified result.
- Recover from errors without losing the original plan.
- Write different prompt styles for different coding agents.

Beginners often cannot do these things. Vibe coders can do some of them but lose continuity. Experienced developers still spend time reconstructing context and converting decisions into precise agent instructions.

### The Gap

| Product category | What it provides | What remains missing |
|---|---|---|
| Prompt improvers | Better wording and prompt structure | Durable software-project state and lifecycle continuity |
| General chat assistants | Flexible conversation and advice | Controlled progress, confirmed decisions, evidence states, and tool-specific handoff |
| AI coding agents | Repository work and code generation | Product discovery, cross-session roadmap, and independent project memory |
| Project-management tools | Tasks and status tracking | Adaptive technical reasoning and executable coding-agent prompts |

UnseenPrompt sits between product discovery, lightweight project management, and AI coding execution. It does not replace Claude Code, Codex, or Cursor. It makes the user consistently effective with them.

### Positioning

**Category:** AI software-development guidance  
**Position:** The project memory and next-prompt layer for AI coding  
**Primary promise:** Never lose the plan. Never wonder what to ask next.  
**Primary optimization target:** Prompt quality and project continuity  

---

## Core Product Identity

| Attribute | Value |
|---|---|
| Brand | UnseenPrompt |
| Product | Project-planning application |
| Primary domain | `unseenprompt.com` |
| Platform | Responsive web application |
| Supported projects | Websites and web applications |
| Supported coding agents | Claude Code, OpenAI Codex, Cursor |
| Input language | Any language, including Hindi and Hinglish |
| Application language | English |
| Coding-agent prompt language | Precise technical English |
| Account model | Personal accounts only in the MVP |
| Business model | Free tier plus Pro subscription |
| Billing provider | Paddle Billing |
| Hosting | Cloudflare Workers |
| Data platform | Supabase Auth, PostgreSQL, and private Storage |
| AI providers | Anthropic, OpenAI, and Google Gemini |
| Visual identity | Warm Editorial interface with Powder Pink tokens |

### What UnseenPrompt Is Not

- Not an autonomous coding environment.
- Not a repository host.
- Not a replacement for Claude Code, Codex, or Cursor.
- Not a generic prompt marketplace.
- Not a tool that dumps many prompts at once.
- Not a system that marks work verified only because an AI agent says it is complete.
- Not a team project-management platform in the MVP.

---

## Product Principles

1. **One next action.** Show one useful question or one executable prompt at a time.
2. **State before conversation.** Confirmed structured project state is more important than raw chat history.
3. **User confirmation controls truth.** Models propose; users confirm.
4. **Claims are not verification.** Agent prose, attached evidence, user confirmation, and verified output are separate states.
5. **Adaptive, not exhaustive.** Ask only questions that materially improve the next action.
6. **Approachable for beginners, precise for developers.** Depth changes with the user's skill and project context.
7. **Tool-aware, not tool-dependent.** The project state remains portable across Claude Code, Codex, and Cursor.
8. **Multilingual input, technical-English execution.** Users express ideas naturally; coding agents receive precise instructions.
9. **Privacy by default.** Personal projects and files remain private and owner-scoped.
10. **Safe development prompts.** High-risk operations require target verification, rollback awareness, and explicit authorization.
11. **No silent contradictions.** Confirmed architectural decisions cannot be changed without reconfirmation.
12. **Original brand and product.** Interaction lessons may be used, but third-party branding, text, and proprietary assets are not copied.

---

## Target Users and Use Cases

### Primary Segments

| Segment | Core Need | Product Adaptation |
|---|---|---|
| Non-technical founders and creators | Turn an idea into a buildable product without knowing what to ask | Plain-language discovery, conservative defaults, explanations |
| Vibe coders | Maintain direction while iterating quickly with AI tools | Faster discovery, stack recommendations, focused follow-ups |
| Developers and agencies | Preserve architecture and produce precise implementation prompts | Technical constraints, acceptance criteria, testing and risk details |

### Core Use Cases

- Turn a vague website idea into a confirmed project brief and first coding prompt.
- Add a feature without breaking existing architectural decisions.
- Diagnose and fix a bug from pasted errors, logs, screenshots, or relevant files.
- Review a project for maintainability, accessibility, performance, or security.
- Generate a focused testing prompt for the current milestone.
- Prepare a controlled deployment prompt with verification and rollback expectations.
- Improve an existing website through prioritized, evidence-based follow-up work.
- Continue a project weeks later without reconstructing earlier decisions.

---

## Product Experience

### Primary Journey

`Describe → Discover → Confirm → Select Tool → Run Prompt → Return Result → Confirm Progress → Continue`

### Lifecycle Modes

- New Build
- Add Feature
- Fix Bug
- Review
- Test
- Deploy
- Improve

The system detects the likely mode and displays it. The user can change it before proceeding.

### Adaptive Discovery

- One question appears at a time.
- The interface explains why the answer matters.
- Suggested answers reduce effort.
- Free text supports unusual requirements.
- The next question depends on all confirmed answers.
- Discovery normally ends after four to seven questions but has no fixed count.

### First Prompt

After discovery:

- UnseenPrompt summarizes the project.
- It recommends a technology stack with rationale.
- The user confirms or changes the stack.
- The user selects Claude Code, Codex, or Cursor.
- The system generates one prompt, expected result, and acceptance criteria.

### Returned Result

The user can paste:

- Coding-agent output.
- Errors and logs.
- Screenshots.
- Relevant source files.
- Test or build output.

UnseenPrompt distinguishes:

- **Claimed:** reported by the coding agent.
- **Evidence supplied:** supported by returned material.
- **User confirmed:** accepted by the user.
- **Verified:** supported by suitable test, build, or runtime evidence.

### Primary Product Surfaces

1. Home Composer
2. Adaptive Discovery
3. Project Workspace
4. Result Intake
5. Personal Project Library
6. Profile and Basic Memory
7. Usage and Billing

### Visual Direction

The interface uses a Warm Editorial layout with Powder Pink semantic tokens:

- Near-white and powder-pink surfaces.
- Muted rose primary actions.
- Warm dark-neutral text.
- Generous spacing and restrained shadows.
- Progressive disclosure of technical information.
- Accessible contrast and keyboard behavior.
- Reduced-motion support.

---

## MVP Scope

### Must-Have Capabilities

| Layer | MVP capability |
|---|---|
| Authentication | Google OAuth and email magic link |
| Projects | Private personal projects, lifecycle state, archive and delete |
| Intent | Automatic mode detection with manual correction |
| Discovery | Adaptive one-question-at-a-time flow |
| Project state | Confirmed requirements, decisions, milestones, events, summaries |
| Stack guidance | Recommended stack with rationale and user override |
| Coding tools | Claude Code, Codex, and Cursor adapters |
| Prompt delivery | One versioned prompt, expected result, and acceptance criteria |
| Return flow | Pasted response, bounded code/text/PDF/image upload |
| Progress | Suggested status with required user confirmation |
| Memory | Skill level, preferred stack, coding style, deployment preference |
| AI | Managed Anthropic, OpenAI, and Gemini access |
| Billing | Free and Pro entitlements through Paddle |
| Quality | Prompt evaluation suite and release gates |
| Safety | Ownership, file validation, secret redaction, risk flags, idempotency |

### Explicitly Excluded From MVP

- Direct GitHub integration.
- Direct local-machine or IDE control.
- Autonomous coding or deployment.
- Team workspaces.
- Mobile/native application projects.
- Prompt marketplace or public prompt sharing.
- Executable and archive uploads.
- Native mobile apps.
- Custom enterprise billing or organization management.

---

## Technology Summary

| Layer | Approved choice |
|---|---|
| Web application | Next.js App Router with TypeScript |
| Hosting | Cloudflare Workers through OpenNext |
| Durable background work | Cloudflare Workflows |
| Authentication | Supabase Auth |
| Database | Supabase PostgreSQL |
| File storage | Supabase private Storage |
| Styling | Token-based Warm Editorial system with Powder Pink palette |
| AI gateway | Typed provider abstraction |
| AI providers | Anthropic, OpenAI, Gemini Developer API |
| Validation | Typed structured outputs and deterministic policy checks |
| Billing | Paddle Billing and customer portal |
| Abuse controls | Cloudflare rate limits and Turnstile |
| Error monitoring | Sentry |
| Product analytics | Privacy-conscious PostHog events |
| Cloud/runtime monitoring | Cloudflare observability |

The application remains one deployable web product. Independent services are separated by interfaces, not premature microservices.

---

## AI and Prompt Strategy

### Source of Truth

The LLM is not the database and is not the project authority. Durable project truth consists of:

- Confirmed requirements.
- Confirmed architectural decisions.
- User-confirmed milestone status.
- Versioned prompts and returned evidence.
- Append-only project events.

### Model Responsibilities

Models may:

- Detect intent.
- Identify missing context.
- Propose one clarification question.
- Recommend a stack.
- Propose a project-state change.
- Compose a tool prompt.
- Analyze returned evidence.
- Suggest the next action.

Models may not:

- Apply project-state changes directly.
- Grant paid access.
- Override authorization.
- Mark work verified without suitable evidence.
- Expose secrets or private artifacts.

### Tool Adapters

Claude Code, Codex, and Cursor share the same project action specification. Deterministic adapters alter tool-specific wording and handoff expectations without changing confirmed requirements.

### Provider Strategy

- Strong configured model for planning and prompt composition.
- Provider-neutral structured contract.
- Optional reviewer pass for complex or high-risk actions.
- Validated fallback between Anthropic, OpenAI, and Gemini.
- Token, latency, cost, validation, and retry metadata recorded.
- No hidden chain-of-thought requested or stored.

---

## Trust, Privacy, and Safety

- All project records are owner-scoped.
- PostgreSQL Row-Level Security enforces personal isolation.
- Service credentials and AI keys remain server-side.
- Files use private storage and short-lived signed access.
- Uploaded content is treated as untrusted data.
- Likely secrets are redacted before AI-provider transmission.
- Prompt/file content is excluded from ordinary analytics and error logs.
- Unsupported, executable, oversized, and archive files are rejected.
- Billing webhooks are signature-verified, deduplicated, and ordered.
- High-risk Git, database, authentication, billing, deployment, and infrastructure prompts include verification and rollback expectations.
- Project and account deletion revoke access immediately and schedule permanent purge.

---

## Monetization and Pricing Model

### Business Model

Freemium SaaS:

- **Free:** enough managed generations and file processing to experience the complete core loop.
- **Pro:** higher monthly generation, storage, file-processing, and premium-model entitlements.

Pro is quota-based rather than marketed as technically unlimited.

### Billing Principles

1. Paddle is the Merchant of Record.
2. Entitlements are enforced server-side.
3. Client checkout success never grants access by itself.
4. Subscription state is synchronized through signed webhooks.
5. Users can manage billing through Paddle's customer portal.
6. Plan limits are catalog configuration rather than hardcoded application behavior.
7. Clear cancellation and usage visibility are mandatory.

### External Launch Dependency

Paddle seller approval must be completed before paid checkout is enabled.

---

## Distribution Strategy

### Initial Audience

- Builders already using Claude Code, Codex, or Cursor.
- Non-technical founders trying to build their first web product.
- Vibe-coding communities.
- Freelancers and small agencies that need repeatable AI development workflows.

### High-Level Channels

- Demonstration-led product content.
- Build-in-public updates.
- Developer and vibe-coding communities.
- Educational content about converting ideas into effective coding-agent workflows.
- Product launch communities after the complete lifecycle passes release gates.

Detailed day-to-day marketing execution does not belong in the Development Plan.

---

## Product Roadmap

### Version 1 — Stateful Web Project Copilot

- Full website/web-app lifecycle.
- Claude Code, Codex, and Cursor.
- Personal accounts.
- Basic memory.
- Manual return through text and files.
- Free and Pro plans.

### Version 1.x — Quality and Workflow Depth

- Stronger evaluation datasets.
- More specialized project templates.
- Improved evidence extraction.
- Project export.
- Better deployment guidance.
- Optional advanced review passes.

### Version 2 — Connected Development Context

- Read-only GitHub repository integration.
- Pull-request and diff context.
- Repository-aware verification.
- Safer automated project-state reconciliation.

### Version 3 — Integrated Execution

- Explicitly authorized IDE or local-agent bridges.
- Controlled task handoff.
- Strong approval boundaries for external changes.
- Team workspaces only after personal workflows are proven.

---

## Risks and Mitigation

### Product Risks

| Risk | Mitigation |
|---|---|
| Too many questions create abandonment | Adaptive sufficiency checks and one-question flow |
| Generated prompts remain generic | Structured state, tool adapters, evaluations, and acceptance criteria |
| Long projects contradict earlier decisions | Confirmed invariants and explicit decision-change flow |
| Users believe agent claims are verified | Four evidence labels and user confirmation |
| Complete-lifecycle scope becomes shallow | Ordered release gates; do not advertise a mode until it passes |
| Beginners are intimidated | Warm editorial UI and adaptive technical depth |

### Technical Risks

| Risk | Mitigation |
|---|---|
| Model behavior changes | Provider abstraction, schemas, evaluation suite, prompt versioning |
| Cloudflare runtime incompatibility | OpenNext preview validation and dependency constraints |
| File prompt injection | Treat extracted text as untrusted evidence |
| Duplicate calls cause duplicate charges/state | End-to-end idempotency keys |
| Billing webhooks arrive twice or out of order | Event deduplication, timestamp ordering, reconciliation |
| Context grows beyond model limits | Relevance-based Context Compiler and bounded summaries |

### Business Risks

| Risk | Mitigation |
|---|---|
| Paddle seller approval delays billing | Keep entitlements provider-neutral and run free beta if necessary |
| AI cost exceeds subscription value | Quotas, provider routing, deterministic adapters, usage ledger |
| Coding tools improve their own planning | Differentiate through cross-tool project continuity and user-controlled state |
| Users expect autonomous execution | State the manual handoff boundary clearly |

---

## Success Criteria

UnseenPrompt succeeds when:

- A user can begin in Hindi or Hinglish and receive a precise English coding prompt.
- Adaptive discovery reaches a useful first prompt without a fixed questionnaire.
- Project decisions remain consistent across many sessions.
- Only one next action is presented at a time.
- The returned-result flow clearly separates claims, evidence, confirmation, and verification.
- Claude Code, Codex, and Cursor prompts preserve the same project invariants.
- Personal data isolation passes authorization and RLS tests.
- Duplicate model, workflow, upload, and billing events do not duplicate state or usage.
- Every advertised lifecycle mode passes prompt-quality and end-to-end release gates.
- Free users can experience the core loop and Pro usage remains economically sustainable.

---

## Core Principles

1. Never lose confirmed project context.
2. Never overwhelm the user with future prompts.
3. Never allow model output to bypass deterministic validation.
4. Never call a claim verified without suitable evidence.
5. Never expose service credentials, model keys, or private artifacts.
6. Never silently replace an approved architecture decision.
7. Never couple project truth to one AI provider or coding tool.
8. Never publicly advertise a lifecycle mode before its quality gates pass.
9. Keep the interface approachable while keeping generated prompts technically rigorous.
10. Build an original UnseenPrompt brand, not a visual or textual copy of another product.

---

## Companion Document

- **`UnseenPrompt – DEVELOPMENT_PLAN.md`** — the development-only build roadmap with 18 phases, dependencies, deliverables, and exit criteria.

---

*UnseenPrompt Master Plan v1.0.0 — July 2026*  
*Primary domain: unseenprompt.com*
