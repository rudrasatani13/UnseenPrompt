"use client";

import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * The upstream shadcn `sonner` registry item reads `useTheme` from `next-themes`
 * to support a dark palette. Phase 2 has one light token set and no theme
 * switcher, so that dependency was rejected and the theme is pinned to `light`.
 *
 * Toasts are transient confirmation only. Form errors, risk warnings, and
 * failure states always render inline as well.
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon aria-hidden="true" className="size-4" />,
        info: <InfoIcon aria-hidden="true" className="size-4" />,
        warning: <TriangleAlertIcon aria-hidden="true" className="size-4" />,
        error: <OctagonXIcon aria-hidden="true" className="size-4" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--text-primary)",
          "--normal-border": "var(--border-subtle)",
          "--success-bg": "var(--success-background)",
          "--success-text": "var(--success-foreground)",
          "--warning-bg": "var(--warning-background)",
          "--warning-text": "var(--warning-foreground)",
          "--error-bg": "var(--danger-background)",
          "--error-text": "var(--danger-foreground)",
          "--info-bg": "var(--info-background)",
          "--info-text": "var(--info-foreground)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
