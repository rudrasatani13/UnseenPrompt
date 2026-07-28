import {
  CircleCheckBigIcon,
  CircleDotIcon,
  FileTextIcon,
  UserCheckIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";

export type EvidenceState = "claimed" | "evidence-supplied" | "user-confirmed" | "verified";

export interface EvidenceLabelProps {
  readonly state: EvidenceState;
  readonly className?: string;
}

type BadgeVariant = "outline" | "info" | "warning" | "success";

interface EvidencePresentation {
  readonly text: string;
  readonly icon: LucideIcon;
  readonly variant: BadgeVariant;
}

/*
 * Exactly four states. A fifth would imply a level of assurance UnseenPrompt
 * cannot demonstrate, so the type and this map are deliberately closed.
 */
const evidencePresentation = {
  claimed: { text: "Claimed", icon: CircleDotIcon, variant: "outline" },
  "evidence-supplied": { text: "Evidence supplied", icon: FileTextIcon, variant: "info" },
  "user-confirmed": { text: "User confirmed", icon: UserCheckIcon, variant: "warning" },
  verified: { text: "Verified", icon: CircleCheckBigIcon, variant: "success" },
} as const satisfies Record<EvidenceState, EvidencePresentation>;

/**
 * States how strongly a claim is supported. The label is always text plus a
 * state-specific icon, so the distinction survives greyscale and forced colours.
 */
export function EvidenceLabel({ state, className }: EvidenceLabelProps) {
  const presentation = evidencePresentation[state];
  const StateIcon = presentation.icon;

  return (
    <Badge
      data-slot="evidence-label"
      data-state={state}
      variant={presentation.variant}
      className={cn("gap-1.5", className)}
    >
      <StateIcon aria-hidden="true" focusable="false" />
      {presentation.text}
    </Badge>
  );
}
