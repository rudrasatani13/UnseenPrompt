"use client";

import {
  ArrowRight,
  ArrowUp,
  Check,
  CircleCheck,
  LoaderCircle,
  Lock,
  PencilLine,
  Sparkles,
} from "lucide-react";
import { type FormEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
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

function statusLabel(snapshot: DiscoverySnapshotV1): string {
  switch (snapshot.session.status) {
    case "active":
      return snapshot.activeQuestion === null ? "Listening" : "One question";
    case "sufficient":
      return "Almost ready";
    case "completed":
      return "Complete";
    case "abandoned":
      return "Paused";
    case "blocked":
      return "Needs attention";
    default:
      return snapshot.session.status;
  }
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

function priorityBadge(question: DiscoveryQuestionV1, answered: boolean) {
  if (answered) {
    return (
      <Badge variant="success">
        <CircleCheck aria-hidden="true" /> Answered
      </Badge>
    );
  }
  if (question.position <= 2) {
    return <Badge variant="default">Critical</Badge>;
  }
  return <Badge variant="outline">High priority</Badge>;
}

/**
 * Agent-style conversation thread: one column, one turn after another. Your
 * request opens the thread, every question is a message with its priority, and
 * answers land inline with a tick instead of in a modal or side panel.
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

  const visibleQuestions = snapshot.confirmedQuestions.filter(
    (question) => question.status !== "superseded",
  );
  // The active question is normally part of the confirmed list; merge it in if a
  // snapshot arrives before it was appended so its message is always visible.
  const activeIsListed =
    snapshot.activeQuestion !== null &&
    visibleQuestions.some((question) => question.id === snapshot.activeQuestion?.id);
  const listedQuestions =
    snapshot.activeQuestion === null || activeIsListed
      ? visibleQuestions
      : [...visibleQuestions, snapshot.activeQuestion];
  const answeredCount = listedQuestions.filter(
    (question) => currentAnswerFor(snapshot, question.id) !== null,
  ).length;
  const totalCount = listedQuestions.length;

  // Resync the inline draft whenever the question being answered changes,
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

  function pickSuggestion(value: string): void {
    if (!canAnswer) return;
    setDraft("");
    onAnswerSubmit(value, "suggested");
  }

  function submitDraft(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending || draftTooLong) return;
    const value = draft.trim();
    if (value.length === 0) return;
    setDraft("");
    onAnswerSubmit(value, "free_text");
  }

  function submitExtra(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending) return;
    onAdvance();
  }

  const title = workspaceTitle(snapshot.initialRequestText);

  return (
    <section
      data-slot="discovery-workspace"
      className="mx-auto grid w-full max-w-3xl gap-6"
      aria-busy={pending}
    >
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
          <p className="flex items-center gap-1.5">
            <span>Library</span>
            <span aria-hidden="true">/</span>
            <span className="text-ink">{title}</span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <Lock aria-hidden="true" className="size-3.5" /> Only you
            </span>
            <Badge variant={pending ? "secondary" : "success"}>
              {pending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {pending ? "Saving…" : "Autosaved"}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">{title}</h1>
            <Badge variant="outline">{statusLabel(snapshot)}</Badge>
          </div>
          {!isPaused && !isBlocked && !isComplete ? (
            <button
              type="button"
              className="text-xs text-ink-muted hover:text-ink"
              onClick={() => {
                if (!pending) onAdvance();
              }}
            >
              Skip for now
            </button>
          ) : null}
        </div>

        <div
          data-slot="discovery-progress"
          className="flex flex-wrap items-center gap-3 border-b border-subtle pb-3"
        >
          <div
            role="group"
            aria-label={`${answeredCount} of ${totalCount} questions answered`}
            className="flex items-center gap-1.5"
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
                    "size-2.5 rounded-[3px] transition-colors",
                    answered && "bg-ink",
                    isCurrent && "border border-ink bg-surface",
                    !answered && !isCurrent && "border border-subtle bg-surface",
                  )}
                />
              );
            })}
          </div>
          <p className="text-xs font-medium text-ink-muted tabular-nums">
            {answeredCount}/{totalCount} answered
          </p>
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

      <div data-slot="discovery-thread" className="grid gap-5" aria-label="Discovery conversation">
        <div className="grid justify-items-end gap-1.5">
          <span className="text-[10px] font-semibold tracking-widest text-ink-muted uppercase">
            You
          </span>
          <div className="max-w-[85%] rounded-xl rounded-br-sm bg-ink px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap text-surface">
            {snapshot.initialRequestText}
          </div>
        </div>

        {listedQuestions.map((question) => {
          const answer = currentAnswerFor(snapshot, question.id);
          const isActive = activeQuestionId === question.id;
          const isEditingThis = editingQuestionId === question.id;
          const answered = answer !== null;

          return (
            <article
              key={question.id}
              data-slot="discovery-question-card"
              data-state={answered ? "answered" : isActive || isEditingThis ? "active" : "upcoming"}
              className={cn(
                "grid gap-3 rounded-xl border p-4",
                isActive || isEditingThis
                  ? "border-ink bg-surface-muted/60"
                  : "border-subtle bg-surface",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded-full border border-subtle text-[11px] font-semibold text-ink-muted">
                    {question.position}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-ink-muted uppercase">
                    <Sparkles aria-hidden="true" className="size-3" /> Agent question
                  </span>
                </div>
                {priorityBadge(question, answered)}
              </div>

              <h2 className="text-[15px] leading-6 font-semibold text-ink">
                {question.questionText}
              </h2>
              <p className="text-sm leading-6 text-ink-muted">{question.rationale}</p>

              {answered && !isEditingThis ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2.5">
                    <p className="text-sm leading-6 text-ink">{answerLabel(answer.answerText)}</p>
                    <span className="flex items-center gap-1 text-xs font-medium text-success">
                      <Check aria-hidden="true" /> Saved
                    </span>
                  </div>
                  <div className="flex justify-end">
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
              ) : isActive || isEditingThis ? (
                <div className="grid gap-2" aria-busy={pending}>
                  {question.suggestedAnswers.length === 0 ? null : (
                    <div className="flex flex-wrap gap-2">
                      {question.suggestedAnswers.map((suggestion) => (
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

                  {question.allowsFreeText ? (
                    <form className="grid gap-1.5" onSubmit={submitDraft}>
                      <label className="sr-only" htmlFor="discovery-answer-input">
                        Your answer
                      </label>
                      <textarea
                        id="discovery-answer-input"
                        className="min-h-20 w-full resize-none rounded-lg border border-control bg-surface px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Type your answer or pick one above"
                        rows={3}
                        autoComplete="off"
                        dir="auto"
                        disabled={!canAnswer}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-ink-muted" aria-live="polite">
                          {draftTooLong
                            ? `Use at most ${MAX_DISCOVERY_ANSWER_UTF8_BYTES} bytes.`
                            : `${draftBytes} bytes`}
                        </p>
                        <div className="flex items-center gap-2">
                          {isEditingThis ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={onCancelEdit}
                            >
                              Cancel
                            </Button>
                          ) : null}
                          <Button
                            type="submit"
                            size="sm"
                            disabled={pending || draftTooLong || draft.trim().length === 0}
                          >
                            {isEditingThis ? "Save correction" : "Send"}
                            <ArrowUp aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </form>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs font-medium text-ink-muted">Up next</p>
              )}
            </article>
          );
        })}

        {isComplete ? (
          <div className="rounded-xl border border-success-border bg-success-surface p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Check aria-hidden="true" className="size-4 text-success" />
              Your project brief is ready.
            </p>
            <Button type="button" className="mt-3" onClick={onOpenBrief}>
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
        ) : activeQuestion === null ? (
          <form
            className="grid gap-2 rounded-xl border border-subtle bg-surface p-4"
            onSubmit={submitExtra}
          >
            <p className="text-sm leading-6 text-ink">
              Anything else you want to add? Send a message to keep shaping this.
            </p>
            <div className="flex items-end gap-2">
              <label className="sr-only" htmlFor="discovery-extra-input">
                Send a message
              </label>
              <textarea
                id="discovery-extra-input"
                className="min-h-11 flex-1 resize-none rounded-lg border border-subtle bg-surface px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                placeholder="Anything else? Send to continue…"
                rows={1}
                autoComplete="off"
                dir="auto"
                disabled={pending}
              />
              <Button type="submit" size="icon" disabled={pending} aria-label="Send">
                <ArrowUp aria-hidden="true" />
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
