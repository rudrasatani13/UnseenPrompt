import type * as React from "react";

import { cn } from "@/components/ui/utils";

/**
 * Invalid, disabled, and read-only appearance is driven entirely by native
 * attributes and `aria-invalid` so assistive technology and pixels agree.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-11 w-full min-w-0 rounded-md border border-control bg-surface px-3 py-2 text-base text-ink lg:min-h-10",
        "transition-colors duration-(--duration-micro-min)",
        "placeholder:text-ink-muted",
        "selection:bg-brand selection:text-surface",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "read-only:bg-surface-muted read-only:text-ink-muted",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
        "aria-invalid:border-danger",
        "file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
