"use client";

import { ArrowRight, ArrowUp, Check, LoaderCircle, PencilLine } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import type {
  DiscoveryAnswerSource,
  DiscoveryQuestionV1,
  DiscoverySnapshotV1,
} from "@/domain/discovery/contracts";
import { MAX_DISCOVERY_ANSWER_UTF8_BYTES, utf8ByteLength } from "@/domain/discovery/schemas";

import { DiscoveryStatus, type DiscoveryStatusProps } from "./discovery-status";

interface DiscoveryWorkspaceProps {
  readonly snapshot: DiscoverySnapshotV1;
  readonly pending: boolean;
  readonly status: DiscoveryStatusProps | null;
  readonly editingQuestionId: string | null;
  readonly onAnswerSubmit: (answerText: string, source: DiscoveryAnswerSource) => void;
  readonly onAdvance: () => void;
  readonly onEditAnswer: (questionId: string) => void;
  readonly onCancelEdit: () => void;
  readonly onOpenBrief: () => void;
  readonly completedPath: string | null;
}

function currentAnswerFor(
  snapshot: DiscoverySnapshotV1,
  questionId: string,
): DiscoverySnapshotV1["confirmedAnswers"][number] | null {
  return (
    snapshot.confirmedAnswers.find(
      (answer) => answer.questionId === questionId && answer.status === "confirmed",
    ) ?? null
  );
}

function questionFor(
  snapshot: DiscoverySnapshotV1,
  questionId: string,
): DiscoveryQuestionV1 | null {
  return snapshot.confirmedQuestions.find((question) => question.id === questionId) ?? null;
}

