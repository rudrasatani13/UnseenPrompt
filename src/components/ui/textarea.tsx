import type * as React from "react";

import { cn } from "@/components/ui/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content flex min-h-24 w-full rounded-md border border-control bg-surface px-3 py-2 text-base text-ink",
        "transition-colors duration-(--duration-micro-min)",
        "placeholder:text-ink-muted",
        "selection:bg-brand selection:text-surface",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "read-only:bg-surface-muted read-only:text-ink-muted",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
