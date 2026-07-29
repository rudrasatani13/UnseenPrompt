import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/components/ui/utils";

/**
 * Status variants use monochrome surfaces and visible borders so a badge never
 * depends on hue alone: consumers always supply text, and usually an icon too.
 */
const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-sm border px-2 py-0.5",
    "text-xs font-medium",
    "transition-colors duration-(--duration-micro-min)",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand text-surface",
        secondary: "border-transparent bg-surface-muted text-ink",
        outline: "border-subtle bg-surface text-ink",
        success: "border-success-border bg-success-surface text-success",
        warning: "border-warning-border bg-warning-surface text-warning",
        danger: "border-2 border-danger-border bg-danger-surface text-danger",
        info: "border-info-border bg-info-surface text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
