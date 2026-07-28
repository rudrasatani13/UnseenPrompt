import type * as React from "react";

import { cn } from "@/components/ui/utils";

/**
 * A skeleton only reserves the dimensions of the content it stands in for. It
 * pulses opacity and never translates, scales, or rotates, so reduced-motion
 * users see a static placeholder rather than a moving one.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
