"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/components/ui/utils";

export interface ChoiceOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly description: string | null;
  readonly disabled: boolean;
}

export interface QuestionChoiceProps<TValue extends string> {
  readonly name: string;
  readonly legend: string;
  readonly value: TValue;
  readonly options: readonly ChoiceOption<TValue>[];
  readonly onValueChange: (value: TValue) => void;
}

function assertValidOptions<TValue extends string>(options: readonly ChoiceOption<TValue>[]): void {
  if (options.length === 0) {
    throw new RangeError("QuestionChoice requires at least one option");
  }

  const seen = new Set<TValue>();

  for (const option of options) {
    if (seen.has(option.value)) {
      throw new RangeError(`QuestionChoice received a duplicate option value: ${option.value}`);
    }

    seen.add(option.value);
  }
}

/**
 * A labelled single-select question.
 *
 * Selection is entirely controlled by the caller: this component reports the
 * requested value and renders whatever the caller passes back. Radix supplies
 * the arrow-key behavior; each option is a real radio with its own label and
 * description, not a card pretending to be a button.
 */
export function QuestionChoice<TValue extends string>({
  name,
  legend,
  value,
  options,
  onValueChange,
}: QuestionChoiceProps<TValue>) {
  assertValidOptions(options);

  const groupId = useId();

  return (
    <fieldset data-slot="question-choice" className="grid gap-3 border-0 p-0">
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      <RadioGroup
        name={name}
        value={value}
        aria-label={legend}
        onValueChange={(next) => onValueChange(next as TValue)}
      >
        {options.map((option) => {
          const itemId = `${groupId}-${option.value}`;
          const descriptionId = `${itemId}-description`;

          return (
            <div
              key={option.value}
              data-slot="question-choice-option"
              data-disabled={option.disabled}
              className={cn(
                "grid min-h-11 grid-cols-[auto_1fr] items-start gap-3 rounded-md border border-subtle bg-surface p-3 lg:min-h-10",
                option.value === value && "border-brand bg-surface-muted",
                option.disabled && "opacity-60",
              )}
            >
              <RadioGroupItem
                id={itemId}
                value={option.value}
                disabled={option.disabled}
                className="mt-0.5"
                {...(option.description === null ? {} : { "aria-describedby": descriptionId })}
              />
              <div className="grid gap-1">
                <Label htmlFor={itemId} className="font-medium">
                  {option.label}
                </Label>
                {option.description === null ? null : (
                  <p id={descriptionId} className="text-sm text-ink-muted">
                    {option.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
