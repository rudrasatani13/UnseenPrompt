import {
  CheckCircle2Icon,
  CircleAlertIcon,
  FileIcon,
  LoaderCircleIcon,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "@/components/ui/icons/refresh-cw";

export type FileItemStatus = "ready" | "uploading" | "processing" | "error" | "complete";

export interface FileItemProps {
  readonly name: string;
  readonly fileType: string;
  readonly sizeBytes: number;
  readonly status: FileItemStatus;
  readonly errorMessage: string | null;
  readonly onRetry: (() => void) | null;
  readonly onRemove: (() => void) | null;
}

interface StatusPresentation {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly inProgress: boolean;
}

const statusPresentation = {
  ready: {
    label: "Ready",
    icon: FileIcon,
    inProgress: false,
  },
  uploading: {
    label: "Uploading",
    icon: LoaderCircleIcon,
    inProgress: true,
  },
  processing: {
    label: "Processing",
    icon: LoaderCircleIcon,
    inProgress: true,
  },
  error: {
    label: "Error",
    icon: CircleAlertIcon,
    inProgress: false,
  },
  complete: {
    label: "Complete",
    icon: CheckCircle2Icon,
    inProgress: false,
  },
} as const satisfies Record<FileItemStatus, StatusPresentation>;

const IEC_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const;

/**
 * Formats a non-negative integer byte count with IEC units (1024 base).
 * Callers must validate sizeBytes before invoking this helper.
 */
function formatIecBytes(sizeBytes: number): string {
  if (sizeBytes === 0) {
    return "0 B";
  }

  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < IEC_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const unit = IEC_UNITS[unitIndex] ?? "B";
  const display =
    unitIndex === 0
      ? String(value)
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(value >= 10 ? 0 : 1);

  return `${display} ${unit}`;
}

function assertValidSizeBytes(sizeBytes: number): void {
  if (!Number.isFinite(sizeBytes) || !Number.isInteger(sizeBytes) || sizeBytes < 0) {
    throw new RangeError(
      `FileItem sizeBytes must be a finite non-negative integer, received ${String(sizeBytes)}`,
    );
  }
}

/**
 * Presents one file row with status text and optional retry/remove actions.
 *
 * This component never creates a file input, starts an upload, or invents a
 * completion percentage. Retry and remove stay optional callbacks so the
 * surrounding workflow owns authorization and side effects.
 */
export function FileItem({
  name,
  fileType,
  sizeBytes,
  status,
  errorMessage,
  onRetry,
  onRemove,
}: FileItemProps) {
  assertValidSizeBytes(sizeBytes);

  const presentation = statusPresentation[status];
  const StatusIcon = presentation.icon;
  const showRetry = status === "error" && onRetry !== null;
  const showRemove = onRemove !== null;

  return (
    <article
      data-slot="file-item"
      data-status={status}
      className="grid gap-3 rounded-md border border-subtle bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="text-sm font-medium break-words text-ink">{name}</p>
          <p className="text-xs text-ink-muted">
            <span>{fileType}</span>
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">{formatIecBytes(sizeBytes)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <StatusIcon aria-hidden="true" focusable="false" className="size-4 shrink-0" />
          <span>{presentation.label}</span>
        </div>
      </div>

      {presentation.inProgress ? (
        <p className="text-xs text-ink-muted">
          Transfer in progress. No completion percentage is shown.
        </p>
      ) : null}

      {status === "error" && errorMessage !== null ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {errorMessage}
        </p>
      ) : null}

      {showRetry || showRemove ? (
        <div className="flex flex-wrap gap-2">
          {showRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw aria-hidden="true" focusable="false" size={16} />
              Retry
            </Button>
          ) : null}
          {showRemove ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
