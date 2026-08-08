"use client";

import { useCallback, useState } from "react";

import { HomeComposer } from "@/features/discovery/home-composer";
import { type DiscoverTemplate } from "@/features/home/discover-fixtures";
import { DiscoverGrid } from "@/features/home/discover-grid";

/**
 * Reference-layout home surface: stencil mark, headline, composer, mode toggle,
 * and the Discover grid. The composer owns the draft/intent/promotion steps;
 * once it leaves the home form, the hero and Discover sections step aside so
 * the confirmation flow gets the full surface.
 */
export function HomeWorkspace() {
  const [inHomeView, setInHomeView] = useState(true);
  const [prefill, setPrefill] = useState<{
    readonly token: number;
    readonly value: string;
  } | null>(null);

  const handleHomeStateChange = useCallback((value: boolean) => {
    setInHomeView(value);
  }, []);

  function useTemplate(template: DiscoverTemplate): void {
    setPrefill({ token: Date.now(), value: template.requestText });
    requestAnimationFrame(() => {
      const input = document.getElementById("home-composer-input");
      if (input === null) return;
      if (typeof input.scrollIntoView === "function") {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      input.focus({ preventScroll: true });
    });
  }

  return (
    <div data-slot="home-workspace" className="flex w-full flex-col items-center gap-12">
      {inHomeView ? (
        <header className="flex flex-col items-center gap-5 pt-4 text-center md:pt-12">
          <p className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.3em] text-ink-muted uppercase">
            <span aria-hidden="true" className="text-ink">
              ★
            </span>
            Early access · est. 2026
          </p>
          <h1 className="max-w-4xl text-5xl leading-[1.02] font-semibold tracking-tight text-balance text-ink md:text-6xl">
            Turn lazy prompts into great ones
          </h1>
          <p className="max-w-xl text-base leading-7 text-ink-muted">
            Bring a rough idea and leave with a prompt that works. We ask only what is still
            missing.
          </p>
        </header>
      ) : null}

      <HomeComposer prefill={prefill} onHomeStateChange={handleHomeStateChange} />

      {inHomeView ? (
        <>
          <div
            role="group"
            aria-label="Composer mode"
            className="-mt-4 inline-flex rounded-full border border-subtle bg-surface-muted p-1 text-sm font-medium"
          >
            <button
              type="button"
              aria-pressed="true"
              className="rounded-full border border-subtle bg-surface px-5 py-2 font-mono text-xs tracking-widest text-ink uppercase"
            >
              Prompt
            </button>
            <button
              type="button"
              disabled
              title="Template mode comes later."
              className="cursor-default rounded-full px-5 py-2 font-mono text-xs tracking-widest text-ink-muted uppercase"
            >
              Template
            </button>
          </div>

          <div className="flex w-full items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-ink/20" />
            <span className="font-mono text-[10px] tracking-[0.3em] text-ink-muted uppercase">
              The Manifest
            </span>
            <span className="h-px flex-1 bg-ink/20" />
          </div>

          <DiscoverGrid onUseTemplate={useTemplate} />
        </>
      ) : null}
    </div>
  );
}
