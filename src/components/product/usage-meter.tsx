import { Progress } from "@/components/ui/progress";

export interface UsageMeterProps {
  readonly label: string;
  readonly used: number;
  readonly limit: number;
  readonly unit: string;
}

/**
 * Rejects impossible usage instead of clamping it. A meter that quietly renders
 * `11 / 10` as "full" hides a data defect the caller needs to fix.
 *
 * Finite fractional values are allowed — the contract rejects non-finite values,
 * limit <= 0, used < 0, and used > limit, not integer-only domain data.
 */
function assertValidUsage(used: number, limit: number): void {
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new RangeError(
      `UsageMeter limit must be a finite number greater than zero, received used=${String(used)} limit=${String(limit)}`,
    );
  }

  if (!Number.isFinite(used) || used < 0) {
    throw new RangeError(
      `UsageMeter used must be a finite non-negative number, received used=${String(used)} limit=${String(limit)}`,
    );
  }

  if (used > limit) {
    throw new RangeError(
      `UsageMeter used must not exceed limit, received used=${String(used)} limit=${String(limit)}`,
    );
  }
}

export function UsageMeter({ label, used, limit, unit }: UsageMeterProps) {
  assertValidUsage(used, limit);

  const remaining = limit - used;
  const percentage = (used / limit) * 100;

  return (
    <div data-slot="usage-meter" className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-sm text-ink-muted tabular-nums">{`${used} of ${limit} ${unit} used`}</p>
      </div>
      <Progress
        value={percentage}
        aria-label={label}
        aria-valuemin={0}
        aria-valuenow={used}
        aria-valuemax={limit}
      />
      <p className="text-xs text-ink-muted tabular-nums">{`${remaining} ${unit} remaining`}</p>
    </div>
  );
}