function answerLabel(text: string): string {
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

function workspaceTitle(initialRequestText: string): string {
  const firstLine = initialRequestText
    .trim()
    .split(/\r\n?|\n/u, 1)[0]
    ?.replace(/[.!?]+$/u, "")
    .trim();
  const source = firstLine || "New project";
  let title = "";
  for (const character of source) {
    const candidate = title + character;
    if (utf8ByteLength(candidate) > 120) break;
    title = candidate;
  }
  return title || "New project";
}

/** Priority stays on the question as a single quiet line, never a badge chip. */
function priorityLabel(question: DiscoveryQuestionV1, answered: boolean): string {
  if (answered) return "Answered";
  return question.position <= 2 ? "Critical" : "High priority";
}

/**
 * Agent-style conversation thread: one narrow column, one turn after another.
 * Your request opens it, each agent question is a plain message with a quiet
 * priority line and clickable options, and answers land below with a tick.
 * A single composer at the bottom is the only input surface.
 */
export function DiscoveryWorkspace({
  snapshot,
  pending,
  status,
  editingQuestionId,
  onAnswerSubmit,
  onAdvance,
  onEditAnswer,
  onCancelEdit,
  onOpenBrief,
  completedPath,
}: DiscoveryWorkspaceProps) {
  const [draft, setDraft] = useState("");
  const [lastSyncKey, setLastSyncKey] = useState<string | undefined>(undefined);

  const isEditing = editingQuestionId !== null;
  const editingQuestion = isEditing ? questionFor(snapshot, editingQuestionId) : null;
  const activeQuestion = editingQuestion ?? snapshot.activeQuestion;
  const activeQuestionId = activeQuestion?.id ?? null;

  const isPaused = snapshot.session.status === "abandoned";
  const isBlocked = snapshot.session.status === "blocked";
  const isComplete = completedPath !== null || snapshot.session.status === "completed";
  const canAnswer = !pending && !isPaused && !isBlocked && !isComplete;

  // The current question is only surfaced while the conversation is live; the
  // transcript otherwise shows the answered record alone.
  const currentQuestion =
    !isEditing && !isPaused && !isBlocked && !isComplete ? snapshot.activeQuestion : null;

  const visibleQuestions = snapshot.confirmedQuestions.filter(
    (question) => question.status !== "superseded",
  );
  const activeIsListed =
    snapshot.activeQuestion !== null &&
    visibleQuestions.some((question) => question.id === snapshot.activeQuestion?.id);
  const listedQuestions =
    snapshot.activeQuestion === null || activeIsListed
      ? visibleQuestions
      : [...visibleQuestions, snapshot.activeQuestion];
  const answeredQuestions = listedQuestions.filter(
    (question) => currentAnswerFor(snapshot, question.id) !== null,
  );
  const answeredCount = answeredQuestions.length;
  const totalCount = listedQuestions.length;

  // Resync the composer draft whenever the question being answered changes,
  // including entering and leaving correction mode.
  const syncKey = `${editingQuestionId ?? ""}:${activeQuestionId ?? ""}`;
  if (lastSyncKey !== syncKey) {
    setLastSyncKey(syncKey);
    const editingAnswer =
      editingQuestionId === null ? null : currentAnswerFor(snapshot, editingQuestionId);
    setDraft(editingAnswer === null ? "" : editingAnswer.answerText);
  }

  const draftBytes = utf8ByteLength(draft);
  const draftTooLong = draftBytes > MAX_DISCOVERY_ANSWER_UTF8_BYTES;
  const draftEmpty = draft.trim().length === 0;

  function pickSuggestion(value: string): void {
    if (!canAnswer) return;
    setDraft("");
    onAnswerSubmit(value, "suggested");
  }

  function submitComposer(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending || draftTooLong) return;
    if (isEditing) {
      if (draftEmpty) return;
      setDraft("");
      onAnswerSubmit(draft.trim(), "free_text");
      return;
    }
    if (currentQuestion !== null) {
      if (!currentQuestion.allowsFreeText || draftEmpty) return;
      setDraft("");
      onAnswerSubmit(draft.trim(), "free_text");
      return;
    }
    // No open question: the message keeps shaping the project.
    onAdvance();
  }

  const title = workspaceTitle(snapshot.initialRequestText);
  const composerLabel = isEditing || currentQuestion !== null ? "Your answer" : "Send a message";
  const composerPlaceholder = isEditing
    ? "Update your answer…"
    : currentQuestion === null
      ? "Anything else? Send to continue…"
      : currentQuestion.allowsFreeText
        ? "Answer the question above…"
        : "Choose an option above";
  const composerInteractive = canAnswer && (isEditing || currentQuestion?.allowsFreeText !== false);
  // With no open question the composer doubles as the "anything else / continue"
  // input, so an empty send still advances the conversation.
  const sendDisabled =
    !composerInteractive || draftTooLong || (currentQuestion !== null && draftEmpty);

  return (
    <section
      data-slot="discovery-workspace"
      className="mx-auto grid w-full max-w-2xl gap-5"
      aria-busy={pending}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider text-ink-muted uppercase">
          <span
            role="group"
            aria-label={`${answeredCount} of ${totalCount} questions answered`}
            className="flex items-center gap-1"
          >
            {listedQuestions.map((question) => {
              const answered = currentAnswerFor(snapshot, question.id) !== null;
              const isCurrent = activeQuestionId === question.id && !answered;
              return (
                <span
                  key={question.id}
                  aria-hidden="true"
                  title={question.questionText}
                  className={cn(
                    "size-2 rounded-[2px]",
                    answered && "bg-ink",
                    isCurrent && "border border-ink bg-surface",
                    !answered && !isCurrent && "border border-subtle bg-surface",
                  )}
                />
              );
            })}
          </span>
          <span className="tabular-nums">
            {answeredCount}/{totalCount}
          </span>
          <span aria-hidden="true">·</span>
          <span>{pending ? "Saving…" : "Saved"}</span>
        </div>
      </header>

      {status === null ? null : (
        <DiscoveryStatus
          variant={status.variant}
          title={status.title}
          description={status.description}
          {...(status.action === undefined ? {} : { action: status.action })}
          {...(status.secondaryAction === undefined
            ? {}
            : { secondaryAction: status.secondaryAction })}
        />
      )}

      <div data-slot="discovery-thread" className="grid gap-8" aria-label="Discovery conversation">
        <div className="grid justify-items-end gap-1.5">
          <span className="font-mono text-[10px] font-medium tracking-[0.25em] text-ink-muted uppercase">
            You
          </span>
          <div className="max-w-[85%] rounded-xl rounded-br-sm border border-subtle bg-surface-muted px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap text-ink">
            {snapshot.initialRequestText}
          </div>
        </div>

        {answeredQuestions.map((question) => {
          const answer = currentAnswerFor(snapshot, question.id);
          if (answer === null) return null;
          return (
            <div
              key={question.id}
              data-slot="discovery-question-card"
              data-state="answered"
              className="grid gap-2"
            >
              <p className="font-mono text-[10px] font-medium tracking-[0.25em] text-ink-muted uppercase">
                Ask {String(question.position).padStart(2, "0")} · {priorityLabel(question, true)}
              </p>
              <h2 className="text-[15px] leading-6 font-medium text-ink">
                {question.questionText}
              </h2>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex size-4.5 shrink-0 items-center justify-center border border-ink bg-ink text-surface"
                  >
                    <Check className="size-3" />
                  </span>
                  <p className="text-sm leading-6 text-ink">{answerLabel(answer.answerText)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canAnswer}
                  onClick={() => onEditAnswer(question.id)}
                >
                  <PencilLine aria-hidden="true" /> Correct
                </Button>
              </div>
            </div>
          );
        })}

        {currentQuestion === null ? null : (
          <div
            data-slot="discovery-question-card"
            data-state="current"
            className="grid gap-2 border-l-2 border-ink pl-4"
          >
            <p className="font-mono text-[10px] font-medium tracking-[0.25em] text-ink-muted uppercase">
              Ask {String(currentQuestion.position).padStart(2, "0")} ·{" "}
              {priorityLabel(currentQuestion, false)}
            </p>
            <h2 className="text-[15px] leading-6 font-medium text-ink">
              {currentQuestion.questionText}
            </h2>
            <p className="text-sm leading-6 text-ink-muted">{currentQuestion.rationale}</p>
            {currentQuestion.suggestedAnswers.length === 0 ? null : (
              <div className="flex flex-wrap gap-2 pt-1">
                {currentQuestion.suggestedAnswers.map((suggestion) => (
                  <Button
                    key={suggestion.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canAnswer}
                    onClick={() => pickSuggestion(suggestion.value)}
                  >
                    {suggestion.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {isComplete ? (
          <div className="grid gap-3 rounded-xl border border-dashed border-ink bg-surface p-4">
            <p className="font-mono text-[10px] font-medium tracking-[0.3em] text-ink uppercase">
              ★ Brief ready
            </p>
            <p className="text-sm font-medium text-ink">Your project brief is ready.</p>
            <Button type="button" className="w-fit" onClick={onOpenBrief}>
              Open project brief <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        ) : isPaused ? (
          <p className="text-sm leading-6 text-ink-muted">
            This conversation is paused. Resume when you are ready.
          </p>
        ) : isBlocked ? (
          <p className="text-sm leading-6 text-ink-muted">
            This project hit its setup limit. You can pause and continue later.
          </p>
        ) : null}
      </div>

      {isComplete || isPaused || isBlocked ? null : (
        <form
          className="grid gap-1.5"
          onSubmit={submitComposer}
          aria-busy={pending}
          data-slot="discovery-composer"
        >
          {isEditing && editingQuestion !== null ? (
            <p className="font-mono text-[10px] tracking-[0.2em] text-ink-muted uppercase">
              Correcting ·{" "}
              <span className="text-ink normal-case">{editingQuestion.questionText}</span>
            </p>
          ) : null}
          <div className="flex items-end gap-2 rounded-xl border border-subtle bg-surface p-2 shadow-sm transition-colors focus-within:border-ink">
            <label className="sr-only" htmlFor="discovery-composer-input">
              {composerLabel}
            </label>
            <textarea
              id="discovery-composer-input"
              className="min-h-9 max-h-40 flex-1 resize-y bg-transparent px-1 py-1.5 text-sm leading-6 text-ink outline-none placeholder:text-ink-muted"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={composerPlaceholder}
              rows={1}
              autoComplete="off"
              dir="auto"
              disabled={!composerInteractive}
            />
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={onCancelEdit}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!canAnswer || draftTooLong || draftEmpty}>
                  Save correction
                </Button>
              </>
            ) : (
              <>
                {currentQuestion === null ? null : (
                  <button
                    type="button"
                    className="shrink-0 font-mono text-[10px] tracking-[0.2em] text-ink-muted uppercase hover:text-ink"
                    disabled={pending}
                    onClick={() => {
                      if (!pending) onAdvance();
                    }}
                  >
                    Skip
                  </button>
                )}
                <Button type="submit" size="icon" aria-label="Send" disabled={sendDisabled}>
                  {pending ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <ArrowUp aria-hidden="true" />
                  )}
                </Button>
              </>
            )}
          </div>
          {draftBytes === 0 ? null : (
            <p
              className="font-mono text-[10px] tracking-wider text-ink-muted tabular-nums"
              aria-live="polite"
            >
              {draftTooLong
                ? `Use at most ${MAX_DISCOVERY_ANSWER_UTF8_BYTES} bytes.`
                : `${draftBytes} b`}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
