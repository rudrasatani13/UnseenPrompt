import { CircleDashedIcon, CircleDotIcon, CircleSlashIcon, CircleCheckIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/components/ui/utils";

export type LifecycleStepState = "complete" | "current" | "pending" | "blocked";

export interface LifecycleStep {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
  readonly state: LifecycleStepState;
}

export interface LifecycleStepsProps {
  readonly steps: readonly LifecycleStep[];
  readonly label: string;
}

interface StatePresentation {
  readonly text: string;
  readonly icon: LucideIcon;
  readonly badgeClassName: string;
  readonly markerClassName: string;
}

/*
 * Every state carries its own text and its own icon shape. Colour is additional
 * emphasis, never the only signal.
 */
const statePresentation = {
  complete: {
    text: "Complete",
    icon: CircleCheckIcon,
    badgeClassName: "bg-success-surface text-success",
    markerClassName: "text-success",
  },
  current: {
    text: "Current step",
    icon: CircleDotIcon,
    badgeClassName: "bg-surface-muted text-ink",
    markerClassName: "text-brand",
  },
  pending: {
    text: "Pending",
    icon: CircleDashedIcon,
    badgeClassName: "bg-surface-muted text-ink-muted",
    markerClassName: "text-ink-muted",
  },
  blocked: {
    text: "Blocked",
    icon: CircleSlashIcon,
    badgeClassName: "bg-warning-surface text-warning",
    markerClassName: "text-warning",
  },
} as const satisfies Record<LifecycleStepState, StatePresentation>;

/**
 * Presents the project lifecycle as a semantic ordered list. It reports only the
 * states it was given: an empty list stays empty rather than implying progress.
 */
export function LifecycleSteps({ steps, label }: LifecycleStepsProps) {
  return (
    <ol data-slot="lifecycle-steps" aria-label={label} className="grid gap-3">
      {steps.map((step) => {
        const presentation = statePresentation[step.state];
        const StateIcon = presentation.icon;

        return (
          <li
            key={step.id}
            data-slot="lifecycle-step"
            data-state={step.state}
            {...(step.state === "current" ? { "aria-current": "step" as const } : {})}
            className={cn(
              "grid grid-cols-[auto_1fr] items-start gap-3 rounded-md border border-subtle bg-surface p-3",
              step.state === "current" && "border-brand bg-surface-muted",
            )}
          >
            <StateIcon
              aria-hidden="true"
              focusable="false"
              className={cn("mt-0.5 size-5 shrink-0", presentation.markerClassName)}
            />
            <div className="grid gap-1">
              <p className="text-sm font-medium text-ink">{step.label}</p>
              {step.description === null ? null : (
                <p className="text-sm text-ink-muted">{step.description}</p>
              )}
              <span
                className={cn(
                  "mt-1 w-fit rounded-pill px-2 py-0.5 text-xs font-medium",
                  presentation.badgeClassName,
                )}
              >
                {presentation.text}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
