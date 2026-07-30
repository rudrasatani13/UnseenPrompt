import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  FileCheck2,
  FileInput,
  ListChecks,
  SquareTerminal,
} from "lucide-react";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { HandoffPreview } from "@/features/waitlist/handoff-preview";
import { WaitlistForm } from "@/features/waitlist/waitlist-form";

export interface ComingSoonLandingProps {
  readonly turnstileSiteKey: string;
}

const HANDOFF_STATES = [
  {
    number: "01",
    title: "What happened",
    description: "The bug, the attempts, the errors, and the questions that are still open.",
    icon: FileInput,
  },
  {
    number: "02",
    title: "What stays decided",
    description: "The stack, constraints, and tradeoffs that should not be reopened.",
    icon: ListChecks,
  },
  {
    number: "03",
    title: "What counts as proof",
    description: "The logs, files, tests, and screenshots—and what remains only a claim.",
    icon: FileCheck2,
  },
  {
    number: "04",
    title: "What happens next",
    description: "One focused prompt, the expected result, and what not to change.",
    icon: SquareTerminal,
  },
] as const;

const CONTINUITY_RAIL = [
  {
    title: "Bring what exists",
    description: "A note, error, screenshot, or half-built repo.",
    icon: FileInput,
  },
  {
    title: "Keep what matters",
    description: "Decisions, constraints, attempts, and evidence.",
    icon: ListChecks,
  },
  {
    title: "Continue where you work",
    description: "Carry the handoff into Claude Code, Codex, Cursor, or wherever you work next.",
    icon: SquareTerminal,
  },
] as const;

/**
 * Production coming-soon surface.
 */
export function ComingSoonLanding({ turnstileSiteKey }: ComingSoonLandingProps) {
  return (
    <div data-slot="coming-soon-landing" className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-subtle">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-10">
          <BrandLockup variant="full" priority />
          <p className="rounded-pill border border-subtle px-3 py-1.5 font-mono text-[11px] font-medium tracking-[0.1em] text-neutral-700 uppercase">
            Building now
          </p>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,1.08fr)] lg:items-center lg:gap-14 lg:px-10 lg:py-16">
          <div>
            <p className="mb-5 flex items-center gap-3 font-mono text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">
              <span className="h-px w-8 bg-control" aria-hidden="true" />
              For the work between coding sessions
            </p>
            <h1 className="font-display max-w-3xl text-6xl leading-[0.9] font-semibold tracking-[-0.055em] text-balance sm:text-[80px]">
              Bring the half-finished thing.
            </h1>
            <p className="mt-6 max-w-2xl text-[19px] leading-relaxed text-neutral-700">
              A bug. A half-built feature. A project you haven’t touched in two weeks. UnseenPrompt
              is being built to keep the decisions, evidence, and next step together—and prepare one
              focused prompt for Claude Code, Codex, or Cursor.
            </p>

            <div id="join" className="mt-8 max-w-2xl scroll-mt-6 border-t border-subtle pt-6">
              <WaitlistForm turnstileSiteKey={turnstileSiteKey} />
              <p className="mt-1 font-mono text-[13px] text-neutral-700">
                No countdown. We’ll share a date when one is real.
              </p>
            </div>

            <a
              href="#handoff"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline decoration-subtle underline-offset-4 hover:decoration-ink"
            >
              See the full example
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>
          </div>

          <HandoffPreview />
        </section>

        <section aria-label="How project continuity works" className="border-y border-subtle">
          <div className="mx-auto grid max-w-7xl sm:grid-cols-3 sm:divide-x sm:divide-subtle">
            {CONTINUITY_RAIL.map(({ title, description, icon: Icon }, index) => (
              <article
                className={`flex min-h-24 items-center gap-4 px-4 py-5 sm:px-6 lg:px-10 ${
                  index < CONTINUITY_RAIL.length - 1 ? "border-b border-subtle sm:border-b-0" : ""
                }`}
                key={title}
              >
                <Icon className="size-5 shrink-0" strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-700">{description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-ink text-surface">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-10 lg:py-24">
            <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16">
              <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-neutral-400 uppercase">
                What the next session gets
              </p>
              <div>
                <h2 className="font-display max-w-3xl text-4xl leading-[0.96] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
                  The next tool gets the state, not the whole story.
                </h2>
                <p className="mt-6 max-w-2xl text-base leading-relaxed text-neutral-200">
                  Chat history is noisy. Project notes go stale. UnseenPrompt is being built to keep
                  only what the next session needs: what happened, what was decided, what was
                  actually proven, and what to do next.
                </p>
              </div>
            </div>

            <div className="mt-12 grid border-y border-neutral-700 md:grid-cols-2 lg:grid-cols-4">
              {HANDOFF_STATES.map(({ number, title, description, icon: Icon }, index) => (
                <article
                  key={number}
                  className={`py-7 md:px-6 md:py-8 lg:px-7 ${
                    index < HANDOFF_STATES.length - 1
                      ? "border-b border-neutral-700 md:border-b-0 md:border-r"
                      : ""
                  } ${index === 1 ? "md:border-r-0 lg:border-r" : ""} ${
                    index === 2 ? "md:border-t md:border-neutral-700 lg:border-t-0" : ""
                  }`}
                >
                  <div className="mb-10 flex items-center justify-between">
                    <span className="font-mono text-xs text-neutral-400">{number}</span>
                    <Icon
                      className="size-5 text-neutral-300"
                      strokeWidth={1.7}
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-200">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-subtle">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.5fr_1.5fr] lg:gap-10 lg:px-10">
            <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">
              Why not just use CLAUDE.md?
            </p>
            <div>
              <h2 className="font-display text-4xl font-semibold tracking-[-0.04em]">
                Keep using it.
              </h2>
              <div className="mt-6 grid max-w-3xl gap-4 text-base leading-relaxed text-neutral-700">
                <p>
                  CLAUDE.md is useful for stable repository instructions—commands, conventions,
                  architecture, and rules the tool should always follow.
                </p>
                <p>
                  UnseenPrompt is for the moving state: what failed today, what you decided, which
                  evidence is confirmed, and what the next session should do.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-subtle">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-10">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">
                First usable build
              </p>
              <h2 className="font-display mt-4 max-w-3xl text-4xl leading-tight font-semibold tracking-[-0.04em] sm:text-5xl">
                One email when there’s something usable.
              </h2>
              <p className="mt-4 text-sm text-ink-muted">
                No launch countdown. No weekly newsletter. Just the first build worth opening.
              </p>
              <a
                href="#join"
                className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-ink px-6 py-3 text-sm font-semibold text-surface transition-colors duration-(--duration-micro-min) hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Tell me when I can try it
                <ArrowUp className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm text-neutral-700 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10">
          <div className="space-y-1">
            <p className="font-medium text-ink">Built independently by Rudra Satani</p>
            <p>No tracking pixels. Email confirmation required. Unsubscribe anytime.</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            <Link href="/privacy" className="underline-offset-4 hover:text-ink hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="underline-offset-4 hover:text-ink hover:underline">
              Terms
            </Link>
            <a
              href="mailto:hello@unseenprompt.com"
              className="underline-offset-4 hover:text-ink hover:underline"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
