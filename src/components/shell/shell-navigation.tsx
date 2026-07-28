import Link from "next/link";

import type { ShellNavigationItem } from "@/components/shell/navigation";
import { cn } from "@/components/ui/utils";

export interface ShellNavigationProps {
  readonly navigation: readonly ShellNavigationItem[];
  readonly id?: string;
  readonly onNavigate?: () => void;
}

/**
 * Renders the product navigation as either live links or non-interactive
 * "Soon" rows. Discriminated availability makes fake anchors impossible.
 */
export function ShellNavigation({
  navigation,
  id = "shell-navigation",
  onNavigate,
}: ShellNavigationProps) {
  return (
    <nav id={id} aria-label="Product" data-slot="shell-navigation" className="grid gap-1">
      <ul className="grid gap-1">
        {navigation.map((item) => {
          const Icon = item.icon;

          if (item.availability === "available") {
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  {...(item.active ? { "aria-current": "page" as const } : {})}
                  {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium break-words lg:min-h-10",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    item.active
                      ? "bg-surface-muted text-ink"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  <Icon aria-hidden="true" focusable="false" className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">{item.label}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.id}>
              <div
                data-availability="soon"
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm lg:min-h-10"
              >
                <Icon
                  aria-hidden="true"
                  focusable="false"
                  className="size-4 shrink-0 text-ink-muted"
                />
                <span className="min-w-0 flex-1 break-words text-ink-muted">{item.label}</span>
                <span className="shrink-0 rounded-pill border border-subtle px-2 py-0.5 text-xs font-medium text-ink-muted">
                  Soon
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
