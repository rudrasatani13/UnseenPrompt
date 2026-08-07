"use client";

import { ArrowRight, PencilLine, RotateCcw, Sparkles } from "lucide-react";

import { type ChoiceOption, QuestionChoice } from "@/components/product/question-choice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { MAX_PROJECT_TITLE_UTF8_BYTES, utf8ByteLength } from "@/domain/discovery/schemas";
import type { ProjectMode } from "@/domain/discovery/contracts";

export interface ComposerIntent {
  readonly mode: ProjectMode;
  readonly confidence: number;
  readonly rationale: string;
  readonly detectedLanguage: string;
}

export interface IntentConfirmationProps {
  readonly intent: ComposerIntent;
  readonly title: string;
  readonly selectedMode: ProjectMode;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onTitleChange: (title: string) => void;
  readonly onModeChange: (mode: ProjectMode) => void;
  readonly onConfirm: () => void;
  readonly onEditRequest: () => void;
  readonly onRetry: () => void;
}

const MODE_OPTIONS: readonly ChoiceOption<ProjectMode>[] = [
  {
    value: "new_build",
    label: "New build",
    description: "Start a new product or project from an early idea.",
    disabled: false,
  },
  {
    value: "feature",
    label: "Feature",
    description: "Add or change one capability in an existing system.",
    disabled: false,
  },
  {
    value: "bug",
    label: "Bug",
    description: "Understand and fix behavior that is not working as expected.",
    disabled: false,
  },
  {
    value: "review",
    label: "Review",
    description: "Examine a design, implementation, or decision with a clear lens.",
    disabled: false,
  },
  {
    value: "test",
    label: "Test",
    description: "Plan or improve coverage for a system and its risks.",
    disabled: false,
  },
  {
    value: "deploy",
    label: "Deploy",
    description: "Prepare a release, environment, or rollback path.",
    disabled: false,
  },
  {
    value: "improve",
    label: "Improve",
    description: "Make an existing workflow, system, or outcome better.",
    disabled: false,
  },
];

function percent(confidence: number): string {
  return `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`;
}

function titleError(title: string): string | undefined {
  if (title.trim().length === 0) return "Add a short project title.";
  if (utf8ByteLength(title) > MAX_PROJECT_TITLE_UTF8_BYTES) {
    return `Use at most ${MAX_PROJECT_TITLE_UTF8_BYTES} bytes.`;
  }
  return undefined;
}

/** Explicitly confirms the model's routing suggestion before a canonical project is created. */
export function IntentConfirmation({
  intent,
  title,
  selectedMode,
  pending,
  error,
  onTitleChange,
  onModeChange,
  onConfirm,
  onEditRequest,
  onRetry,
}: IntentConfirmationProps) {
  const currentTitleError = titleError(title);
  const canConfirm = currentTitleError === undefined && !pending;

  return (
    <section
      data-slot="intent-confirmation"
      className="grid w-full max-w-3xl gap-6"
      aria-labelledby="intent-confirmation-heading"
      aria-busy={pending}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-brand">
          <Sparkles aria-hidden="true" size={16} />
          <span>One small confirmation before setup</span>
        </div>
        <h1
          id="intent-confirmation-heading"
          className="text-2xl font-semibold tracking-tight text-ink md:text-3xl"
        >
          Does this look like the right kind of work?
        </h1>
        <p className="max-w-prose text-sm leading-6 text-ink-muted">
          We use your choice to shape the next questions. The suggestion is a starting point, not a
          decision made for you.
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-ink bg-surface-muted/60 p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded-full border border-subtle text-[11px] font-semibold text-ink-muted">
            1
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-ink-muted uppercase">
            <Sparkles aria-hidden="true" className="size-3" /> Agent question
          </span>
        </div>

        <h2 className="text-[15px] leading-6 font-semibold text-ink">Route this request</h2>
        <p className="text-sm leading-6 text-ink-muted">{intent.rationale}</p>
        <p className="text-xs text-ink-muted">
          Supporting signal: {percent(intent.confidence)} confidence · language detected as{" "}
          <span className="font-mono">{intent.detectedLanguage}</span>
        </p>

        <QuestionChoice
          name="project-mode"
          legend="Choose a project mode"
          value={selectedMode}
          options={MODE_OPTIONS}
          onValueChange={onModeChange}
        />

        <FormField
          label="Project title"
          description="You can change this before setup starts."
          {...(currentTitleError === undefined
            ? { currentLength: utf8ByteLength(title), maxLength: MAX_PROJECT_TITLE_UTF8_BYTES }
            : { error: currentTitleError })}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              autoFocus
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              autoComplete="off"
              spellCheck
            />
          )}
        </FormField>

        {error === null ? null : (
          <Alert variant="destructive">
            <AlertTitle>We could not finish that step.</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                disabled={pending}
              >
                <RotateCcw aria-hidden="true" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-3">
          <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
            {pending ? "Creating project…" : "Confirm and continue"}
            {pending ? null : <ArrowRight aria-hidden="true" />}
          </Button>
          <Button type="button" variant="ghost" onClick={onEditRequest} disabled={pending}>
            <PencilLine aria-hidden="true" />
            Edit request
          </Button>
        </div>
      </div>
    </section>
  );
}

export { MODE_OPTIONS };
