"use client";

import { Check, Clipboard, FileCheck2, ListChecks, SquareTerminal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DECISIONS = [
  "Keep the current auth provider unless evidence points elsewhere",
  "Reproduce before changing code",
  "Don’t touch unrelated checkout logic",
] as const;

const EVIDENCE = [
  { label: "Confirmed", value: "Local checkout completes" },
  { label: "Observed", value: "Production request starts" },
  { label: "Not proven", value: "Return callback not confirmed" },
  { label: "Unknown", value: "Root cause still unknown" },
] as const;

const NEXT_PROMPT =
  "Reproduce the stalled payment return path. Compare local and production callback behavior, auth state, and environment variables. Show the smallest proven cause before changing code.";

export function HandoffPreview() {
  const [copyStatus, setCopyStatus] = useState("");

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(NEXT_PROMPT);
      setCopyStatus("Prompt copied.");
    } catch {
      setCopyStatus("Copy failed. Select the prompt and copy it manually.");
    }
  }

  return (
    <aside
      id="handoff"
      data-slot="handoff-preview"
      aria-label="Interactive UnseenPrompt handoff example"
      className="scroll-mt-6 overflow-hidden rounded-lg border border-control bg-surface"
    >
      <div className="flex items-center justify-between gap-4 border-b border-subtle px-4 py-4 sm:px-5">
        <div>
          <p className="font-mono text-[11px] font-medium tracking-[0.1em] text-ink-muted uppercase">
            Interactive example
          </p>
          <h2 className="mt-1 text-sm font-semibold">Checkout bug handoff</h2>
        </div>
        <span className="rounded-pill border border-subtle px-2.5 py-1 font-mono text-[10px] font-medium tracking-wide text-ink-muted uppercase">
          Example
        </span>
      </div>

      <Tabs defaultValue="happened" className="gap-0">
        <TabsList
          aria-label="Handoff stages"
          className="grid w-full grid-cols-2 gap-0 rounded-none border-b border-subtle bg-surface-muted p-0 sm:grid-cols-4"
        >
          <TabsTrigger value="happened" className="rounded-none border-0 px-3 text-xs">
            What happened
          </TabsTrigger>
          <TabsTrigger value="decisions" className="rounded-none border-0 px-3 text-xs">
            Decisions
          </TabsTrigger>
          <TabsTrigger value="evidence" className="rounded-none border-0 px-3 text-xs">
            Evidence
          </TabsTrigger>
          <TabsTrigger value="next" className="rounded-none border-0 px-3 text-xs">
            Next prompt
          </TabsTrigger>
        </TabsList>

        <div className="min-h-[280px] bg-surface-muted p-3 sm:min-h-[260px] sm:p-5">
          <TabsContent value="happened">
            <article className="rounded-md border border-subtle bg-surface p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <p className="font-mono text-[11px] font-medium tracking-[0.1em] text-ink-muted uppercase">
                  Reported state
                </p>
                <FileCheck2 className="size-4" strokeWidth={1.7} aria-hidden="true" />
              </div>
              <p className="text-lg leading-relaxed">
                Checkout works locally. In production, Pay never returns. I haven’t proved whether
                auth or the callback is failing.
              </p>
              <p className="mt-6 border-t border-subtle pt-4 font-mono text-[13px] leading-relaxed text-neutral-700">
                The uncertainty stays visible. A guess does not become a fact.
              </p>
            </article>
          </TabsContent>

          <TabsContent value="decisions">
            <article className="rounded-md border border-subtle bg-surface p-5">
              <div className="mb-6 flex items-center justify-between gap-4">
                <p className="font-mono text-[11px] font-medium tracking-[0.1em] text-ink-muted uppercase">
                  Confirmed constraints
                </p>
                <ListChecks className="size-4" strokeWidth={1.7} aria-hidden="true" />
              </div>
              <ul className="grid gap-3">
                {DECISIONS.map((decision) => (
                  <li className="flex items-start gap-3 text-sm leading-relaxed" key={decision}>
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-ink-muted"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    {decision}
                  </li>
                ))}
              </ul>
            </article>
          </TabsContent>

          <TabsContent value="evidence">
            <article className="rounded-md border border-subtle bg-surface p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <p className="font-mono text-[11px] font-medium tracking-[0.1em] text-ink-muted uppercase">
                  Evidence ledger
                </p>
                <FileCheck2 className="size-4" strokeWidth={1.7} aria-hidden="true" />
              </div>
              <dl className="divide-y divide-subtle border-y border-subtle">
                {EVIDENCE.map(({ label, value }) => (
                  <div className="grid gap-1 py-3 sm:grid-cols-[112px_1fr]" key={value}>
                    <dt className="font-mono text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                      {label}
                    </dt>
                    <dd className="text-sm">{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </TabsContent>

          <TabsContent value="next">
            <article className="rounded-md border border-ink bg-ink p-5 text-surface">
              <div className="mb-6 flex items-center justify-between gap-4">
                <p className="font-mono text-[11px] font-medium tracking-[0.1em] text-neutral-300 uppercase">
                  Prepared next action
                </p>
                <SquareTerminal
                  className="size-4 text-neutral-300"
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
              </div>
              <p className="text-base leading-relaxed">{NEXT_PROMPT}</p>
              <div className="mt-7 flex items-center justify-between gap-3 border-t border-neutral-700 pt-4">
                <p className="font-mono text-xs text-neutral-300">For your coding tool</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={copyPrompt}
                  aria-label="Copy prompt"
                >
                  <Clipboard className="size-4" aria-hidden="true" />
                  Copy
                </Button>
              </div>
            </article>
          </TabsContent>
        </div>
      </Tabs>
      <p className="sr-only" role="status" aria-live="polite">
        {copyStatus}
      </p>
    </aside>
  );
}
