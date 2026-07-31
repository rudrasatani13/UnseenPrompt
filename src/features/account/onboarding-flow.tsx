"use client";

import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { type ChoiceOption, QuestionChoice } from "@/components/product/question-choice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { CodingStyle, PreferredStack } from "@/domain/account/contracts";
import {
  isSupportedLocale,
  isSupportedTimeZone,
  type OnboardingOption,
  type OnboardingStep,
  type OnboardingStepId,
  onboardingSteps,
  TEXT_FIELD_MAX_BYTES,
  textByteLength,
} from "@/domain/account/onboarding";

const UTC = "UTC";
const DEFAULT_LOCALE = "en";
const SAVE_FAILED = "We couldn’t save your answers. Try again in a moment.";
const BYTE_BUDGET_EXCEEDED = `Use at most ${TEXT_FIELD_MAX_BYTES} bytes.`;
const INVALID_LOCALE = "Enter a language tag such as en or pt-BR.";

type StackKey = keyof PreferredStack;
type StyleKey = keyof CodingStyle;

interface Draft {
  readonly displayName: string;
  readonly skillLevel: string;
  readonly preferredStackBehavior: string;
  readonly preferredStack: Readonly<Record<StackKey, string>>;
  readonly codingStyle: Readonly<Record<StyleKey, string>>;
  readonly deploymentPreference: string;
  readonly locale: string;
  readonly timeZone: string;
}

type Status = { readonly kind: "idle" } | { readonly kind: "pending" } | { readonly kind: "error" };

/**
 * ICU spells some zones under a legacy name and omits `UTC` from its supported list, so the
 * option list is built from the supported values with `UTC` guaranteed. Building it the same way
 * on the server and in the browser keeps the rendered markup identical across hydration.
 */
function listTimeZones(): readonly string[] {
  const supported = Intl.supportedValuesOf("timeZone");

  return supported.includes(UTC) ? supported : [UTC, ...supported];
}

function detectTimeZone(): string {
  try {
    const detected = new Intl.DateTimeFormat("en-US").resolvedOptions().timeZone;

    return isSupportedTimeZone(detected) ? detected : UTC;
  } catch {
    return UTC;
  }
}

function emptyDraft(): Draft {
  return {
    displayName: "",
    skillLevel: "",
    preferredStackBehavior: "",
    preferredStack: { frontend: "", backend: "", database: "", hosting: "" },
    codingStyle: { comments: "", testing: "", paradigm: "" },
    deploymentPreference: "",
    locale: DEFAULT_LOCALE,
    timeZone: detectTimeZone(),
  };
}

function toChoiceOptions(options: readonly OnboardingOption[]): readonly ChoiceOption<string>[] {
  return options.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.explanation,
    disabled: false,
  }));
}

function withinByteBudget(value: string): boolean {
  return textByteLength(value.trim()) <= TEXT_FIELD_MAX_BYTES;
}

/**
 * The running count is only meaningful while the answer still fits; past the budget the field
 * shows the error instead, because a counter cannot report a number above its own maximum.
 */
function byteBudgetProps(
  value: string,
): { currentLength: number; maxLength: number } | { error: string } {
  return withinByteBudget(value)
    ? { currentLength: textByteLength(value), maxLength: TEXT_FIELD_MAX_BYTES }
    : { error: BYTE_BUDGET_EXCEEDED };
}

function visibleSteps(draft: Draft): readonly OnboardingStep[] {
  return onboardingSteps.filter(
    (step) => step.id !== "preferredStack" || draft.preferredStackBehavior === "prefer_saved",
  );
}

function compact(source: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value !== ""),
  );
}

function toAnswers(draft: Draft): Record<string, unknown> {
  const displayName = draft.displayName.trim();

  return {
    displayName: displayName === "" ? null : displayName,
    skillLevel: draft.skillLevel,
    preferredStackBehavior: draft.preferredStackBehavior,
    preferredStack:
      draft.preferredStackBehavior === "prefer_saved" ? compact(draft.preferredStack) : {},
    codingStyle: compact(draft.codingStyle),
    deploymentPreference:
      draft.deploymentPreference === "" || draft.deploymentPreference === "undecided"
        ? null
        : draft.deploymentPreference,
    locale: draft.locale.trim(),
    timeZone: draft.timeZone,
  };
}

/** The three single-choice steps each own one draft field, addressed by the step's own id. */
function choiceValue(draft: Draft, id: OnboardingStepId): string {
  switch (id) {
    case "skillLevel":
      return draft.skillLevel;
    case "preferredStackBehavior":
      return draft.preferredStackBehavior;
    case "deploymentPreference":
      return draft.deploymentPreference;
    default:
      return "";
  }
}

function withChoice(draft: Draft, id: OnboardingStepId, value: string): Draft {
  switch (id) {
    case "skillLevel":
      return { ...draft, skillLevel: value };
    case "preferredStackBehavior":
      return { ...draft, preferredStackBehavior: value };
    case "deploymentPreference":
      return { ...draft, deploymentPreference: value };
    default:
      return draft;
  }
}

/** A step may only be left once its own answer is storable; the server re-checks all of it. */
function isStepAnswered(step: OnboardingStep, draft: Draft): boolean {
  switch (step.id) {
    case "displayName":
      return withinByteBudget(draft.displayName);
    case "skillLevel":
      return draft.skillLevel !== "";
    case "preferredStackBehavior":
      return draft.preferredStackBehavior !== "";
    case "preferredStack":
      return Object.values(draft.preferredStack).every(withinByteBudget);
    case "locale":
      return draft.locale.trim() !== "" && isSupportedLocale(draft.locale.trim());
    default:
      return true;
  }
}

