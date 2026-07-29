import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/components/ui/utils";

/**
 * Every status variant pairs a monochrome surface, a visible border, black
 * text, and an icon slot. Titles and descriptions wrap: there is no truncation,
 * because a partially visible warning is not a warning.
 */
const alertVariants = cva(
  [
    "relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-md border px-4 py-3 text-sm",
    "has-[>svg]:grid-cols-[calc(var(--spacing)*5)_1fr] has-[>svg]:gap-x-3",
    "[&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-subtle bg-surface text-ink",
        info: "border border-info-border bg-info-surface text-info",
        success: "border border-success-border bg-success-surface text-success",
        warning: "border border-warning-border bg-warning-surface text-warning",
        destructive: "border-2 border-danger-border bg-danger-surface text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-current [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
