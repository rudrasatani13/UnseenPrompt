import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

export interface EmptyStateProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action: ReactNode | null;
}

/**
 * Communicates that a region has no content yet.
 *
 * The surface itself is not interactive. Any call-to-action is supplied by the
 * caller so destinations and side effects stay outside this presentation layer.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Card data-slot="empty-state" className="w-full">
      <CardContent className="flex flex-col items-start gap-4 py-2">
        <div aria-hidden="true" className="text-ink-muted [&_svg]:size-8">
          {icon}
        </div>
        <div className="grid max-w-prose gap-2">
          <h2 className="text-lg font-semibold break-words text-ink">{title}</h2>
          <p className="text-sm break-words text-ink-muted">{description}</p>
        </div>
        {action === null ? null : (
          <div data-slot="empty-state-action" className="pt-1">
            {action}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
