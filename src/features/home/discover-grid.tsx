"use client";

import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/components/ui/utils";
import {
  DISCOVER_CATEGORIES,
  type DiscoverCategoryFilter,
  type DiscoverTemplate,
  filterDiscoverTemplates,
} from "@/features/home/discover-fixtures";

export interface DiscoverGridProps {
  readonly onUseTemplate: (template: DiscoverTemplate) => void;
}

/**
 * The reference "Discover" section: search plus category tabs over a grid of
 * ready-to-use starting points. Selecting a card prefills the composer; the
 * person still submits the request themselves.
 */
export function DiscoverGrid({ onUseTemplate }: DiscoverGridProps) {
  const [category, setCategory] = useState<DiscoverCategoryFilter>("Recommended");
  const [query, setQuery] = useState("");

  const templates = useMemo(() => filterDiscoverTemplates(category, query), [category, query]);

  return (
    <section data-slot="discover-grid" aria-labelledby="discover-heading" className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.3em] text-ink-muted uppercase">
            <span aria-hidden="true" className="text-ink">
              ★
            </span>
            Starting points
          </p>
          <h2 id="discover-heading" className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            Discover
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            Ready-to-use starting points across every role. Pick one and make it yours.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          />
          <label className="sr-only" htmlFor="discover-search">
            Search starting points
          </label>
          <input
            id="discover-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            autoComplete="off"
            className="min-h-11 w-full rounded-md border border-control bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          />
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Starting point categories"
        className="mt-5 flex gap-1 overflow-x-auto border-b border-subtle"
      >
        {DISCOVER_CATEGORIES.map((entry) => {
          const active = entry === category;
          return (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(entry)}
              className={cn(
                "-mb-px shrink-0 rounded-t-md border-b-2 px-3 py-2.5 font-mono text-xs tracking-widest whitespace-nowrap uppercase outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                active
                  ? "border-brand text-ink"
                  : "border-transparent text-ink-muted hover:border-subtle hover:text-ink",
              )}
            >
              {entry}
            </button>
          );
        })}
      </div>

      {templates.length === 0 ? (
        <p className="mt-8 text-sm leading-6 text-ink-muted" role="status">
          Nothing matches that search yet. Try another word, or clear it to see everything.
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {templates.map((template, index) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => onUseTemplate(template)}
                className="group flex h-full w-full flex-col gap-2 rounded-lg border border-subtle bg-surface p-4 text-left outline-none transition-colors hover:border-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{template.title}</span>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                  />
                </span>
                <span className="text-sm leading-6 text-ink-muted">{template.description}</span>
                <span className="mt-auto pt-1 font-mono text-[9px] tracking-[0.25em] text-ink-muted uppercase">
                  {String(index + 1).padStart(2, "0")} · {template.category}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
