import Link from "next/link";
import { ArrowDown, FileText, MessageSquareText, SquareTerminal } from "lucide-react";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { WaitlistForm } from "@/features/waitlist/waitlist-form";

export interface ComingSoonLandingProps {
  readonly turnstileSiteKey: string;
}

/**
 * Production coming-soon surface.
 */
export function ComingSoonLanding({ turnstileSiteKey }: ComingSoonLandingProps) {
  const steps = [
    {
      number: "01",
      title: "Bring the rough version",
      description: "An idea, a bug, or the half-built thing you already have.",
      icon: FileText,
    },
    {
      number: "02",
      title: "Keep the decisions",
      description: "Answer the questions that change what should be built next.",
      icon: MessageSquareText,
    },
    {
      number: "03",
      title: "Continue in your coding tool",
      description: "Take a focused next prompt into Claude Code, Codex, or Cursor.",
      icon: SquareTerminal,
    },
  ] as const;

  return (
    <div data-slot="coming-soon-landing" className="min-h-dvh bg-canvas text-ink">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-10">
        <BrandLockup variant="full" priority />
        <p className="rounded-pill border border-subtle px-3 py-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
          Work in progress
        </p>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] lg:items-center lg:gap-16 lg:px-10 lg:pt-24">
          <div>
            <p className="mb-6 flex items-center gap-3 text-xs font-semibold tracking-[0.18em] text-ink-muted uppercase">
              <span className="h-px w-8 bg-control" aria-hidden="true" />
              UnseenPrompt is being built
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.055em] text-balance sm:text-7xl sm:leading-[0.98]">
              Start with the messy version.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ink-muted">
              Bring the idea, bug, or half-built website. UnseenPrompt asks what matters, keeps
              track of the decisions, and prepares the next prompt for Claude Code, Codex, or
              Cursor.
            </p>
            <div id="join" className="mt-10 max-w-2xl scroll-mt-6 border-t border-subtle pt-7">
              <WaitlistForm turnstileSiteKey={turnstileSiteKey} />
            </div>
          </div>

          <aside
            aria-label="UnseenPrompt workflow preview"
            className="overflow-hidden rounded-lg border border-control bg-surface"
          >
            <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
              <p className="text-xs font-semibold tracking-[0.16em] uppercase">A clearer handoff</p>
              <span className="size-2 rounded-pill bg-ink" aria-hidden="true" />
            </div>
            <div className="space-y-3 bg-surface-muted p-3 sm:p-5">
              {steps.map(({ number, title, description, icon: Icon }) => (
                <article key={number} className="rounded-md border border-subtle bg-surface p-5">
                  <div className="mb-8 flex items-start justify-between">
                    <span className="text-xs font-semibold text-ink-muted">{number}</span>
                    <Icon className="size-5" strokeWidth={1.7} aria-hidden="true" />
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="border-y border-subtle bg-ink text-surface">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:items-end lg:px-10">
            <p className="text-xs font-semibold tracking-[0.18em] text-neutral-400 uppercase">
              The part before the next prompt
            </p>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
                From rough input to a useful next prompt.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-300">
                No empty chat. No pretending the brief is complete. Start with what exists and work
                out what matters next.
              </p>
              <a
                href="#join"
                className="mt-8 inline-flex min-h-11 items-center gap-2 border-b border-neutral-500 text-sm font-semibold transition-colors hover:border-white"
              >
                Join the waitlist
                <ArrowDown className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-4 py-8 text-sm text-ink-muted sm:px-6 lg:px-10">
        <p>Bring what you have. Work out what comes next.</p>
        <div className="flex gap-5">
          <Link href="/privacy" className="underline-offset-4 hover:text-ink hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="underline-offset-4 hover:text-ink hover:underline">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
