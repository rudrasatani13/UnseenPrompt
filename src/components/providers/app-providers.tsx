"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface AppProvidersProps {
  readonly children: ReactNode;
}

/**
 * The single client boundary wrapping application content.
 *
 * `MotionConfig reducedMotion="user"` defers to the operating-system setting, so
 * animated feedback is suppressed without removing the text or icon state that
 * carries the same meaning. Providers read no storage, cookie, or user identity.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={400}>
        {children}
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  );
}
