"use client";

import { OctagonAlertIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface RiskConfirmation {
  readonly triggerLabel: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
}

export interface RiskWarningProps {
  readonly level: "warning" | "danger";
  readonly title: string;
  readonly description: string;
  readonly confirmation: RiskConfirmation | null;
}

interface LevelPresentation {
  readonly text: string;
  readonly icon: LucideIcon;
  readonly variant: "warning" | "destructive";
  readonly confirmVariant: "default" | "destructive";
}

const levelPresentation = {
  warning: {
    text: "Warning",
    icon: TriangleAlertIcon,
    variant: "warning",
    confirmVariant: "default",
  },
  danger: {
    text: "Danger",
    icon: OctagonAlertIcon,
    variant: "destructive",
    confirmVariant: "destructive",
  },
} as const satisfies Record<RiskWarningProps["level"], LevelPresentation>;

/**
 * States a risk, and optionally offers an acknowledgement path.
 *
 * Rendering the warning never acknowledges anything: `onConfirm` runs only after
 * the user opens the dialog and activates the confirm control. There is no
 * timeout, no optimistic acknowledgement, and no inferred authorization.
 */
export function RiskWarning({ level, title, description, confirmation }: RiskWarningProps) {
  const presentation = levelPresentation[level];
  const LevelIcon = presentation.icon;

  return (
    <Alert data-slot="risk-warning" data-level={level} variant={presentation.variant}>
      <LevelIcon aria-hidden="true" focusable="false" />
      <AlertTitle>
        <span className="mr-2 rounded-sm border border-current px-2 py-0.5 text-xs uppercase">
          {presentation.text}
        </span>
        {title}
      </AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {confirmation === null ? null : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant={presentation.confirmVariant} size="sm" className="mt-2">
                {confirmation.triggerLabel}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription>{description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{confirmation.cancelLabel}</AlertDialogCancel>
                <AlertDialogAction
                  variant={presentation.confirmVariant}
                  onClick={confirmation.onConfirm}
                >
                  {confirmation.confirmLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </AlertDescription>
    </Alert>
  );
}
