"use client";

import { ArrowRight, Check, PencilLine, Send, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  DiscoveryAnswerSource,
  DiscoveryQuestionV1,
  DiscoverySnapshotV1,
} from "@/domain/discovery/contracts";
import { MAX_DISCOVERY_ANSWER_UTF8_BYTES, utf8ByteLength } from "@/domain/discovery/schemas";

import { DiscoveryStatus, type DiscoveryStatusProps } from "./discovery-status";

interface DiscoveryChatProps {
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

interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly questionId?: string;
  readonly answerId?: string;
  readonly suggestions?: readonly DiscoveryQuestionV1["suggestedAnswers"][number][];
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

export function DiscoveryChat({
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
}: DiscoveryChatProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isEditing = editingQuestionId !== null;
  const editingQuestion = isEditing ? questionFor(snapshot, editingQuestionId) : null;
  const activeQuestion = editingQuestion ?? snapshot.activeQuestion;

  const messages = useMemo<readonly ChatMessage[]>(() => {
    const list: ChatMessage[] = [];
    list.push({ id: "initial-request", role: "user", text: snapshot.initialRequestText });

    for (const question of snapshot.confirmedQuestions) {
      if (question.status === "superseded") continue;
      const answer = currentAnswerFor(snapshot, question.id);
      if (answer === null) continue;
      list.push({
        id: `question-${question.id}`,
        role: "assistant",
        text: question.questionText,
        questionId: question.id,
      });
      list.push({
        id: `answer-${answer.id}`,
        role: "user",
        text: answerLabel(answer.answerText),
        questionId: question.id,
        answerId: answer.id,
      });
    }

    if (isEditing && editingQuestion !== null) {
      list.push({
        id: `editing-${editingQuestion.id}`,
        role: "assistant",
        text: editingQuestion.questionText,
        questionId: editingQuestion.id,
        suggestions: editingQuestion.suggestedAnswers,
      });
    } else if (activeQuestion !== null) {
      list.push({
        id: `active-${activeQuestion.id}`,
        role: "assistant",
        text: activeQuestion.questionText,
        questionId: activeQuestion.id,
        suggestions: activeQuestion.suggestedAnswers,
      });
    }

    return list;
  }, [snapshot, isEditing, editingQuestion, activeQuestion]);

  const isPaused = snapshot.session.status === "abandoned";
  const isBlocked = snapshot.session.status === "blocked";
  const isComplete = completedPath !== null || snapshot.session.status === "completed";
  const inputBytes = utf8ByteLength(draft);
  const inputTooLong = inputBytes > MAX_DISCOVERY_ANSWER_UTF8_BYTES;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending, status]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending || inputTooLong) return;
    const value = draft.trim();
    if (value.length === 0) return;
    if (activeQuestion !== null) {
      onAnswerSubmit(value, "free_text");
    } else {
      onAdvance();
    }
    setDraft("");
  }

  function pickSuggestion(questionId: string, value: string): void {
    if (pending) return;
    onAnswerSubmit(value, "suggested");
  }

  const canSend =
    !pending && !isPaused && !isBlocked && !isComplete && draft.trim().length > 0 && !inputTooLong;

  return (
    <section
      data-slot="discovery-chat"
      className="mx-auto grid h-full w-full max-w-3xl gap-4"
      aria-busy={pending}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Sparkles aria-hidden="true" className="size-4 text-brand" />
          <span>Project setup</span>
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

      <div
        ref={scrollRef}
        className="flex max-h-[calc(100dvh-16rem)] min-h-0 flex-col gap-4 overflow-y-auto rounded-lg border border-subtle bg-surface p-4"
        data-slot="discovery-thread"
      >
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-lg bg-brand px-4 py-3 text-surface">
                <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                {message.answerId === undefined ? null : (
                  <button
                    type="button"
                    onClick={() => onEditAnswer(message.questionId ?? "")}
                    disabled={pending}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-surface/80 hover:text-surface"
                  >
                    <PencilLine aria-hidden="true" className="size-3" /> Correct
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex justify-start">
              <div className="max-w-[85%] rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-ink">
                <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                {message.suggestions === undefined || message.suggestions.length === 0 ? null : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.suggestions.map((suggestion) => (
                      <Button
                        key={suggestion.value}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => pickSuggestion(message.questionId ?? "", suggestion.value)}
                      >
                        {suggestion.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}

        {pending ? (
          <div className="flex justify-start">
            <div
              role="status"
              className="inline-flex items-center gap-2 rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-sm text-ink-muted"
            >
              <span className="size-2 animate-pulse rounded-full bg-brand" />
              Thinking…
            </div>
          </div>
        ) : null}

        {isComplete ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border border-success-border bg-success-surface px-4 py-3 text-ink">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Check aria-hidden="true" className="size-4 text-success" />
                Your project brief is ready.
              </p>
              <Button type="button" className="mt-3" onClick={onOpenBrief}>
                Open project brief <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : isPaused ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-ink">
              <p className="text-sm leading-6 text-ink-muted">
                This conversation is paused. Resume when you are ready.
              </p>
            </div>
          </div>
        ) : isBlocked ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-ink">
              <p className="text-sm leading-6 text-ink-muted">
                This project hit its setup limit. You can pause and continue later.
              </p>
            </div>
          </div>
        ) : activeQuestion === null ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-ink">
              <p className="text-sm leading-6 text-ink">
                Got it. Anything else you want to add? Send a message to keep shaping this.
              </p>
            </div>
          </div>
        ) : null}

        {isEditing ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancelEdit}
              disabled={pending}
            >
              Cancel correction
            </Button>
          </div>
        ) : null}
      </div>

      {!isComplete && !isPaused && !isBlocked ? (
        <form
          className="flex items-end gap-2 rounded-lg border border-control bg-surface p-2"
          onSubmit={submit}
          aria-busy={pending}
        >
          <label className="sr-only" htmlFor="discovery-chat-input">
            {activeQuestion === null ? "Send a message" : "Your answer"}
          </label>
          <textarea
            id="discovery-chat-input"
            className="min-h-11 flex-1 resize-none rounded-md bg-transparent px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              activeQuestion === null ? "Anything else? Send to continue…" : "Type your answer…"
            }
            rows={1}
            autoComplete="off"
            dir="auto"
            disabled={pending}
          />
          <Button type="submit" size="icon" disabled={!canSend} aria-label="Send">
            <Send aria-hidden="true" />
          </Button>
        </form>
      ) : null}
    </section>
  );
}