export function OnboardingFlow() {
  const router = useRouter();
  const headingId = useId();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [position, setPosition] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const timeZones = useMemo(() => listTimeZones(), []);

  const steps = visibleSteps(draft);
  const index = Math.min(position, steps.length - 1);
  const step = steps[index];

  if (!step) {
    throw new RangeError("OnboardingFlow reached a step that does not exist");
  }

  const isLast = index === steps.length - 1;
  const pending = status.kind === "pending";
  const canAdvance = isStepAnswered(step, draft) && !pending;

  async function submit(): Promise<void> {
    setStatus({ kind: "pending" });

    try {
      const response = await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toAnswers(draft)),
      });

      if (!response.ok) {
        setStatus({ kind: "error" });
        return;
      }

      router.replace("/profile");
    } catch {
      setStatus({ kind: "error" });
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canAdvance) {
      return;
    }

    if (isLast) {
      void submit();
      return;
    }

    setPosition(index + 1);
  }

  const localeError =
    draft.locale.trim() === "" || isSupportedLocale(draft.locale.trim())
      ? undefined
      : INVALID_LOCALE;

  return (
    <form
      data-slot="onboarding-flow"
      className="grid w-full max-w-2xl gap-8"
      onSubmit={onSubmit}
      noValidate
      aria-busy={pending}
      aria-labelledby={headingId}
    >
      <div className="grid gap-3">
        <h1 id={headingId} className="text-2xl font-semibold tracking-tight text-ink">
          Set up your account
        </h1>
        <Progress
          value={((index + 1) / steps.length) * 100}
          aria-label={`Question ${index + 1} of ${steps.length}`}
        />
        <p className="text-sm text-ink-muted">{`Question ${index + 1} of ${steps.length}`}</p>
      </div>

      <Card>
        <CardContent className="grid gap-6">
          {step.kind === "choice" ? null : (
            <div className="grid gap-2">
              <h2 className="text-lg font-semibold text-ink">{step.question}</h2>
              <p className="text-sm text-ink-muted">{step.explanation}</p>
            </div>
          )}

          {step.kind === "text" ? (
            <FormField
              label={step.label}
              description={step.explanation}
              {...byteBudgetProps(draft.displayName)}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  name="displayName"
                  autoComplete="name"
                  value={draft.displayName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, displayName: event.target.value }))
                  }
                  className="min-h-11"
                />
              )}
            </FormField>
          ) : null}

          {step.kind === "choice" ? (
            <QuestionChoice
              name={step.id}
              legend={step.question}
              value={choiceValue(draft, step.id)}
              options={toChoiceOptions(step.options)}
              onValueChange={(value) => setDraft((current) => withChoice(current, step.id, value))}
            />
          ) : null}

          {step.kind === "stackFields"
            ? step.fields.map((field) => {
                const value = draft.preferredStack[field.key];

                return (
                  <FormField key={field.key} label={field.label} {...byteBudgetProps(value)}>
                    {(controlProps) => (
                      <Input
                        {...controlProps}
                        name={field.key}
                        placeholder={field.placeholder}
                        value={value}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            preferredStack: {
                              ...current.preferredStack,
                              [field.key]: event.target.value,
                            },
                          }))
                        }
                        className="min-h-11"
                      />
                    )}
                  </FormField>
                );
              })
            : null}

          {step.kind === "styleFields"
            ? step.fields.map((field) => (
                <QuestionChoice
                  key={field.key}
                  name={field.key}
                  legend={field.label}
                  value={draft.codingStyle[field.key]}
                  options={toChoiceOptions(field.options)}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      codingStyle: { ...current.codingStyle, [field.key]: value },
                    }))
                  }
                />
              ))
            : null}

          {step.kind === "locale" ? (
            <FormField
              label={step.label}
              {...(localeError === undefined ? {} : { error: localeError })}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  name="locale"
                  autoComplete="language"
                  value={draft.locale}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, locale: event.target.value }))
                  }
                  className="min-h-11"
                />
              )}
            </FormField>
          ) : null}

          {step.kind === "timeZone" ? (
            <div className="grid gap-2">
              <Label htmlFor="onboarding-time-zone">{step.label}</Label>
              <select
                id="onboarding-time-zone"
                name="timeZone"
                value={draft.timeZone}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, timeZone: event.target.value }))
                }
                className="min-h-11 rounded-md border border-subtle bg-surface px-3 text-ink"
              >
                {timeZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setPosition(Math.max(index - 1, 0))}
          disabled={index === 0 || pending}
          className="min-h-11"
        >
          Back
        </Button>
        <Button type="submit" disabled={!canAdvance} className="min-h-11">
          {isLast ? (pending ? "Saving…" : "Confirm and finish") : "Next"}
        </Button>
      </div>

      <div
        role={status.kind === "error" ? "alert" : "status"}
        aria-live="polite"
        className="flex min-h-5 items-start gap-2 text-sm font-medium text-ink"
      >
        {status.kind === "error" ? (
          <>
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{SAVE_FAILED}</span>
          </>
        ) : null}
      </div>
    </form>
  );
}
