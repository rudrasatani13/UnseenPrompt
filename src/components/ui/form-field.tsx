"use client";

import { type ReactNode, useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/utils";

export interface FormFieldControlProps {
  readonly id: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
}

export interface FormFieldProps {
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly currentLength?: number;
  readonly maxLength?: number;
  readonly children: (controlProps: FormFieldControlProps) => ReactNode;
  readonly className?: string;
}

function assertValidCharacterCount(
  currentLength: number | undefined,
  maxLength: number | undefined,
): void {
  if (currentLength === undefined && maxLength === undefined) {
    return;
  }

  if (currentLength === undefined || maxLength === undefined) {
    throw new RangeError(
      `FormField requires currentLength and maxLength together, received currentLength=${String(currentLength)} maxLength=${String(maxLength)}`,
    );
  }

  for (const [name, value] of [
    ["currentLength", currentLength],
    ["maxLength", maxLength],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(
        `FormField ${name} must be a finite non-negative integer, received ${String(value)}`,
      );
    }
  }

  if (currentLength > maxLength) {
    throw new RangeError(
      `FormField currentLength must not exceed maxLength, received currentLength=${currentLength} maxLength=${maxLength}`,
    );
  }
}

/**
 * Owns the visible label, optional description, optional persistent error, and
 * optional character count for a single control. It never owns the control's
 * value, and disabled/read-only stay native props supplied by the caller.
 */
export function FormField({
  id,
  label,
  description,
  error,
  currentLength,
  maxLength,
  children,
  className,
}: FormFieldProps) {
  assertValidCharacterCount(currentLength, maxLength);

  const generatedId = useId();
  const controlId = id ?? `form-field-${generatedId}`;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const countId = `${controlId}-count`;
  const hasCount = currentLength !== undefined && maxLength !== undefined;

  const describedBy = [
    description === undefined ? null : descriptionId,
    error === undefined ? null : errorId,
    hasCount ? countId : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" ");

  const controlProps: FormFieldControlProps = {
    id: controlId,
    ...(describedBy === "" ? {} : { "aria-describedby": describedBy }),
    ...(error === undefined ? {} : { "aria-invalid": true as const }),
  };

  return (
    <div data-slot="form-field" className={cn("grid gap-2", className)}>
      <Label htmlFor={controlId}>{label}</Label>
      {description === undefined ? null : (
        <p id={descriptionId} className="text-sm text-ink-muted">
          {description}
        </p>
      )}
      {children(controlProps)}
      <div className="flex flex-wrap items-start justify-between gap-2">
        {error === undefined ? (
          <span />
        ) : (
          <p id={errorId} role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {hasCount ? (
          <p id={countId} className="text-xs text-ink-muted tabular-nums">
            {`${currentLength} / ${maxLength} characters`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
