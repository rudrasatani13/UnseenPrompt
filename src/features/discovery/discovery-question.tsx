"use client";

import { type FormEvent, useMemo } from "react";

import { type ChoiceOption, QuestionChoice } from "@/components/product/question-choice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import type { DiscoveryAnswerSource, DiscoveryQuestionV1 } from "@/domain/discovery/contracts";
import { MAX_DISCOVERY_ANSWER_UTF8_BYTES, utf8ByteLength } from "@/domain/discovery/schemas";

export interface DiscoveryQuestionProps {
  readonly question: DiscoveryQuestionV1;
  readonly answerText: string;
  readonly answerSource: DiscoveryAnswerSource | null;
  readonly pending: boolean;
  readonly submitLabel: string;
  readonly onAnswerChange: (answerText: string, source: DiscoveryAnswerSource) => void;
  readonly onSubmit: (answerText: string, source: DiscoveryAnswerSource) => void;
  readonly onCancel?: () => void;
}

function uniqueOptions(
  suggestions: readonly DiscoveryQuestionV1["suggestedAnswers"][number][],
): readonly ChoiceOption<string>[] {
  const seen = new Set<string>();

  return suggestions.flatMap((suggestion) => {
    if (seen.has(suggestion.value)) return [];
    seen.add(suggestion.value);
    return [
      {
        value: suggestion.value,
        label: suggestion.label,
        description: null,
        disabled: false,
      },
    ];
  });
}

/** One explicit, owner-confirmed question action; selecting a suggestion never submits it. */
export function DiscoveryQuestion({
  question,
  answerText,
  answerSource,
  pending,
  submitLabel,
  onAnswerChange,
  onSubmit,
  onCancel,
}: DiscoveryQuestionProps) {
  const options = useMemo(
    () => uniqueOptions(question.suggestedAnswers),
    [question.suggestedAnswers],
  );
  const selectedSuggestion = answerSource === "suggested" ? answerText : "";
  const answerBytes = utf8ByteLength(answerText);
  const answerTooLong = answerBytes > MAX_DISCOVERY_ANSWER_UTF8_BYTES;
  const answerMissing = answerText.trim().length === 0;
  const answerUnavailable = options.length === 0 && !question.allowsFreeText;
  const submitDisabled = pending || answerMissing || answerTooLong || answerUnavailable;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitDisabled || answerSource === null) return;
    onSubmit(answerText, answerSource);
  }

  return (
    <form
      data-slot="discovery-question"
      className="grid gap-6"
      onSubmit={submit}
      noValidate
      aria-busy={pending}
      aria-labelledby={`discovery-question-${question.id}`}
    >
      <Card>
        <CardHeader>
          <p className="text-sm font-medium tracking-wide text-brand uppercase">One detail</p>
          <CardTitle id={`discovery-question-${question.id}`} className="text-xl leading-snug">
            {question.questionText}
          </CardTitle>
          <p className="text-sm leading-6 text-ink-muted">
            <span className="font-medium text-ink">Why this matters:</span> {question.rationale}
          </p>
        </CardHeader>
        <CardContent className="grid gap-6">
          {options.length === 0 ? null : (
            <QuestionChoice
              name={`discovery-answer-${question.id}`}
              legend="Choose an answer"
              value={selectedSuggestion}
              options={options}
              onValueChange={(value) => onAnswerChange(value, "suggested")}
            />
          )}

          {question.allowsFreeText ? (
            <FormField
              label="Or write your own answer"
              description="A short, specific answer is enough."
              {...(answerTooLong
                ? { error: `Use at most ${MAX_DISCOVERY_ANSWER_UTF8_BYTES} bytes.` }
                : answerMissing && answerSource === "free_text"
                  ? { error: "Add an answer before confirming." }
                  : {})}
              {...(answerTooLong
                ? {}
                : { currentLength: answerBytes, maxLength: MAX_DISCOVERY_ANSWER_UTF8_BYTES })}
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  value={answerSource === "free_text" ? answerText : ""}
                  onChange={(event) => onAnswerChange(event.target.value, "free_text")}
                  placeholder="Write an answer in your own words"
                  rows={4}
                  dir="auto"
                  spellCheck
                  autoComplete="off"
                  disabled={pending}
                />
              )}
            </FormField>
          ) : null}

          {answerUnavailable ? (
            <p role="alert" className="text-sm font-medium text-danger">
              This question has no usable answer choices. Reload the project and try again.
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="border-t border-subtle pt-6">
          <Button type="submit" disabled={submitDisabled}>
            {submitLabel}
          </Button>
          {onCancel === undefined ? null : (
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              Cancel correction
            </Button>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
