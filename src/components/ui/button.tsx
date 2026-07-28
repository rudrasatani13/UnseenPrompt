import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/components/ui/utils";

/**
 * Locally owned shadcn/Radix button. Generated styling was replaced with the
 * approved Warm Editorial tokens, the two-pixel focus indicator, and the
 * minimum target sizes (44px on touch viewports, 40px from 1024px up).
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium",
    "transition-colors duration-(--duration-micro-min)",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-danger",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-brand text-surface hover:bg-brand-hover active:bg-brand-active",
        secondary: "bg-surface-muted text-ink hover:bg-subtle active:bg-subtle",
        outline: "border border-control bg-surface text-ink hover:bg-surface-muted",
        ghost: "text-ink hover:bg-surface-muted",
        destructive: "bg-danger text-surface hover:bg-danger/90 active:bg-danger/80",
      },
      size: {
        default: "min-h-11 px-4 py-2 lg:min-h-10 has-[>svg]:px-3",
        sm: "min-h-11 gap-1.5 px-3 lg:min-h-10 has-[>svg]:px-2.5",
        lg: "min-h-12 px-6 text-base lg:min-h-11",
        icon: "size-11 lg:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
