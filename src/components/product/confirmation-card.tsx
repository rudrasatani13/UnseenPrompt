import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface ConfirmationCardProps {
  readonly title: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly confirmLabel: string;
  readonly rejectLabel: string;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onReject: () => void;
}

/**
 * Presents what a decision will do, then hands the decision back to the caller.
 *
 * Labels never change while `busy` is true, so the controls keep their size and
 * the user keeps reading the same words. Rejection is a real, equally reachable
 * choice, so it is styled as an alternative rather than as a destructive action.
 */
export function ConfirmationCard({
  title,
  summary,
  details,
  confirmLabel,
  rejectLabel,
  busy,
  onConfirm,
  onReject,
}: ConfirmationCardProps) {
  return (
    <Card data-slot="confirmation-card" data-busy={busy}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      {details.length === 0 ? null : (
        <CardContent>
          <ul className="grid gap-2 text-sm text-ink">
            {details.map((detail) => (
              <li key={detail} className="grid grid-cols-[auto_1fr] items-start gap-2">
                <span aria-hidden="true" className="mt-2 size-1.5 rounded-pill bg-brand" />
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
      <CardFooter>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          {...(busy ? { "aria-busy": true } : {})}
        >
          {confirmLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onReject}
          disabled={busy}
          {...(busy ? { "aria-busy": true } : {})}
        >
          {rejectLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}
