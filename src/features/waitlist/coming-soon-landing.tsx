import Link from "next/link";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { WaitlistForm } from "@/features/waitlist/waitlist-form";

export interface ComingSoonLandingProps {
  readonly turnstileSiteKey: string;
}

/**
 * Production coming-soon surface. No shell, no decoration, pure white canvas.
 */
export function ComingSoonLanding({ turnstileSiteKey }: ComingSoonLandingProps) {
  return (
    <div
      data-slot="coming-soon-landing"
      className="flex min-h-dvh flex-col bg-canvas text-ink"
    >
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <BrandLockup variant="full" priority />
        <p className="text-sm text-ink-muted">Work in progress</p>
      </header>

      <main className="flex flex-1 items-center px-4 py-10 sm:px-6">
        <div className="mx-auto grid w-full max-w-xl gap-6">
          <p className="text-sm font-medium tracking-wide text-ink-muted uppercase">
            UnseenPrompt is being built
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Start with the messy version.
          </h1>
          <p className="max-w-prose text-base text-ink-muted">
            Bring the idea, bug, or half-built website. UnseenPrompt asks what matters, keeps track
            of the decisions, and prepares the next prompt for Claude Code, Codex, or Cursor.
          </p>
          <WaitlistForm turnstileSiteKey={turnstileSiteKey} />
        </div>
      </main>

      <footer className="flex flex-wrap gap-4 px-4 py-6 text-sm text-ink-muted sm:px-6">
        <Link href="/privacy" className="underline-offset-4 hover:text-ink hover:underline">
          Privacy
        </Link>
        <Link href="/terms" className="underline-offset-4 hover:text-ink hover:underline">
          Terms
        </Link>
      </footer>
    </div>
  );
}
