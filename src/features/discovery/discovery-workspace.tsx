"use client";

import { ArrowRight, Check, PencilLine, Pause, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DiscoveryAnswerV1, DiscoverySnapshotV1 } from "@/domain/discovery/contracts";

import { DiscoveryStatus, type DiscoveryStatusProps } from "./discovery-status";

interface DiscoveryWorkspaceProps {
  readonly snapshot: DiscoverySnapshotV1;
  readonly pending: boolean;
  readonly question: ReactNode;
  readonly status: DiscoveryStatusProps | null;
  readonly onAdvance: () => void;
  readonly onPause: () => void;
  readonly onReload: () => void;
  readonly onOpenBrief: () => void;
  readonly onEditAnswer: (questionId: string) => void;
  readonly onCancelPending: () => void;
  readonly completedPath: string | null;
}

function statusLabel(snapshot: DiscoverySnapshotV1): string {
  switch (snapshot.session.status) {
    case "active":
      return snapshot.activeQuestion === null ? "Ready to improve" : "Needs one detail";
    case "sufficient":
      return "Ready to build";
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

function answerLabel(answer: DiscoveryAnswerV1): string {
  return answer.answerText.length > 64 ? `${answer.answerText.slice(0, 61)}…` : answer.answerText;
}

export function DiscoveryWorkspace({
  snapshot,
  pending,
  question,
  status,
  onAdvance,
  onPause,
  onReload,
  onOpenBrief,
  onEditAnswer,
  onCancelPending,
  completedPath,
}: DiscoveryWorkspaceProps) {
  const isPaused = snapshot.session.status === "abandoned";
  const isBlocked = snapshot.session.status === "blocked";
  const isComplete = completedPath !== null || snapshot.session.status === "completed";
  const hasQuestion = snapshot.activeQuestion !== null;
  const confirmedAnswers = snapshot.confirmedAnswers.filter(
    (answer) => answer.status === "confirmed",
  );

  return (
    <section className="grid w-full max-w-6xl gap-6" data-slot="discovery-workspace">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Sparkles aria-hidden="true" className="size-4 text-brand" />
            <span>Project workspace</span>
            <Badge variant="outline">{statusLabel(snapshot)}</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Shape the useful version.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-ink-muted">
            Start with the rough idea. Add only the details that change what should be built.
          </p>
        </div>
        {isPaused || status !== null ? null : isComplete ? (
          <Button type="button" onClick={onOpenBrief}>
            Open project brief <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={onPause} disabled={pending}>
            <Pause aria-hidden="true" /> Pause
          </Button>
        )}
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]">
        <div className="grid gap-6">
          <Card className="gap-0 overflow-hidden border-control">
            <CardHeader className="border-b border-subtle bg-surface-muted/60 py-5">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Your rough prompt</CardTitle>
                <span className="text-xs text-ink-muted">Original idea</span>
              </div>
            </CardHeader>
            <CardContent className="py-6">
              <p className="whitespace-pre-wrap text-lg leading-8 text-ink">
                {snapshot.initialRequestText}
              </p>
            </CardContent>
          </Card>

          {confirmedAnswers.length > 0 ? (
            <Card className="gap-0 border-control">
              <CardHeader className="border-b border-subtle py-5">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Added context</CardTitle>
                  <span className="text-xs text-ink-muted">
                    {confirmedAnswers.length} detail{confirmedAnswers.length === 1 ? "" : "s"} saved
                  </span>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 py-5">
                {confirmedAnswers.map((answer) => (
                  <div
                    className="flex items-start gap-3 rounded-md border border-subtle bg-surface-muted/50 p-3"
                    key={answer.id}
                  >
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                    <p className="min-w-0 flex-1 text-sm leading-6 text-ink">
                      {answerLabel(answer)}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Edit saved answer"
                      onClick={() => onEditAnswer(answer.questionId)}
                      disabled={pending}
                    >
                      <PencilLine aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-6">
          {isComplete ? (
            <Card className="border-success-border bg-success-surface">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Check aria-hidden="true" className="size-4" /> Your prompt is ready
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button type="button" onClick={onOpenBrief} className="w-full">
                  Open project brief <ArrowRight aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          ) : isPaused || isBlocked ? null : hasQuestion ? (
            question
          ) : (
            <Card className="gap-5 border-control">
              <CardHeader className="gap-3">
                <Badge variant="secondary" className="w-fit">
                  {snapshot.session.status === "sufficient" ? "Enough context" : "Next step"}
                </Badge>
                <CardTitle className="text-xl">
                  {snapshot.session.status === "sufficient"
                    ? "Ready to prepare the project brief?"
                    : "What detail would make this clearer?"}
                </CardTitle>
                <p className="text-sm leading-6 text-ink-muted">
                  {snapshot.session.status === "sufficient"
                    ? "We have enough context to turn this into a structured project brief."
                    : "We will ask one focused question at a time, only when it changes the outcome."}
                </p>
              </CardHeader>
              <CardContent>
                <Button type="button" className="w-full" onClick={onAdvance} disabled={pending}>
                  {pending ? "Improving prompt…" : "Improve this prompt"}
                  {pending ? null : <ArrowRight aria-hidden="true" />}
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3 px-1 text-xs text-ink-muted">
            <span>{snapshot.session.confirmedTurnCount} details saved</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-ink"
              onClick={onReload}
            >
              <PencilLine aria-hidden="true" className="size-3.5" /> Reload state
            </button>
          </div>
          {pending ? (
            <Button type="button" variant="outline" onClick={onCancelPending} className="w-full">
              Cancel
            </Button>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
