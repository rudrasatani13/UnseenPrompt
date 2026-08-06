"use client";

import { ArrowRight, Check, CircleCheck, LoaderCircle, Lock, PencilLine, Send } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    return <Badge variant="danger">Critical</Badge>;
  }
  return <Badge variant="warning">High priority</Badge>;
}

/**
 * Reference-layout project workspace: Inputs column with the lazy prompt and
 * prioritized question cards, a Context panel with everything captured so far,
 * and a clarification dialog for the active question.
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
  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(null);

  const isEditing = editingQuestionId !== null;
  const editingQuestion = isEditing ? questionFor(snapshot, editingQuestionId) : null;
  const activeQuestion = editingQuestion ?? snapshot.activeQuestion;
  const activeQuestionId = activeQuestion?.id ?? null;

  const isPaused = snapshot.session.status === "abandoned";
  const isBlocked = snapshot.session.status === "blocked";
  const isComplete = completedPath !== null || snapshot.session.status === "completed";

  const visibleQuestions = snapshot.confirmedQuestions.filter(
    (question) => question.status !== "superseded",
  );
  // The active question is normally part of the confirmed list; merge it in if a
  // snapshot arrives before it was appended so its card is always visible.
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

  const dialogOpen =
    status === null &&
    !isComplete &&
    !isPaused &&
    !isBlocked &&
    activeQuestion !== null &&
    dismissedQuestionId !== activeQuestionId;

  // Resync the dialog draft (and dismissal) while rendering whenever the
  // dialog's question changes, including entering correction mode.
  const syncKey = `${editingQuestionId ?? ""}:${activeQuestionId ?? ""}`;
  const [lastSyncKey, setLastSyncKey] = useState<string | undefined>(undefined);
  if (lastSyncKey !== syncKey) {
    setLastSyncKey(syncKey);
    setDismissedQuestionId(null);
    const editingAnswer =
      editingQuestionId === null ? null : currentAnswerFor(snapshot, editingQuestionId);
    setDraft(editingAnswer === null ? "" : editingAnswer.answerText);
  }

  const draftBytes = utf8ByteLength(draft);
  const draftTooLong = draftBytes > MAX_DISCOVERY_ANSWER_UTF8_BYTES;

  function closeDialog(): void {
    if (pending) return;
    if (isEditing) {
      onCancelEdit();
      return;
    }
    if (activeQuestionId !== null) setDismissedQuestionId(activeQuestionId);
  }

  function pickSuggestion(value: string): void {
    if (pending) return;
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
  const latestAssessment = snapshot.assessments.at(-1) ?? null;

  return (
    <section
      data-slot="discovery-workspace"
      className="mx-auto grid w-full gap-6"
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
          role="tablist"
          aria-label="Project views"
          className="flex gap-1 border-b border-subtle"
        >
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="-mb-px rounded-t-md border-b-2 border-brand px-3 py-2.5 text-sm font-medium text-ink"
          >
            Inputs
          </button>
          {["Versions", "Settings"].map((label) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected="false"
              disabled
              className="-mb-px flex cursor-default items-center gap-2 rounded-t-md border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-ink-muted"
            >
              {label}
              <span className="rounded-sm border border-subtle px-1.5 py-0.5 text-[10px] font-medium">
                Soon
              </span>
            </button>
          ))}
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div data-slot="discovery-thread" className="grid gap-4">
          <div className="rounded-lg border border-subtle bg-surface p-4">
            <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
              Lazy prompt
            </p>
            <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-ink">
              {snapshot.initialRequestText}
            </p>
          </div>

          <div className="grid gap-3">
            <h2 className="text-sm font-semibold text-ink">
              Improve your prompt ({answeredCount}/{listedQuestions.length})
            </h2>

            {listedQuestions.map((question) => {
              const answer = currentAnswerFor(snapshot, question.id);
              const isActive = snapshot.activeQuestion?.id === question.id;
              const isEditingThis = editingQuestionId === question.id;

              return (
                <article
                  key={question.id}
                  data-slot="discovery-question-card"
                  className={cn(
                    "grid gap-2 rounded-lg border bg-surface p-4",
                    isActive || isEditingThis ? "border-brand" : "border-subtle",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink">{question.questionText}</h3>
                    {priorityBadge(question, answer !== null)}
                  </div>
                  <p className="text-sm leading-6 text-ink-muted">{question.rationale}</p>

                  {answer !== null ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2">
                      <p className="text-sm text-ink">{answerLabel(answer.answerText)}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending || isPaused || isBlocked || isComplete}
                        onClick={() => onEditAnswer(question.id)}
                      >
                        <PencilLine aria-hidden="true" /> Correct
                      </Button>
                    </div>
                  ) : isActive ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      disabled={pending}
                      onClick={() => setDismissedQuestionId(null)}
                    >
                      Answer this question <ArrowRight aria-hidden="true" />
                    </Button>
                  ) : (
                    <p className="text-xs font-medium text-ink-muted">Up next</p>
                  )}
                </article>
              );
            })}
          </div>

          {isComplete ? (
            <div className="rounded-lg border border-success-border bg-success-surface p-4">
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
              className="grid gap-2 rounded-lg border border-subtle bg-surface p-4"
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
                  className="min-h-11 flex-1 resize-none rounded-md border border-subtle bg-surface px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  placeholder="Anything else? Send to continue…"
                  rows={1}
                  autoComplete="off"
                  dir="auto"
                  disabled={pending}
                />
                <Button type="submit" size="icon" disabled={pending} aria-label="Send">
                  <Send aria-hidden="true" />
                </Button>
              </div>
            </form>
          ) : null}
        </div>

        <aside
          data-slot="discovery-context"
          aria-label="Captured context"
          className="grid gap-4 rounded-lg border border-subtle bg-surface p-4"
        >
          <h2 className="text-sm font-semibold text-ink">Context</h2>

          <div className="grid gap-1">
            <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
              Your request
            </p>
            <p className="text-sm leading-6 whitespace-pre-wrap text-ink">
              {snapshot.initialRequestText}
            </p>
          </div>

          {listedQuestions.map((question) => {
            const answer = currentAnswerFor(snapshot, question.id);
            if (answer === null) return null;
            return (
              <div key={question.id} className="grid gap-1 border-t border-subtle pt-3">
                <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
                  {question.questionText}
                </p>
                <p className="text-sm leading-6 text-ink">{answerLabel(answer.answerText)}</p>
              </div>
            );
          })}

          {latestAssessment === null ? null : (
            <div className="grid gap-1 border-t border-subtle pt-3">
              <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
                Latest assessment
              </p>
              <p className="text-sm leading-6 text-ink-muted">{latestAssessment.rationale}</p>
            </div>
          )}

          {isComplete ? (
            <p className="border-t border-subtle pt-3 text-sm leading-6 text-ink-muted">
              Discovery is complete. The brief brings everything captured here together.
            </p>
          ) : (
            <p className="border-t border-subtle pt-3 text-sm leading-6 text-ink-muted">
              Answers land here as you confirm them. Nothing is shared outside this project.
            </p>
          )}
        </aside>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{activeQuestion?.questionText}</DialogTitle>
            <DialogDescription className="text-ink-muted">
              {activeQuestion?.rationale}
            </DialogDescription>
          </DialogHeader>

          {activeQuestion === null ? null : (
            <form className="grid gap-4" onSubmit={submitDraft} aria-busy={pending}>
              {activeQuestion.suggestedAnswers.length === 0 ? null : (
                <div className="grid gap-2">
                  {activeQuestion.suggestedAnswers.map((suggestion) => (
                    <Button
                      key={suggestion.value}
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => pickSuggestion(suggestion.value)}
                      className="h-auto justify-start px-3 py-2.5 text-left text-sm leading-6 whitespace-normal"
                    >
                      {suggestion.label}
                    </Button>
                  ))}
                </div>
              )}

              {activeQuestion.allowsFreeText ? (
                <div className="grid gap-1">
                  <label className="sr-only" htmlFor="discovery-answer-input">
                    Your answer
                  </label>
                  <textarea
                    id="discovery-answer-input"
                    className="min-h-20 w-full resize-none rounded-md border border-control bg-surface px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Type your answer or select an example above"
                    rows={3}
                    autoComplete="off"
                    dir="auto"
                    disabled={pending}
                  />
                  <p className="text-xs text-ink-muted" aria-live="polite">
                    {draftTooLong
                      ? `Use at most ${MAX_DISCOVERY_ANSWER_UTF8_BYTES} bytes.`
                      : `${draftBytes} bytes`}
                  </p>
                </div>
              ) : null}

              <DialogFooter className="justify-end">
                <Button
                  type="submit"
                  disabled={pending || draftTooLong || draft.trim().length === 0}
                  aria-label="Send"
                >
                  <Send aria-hidden="true" /> Send
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
