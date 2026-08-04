"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleSlash,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type DiscoveryStatusVariant =
  "loading" | "ready" | "provider-error" | "stale" | "blocked" | "abandoned" | "completed";

export interface DiscoveryStatusAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
}

export interface DiscoveryStatusProps {
  readonly variant: DiscoveryStatusVariant;
  readonly title: string;
  readonly description: string;
  readonly action?: DiscoveryStatusAction;
  readonly secondaryAction?: DiscoveryStatusAction;
}

const ICONS = {
  loading: LoaderCircle,
  ready: CircleAlert,
  "provider-error": CircleAlert,
  stale: TriangleAlert,
  blocked: CircleSlash,
  abandoned: RotateCcw,
  completed: CircleCheck,
} as const;

const ALERT_VARIANTS = {
  loading: "info",
  ready: "info",
  "provider-error": "destructive",
  stale: "warning",
  blocked: "warning",
  abandoned: "info",
  completed: "success",
} as const;

/** A compact, announced status surface shared by discovery's retry and lifecycle states. */
export function DiscoveryStatus({
  variant,
  title,
  description,
  action,
  secondaryAction,
}: DiscoveryStatusProps) {
  const Icon = ICONS[variant];
  const alertVariant = ALERT_VARIANTS[variant];

  return (
    <Alert
      data-slot="discovery-status"
      data-variant={variant}
      variant={alertVariant}
      role={variant === "provider-error" || variant === "stale" ? "alert" : "status"}
      aria-live={variant === "provider-error" || variant === "stale" ? "assertive" : "polite"}
    >
      <Icon
        aria-hidden="true"
        focusable="false"
        className={variant === "loading" ? "animate-spin" : undefined}
      />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {action === undefined && secondaryAction === undefined ? null : (
          <div className="flex flex-wrap gap-2 pt-2">
            {action === undefined ? null : (
              <Button
                type="button"
                variant={action.variant ?? "default"}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
            )}
            {secondaryAction === undefined ? null : (
              <Button
                type="button"
                variant={secondaryAction.variant ?? "outline"}
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.disabled}
              >
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
