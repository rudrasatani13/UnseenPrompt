"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import {
  DISCOVERY_COMMAND_SCHEMA,
  DISCOVERY_SCHEMA_VERSION,
  type DiscoveryAnswerSource,
  type DiscoveryCommandV1,
  type DiscoveryCommandEnvelopeV1,
  type DiscoveryQuestionV1,
  type DiscoverySnapshotV1,
} from "@/domain/discovery/contracts";
import {
  discoveryCommandEnvelopeSchema,
  discoverySnapshotSchema,
} from "@/domain/discovery/schemas";

import { DiscoveryWorkspace } from "./discovery-workspace";

type FlowErrorVariant = "provider-error" | "stale";

interface FlowError {
  readonly variant: FlowErrorVariant;
  readonly title: string;
  readonly description: string;
}

const receiptSchema = z.strictObject({
  projectId: z.uuid(),
  stateVersion: z.number().int().safe().positive(),
  eventId: z.union([z.uuid(), z.null()]),
  replayed: z.boolean(),
  answerId: z.uuid().optional(),
});

const advanceResponseSchema = z.union([
  z.strictObject({
    status: z.enum(["question", "sufficient", "blocked"]),
    snapshot: discoverySnapshotSchema,
  }),
  z.strictObject({
    status: z.literal("completed"),
    projectId: z.uuid(),
    stateVersion: z.number().int().safe().positive(),
    eventId: z.uuid(),
    replayed: z.boolean(),
    nextPath: z.string().refine((value) => value.startsWith("/") && !value.startsWith("//")),
  }),
]);

const ERROR_COPY: Record<
  string,
  { readonly variant: FlowErrorVariant; readonly description: string }
> = {
  provider_unavailable: {
    variant: "provider-error",
    description:
      "The discovery service is unavailable right now. Your saved answers are still here; try again in a moment.",
  },
  provider_error: {
    variant: "provider-error",
    description:
      "We couldn’t continue discovery. Your saved answers are still here; try again in a moment.",
  },
  rate_limited: {
    variant: "provider-error",
    description: "Discovery is temporarily busy. Wait a moment, then try again.",
  },
};

const GENERIC_ERROR: FlowError = {
  variant: "provider-error",
  title: "We couldn’t continue discovery",
  description: "Your saved answers are still here. Try again in a moment.",
};

const STALE_ERROR: FlowError = {
  variant: "stale",
  title: "This project changed in another tab",
  description:
    "The latest saved state is loaded below. Any unsent text for the current question was kept.",
};

const CANCELLATION_UNKNOWN_ERROR: FlowError = {
  variant: "provider-error",
  title: "Request status is unknown",
  description:
    "The request may have been saved, but the latest project state could not be loaded. Your unsent answer remains on screen; reload before trying again.",
};

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `discovery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function responseCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const nested = (body as { readonly error?: unknown }).error;
  if (typeof nested !== "object" || nested === null || !("code" in nested)) return undefined;
  const code = (nested as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

class DiscoveryRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined) {
    super(code ?? "request_failed");
    this.name = "DiscoveryRequestError";
    this.status = status;
    this.code = code;
  }
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DiscoveryRequestError(response.status, undefined);
  }

  if (!response.ok) throw new DiscoveryRequestError(response.status, responseCode(body));

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new DiscoveryRequestError(response.status, "invalid_response");
  return parsed.data;
}

function errorForRequest(error: unknown): FlowError {
  if (error instanceof DiscoveryRequestError) {
    const mapped = error.code === undefined ? undefined : ERROR_COPY[error.code];
    if (mapped !== undefined) {
      return {
        variant: mapped.variant,
        title:
          mapped.variant === "provider-error"
            ? "Discovery needs a retry"
            : "Discovery needs attention",
        description: mapped.description,
      };
    }
  }
  return GENERIC_ERROR;
}

function safeNextPath(value: string): string | null {
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
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

function initialAnnouncement(snapshot: DiscoverySnapshotV1): string {
  if (snapshot.session.status === "completed") return "Discovery is complete.";
  if (snapshot.session.status === "abandoned")
    return "Discovery is paused. You can resume when ready.";
  if (snapshot.session.status === "blocked")
    return "Discovery is blocked because its question limit was reached.";
  if (snapshot.activeQuestion !== null)
    return "A saved discovery question is ready for your answer.";
  return "Discovery is ready for the next step.";
}

export interface DiscoveryFlowProps {
  readonly initialSnapshot: DiscoverySnapshotV1;
}

/**
 * Owner-facing adaptive discovery. The browser owns only drafts and navigation; every durable
 * answer, version, question, and lifecycle transition is sent through the authenticated API.
 */
export function DiscoveryFlow({ initialSnapshot }: DiscoveryFlowProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [pendingAction, setPendingAction] = useState<
    "advance" | "answer" | "abandon" | "resume" | null
  >(null);
  const [error, setError] = useState<FlowError | null>(null);
  const [announcement, setAnnouncement] = useState(() => initialAnnouncement(initialSnapshot));
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [completedPath, setCompletedPath] = useState<string | null>(
    initialSnapshot.session.status === "completed"
      ? `/projects/${initialSnapshot.projectId}/brief`
      : null,
  );
  const controllerRef = useRef<AbortController | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const pending = pendingAction !== null;
  const editingQuestion =
    editingQuestionId === null ? null : questionFor(snapshot, editingQuestionId);
  const activeQuestion = editingQuestion ?? snapshot.activeQuestion;

  function beginCorrection(questionId: string): void {
    if (pending) return;
    setEditingQuestionId(questionId);
    setError(null);
    setAnnouncement("Correction mode. Update the saved answer, then confirm the correction.");
  }

  function cancelCorrection(): void {
    if (pending) return;
    setEditingQuestionId(null);
    setError(null);
    setAnnouncement(initialAnnouncement(snapshot));
  }

  function commandEnvelope(command: DiscoveryCommandV1): DiscoveryCommandEnvelopeV1 {
    const envelope = {
      schema: DISCOVERY_COMMAND_SCHEMA,
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      projectId: snapshot.projectId,
      expectedStateVersion: snapshot.stateVersion,
      idempotencyKey: createIdempotencyKey(),
      command,
    } as const;
    if (!discoveryCommandEnvelopeSchema.safeParse(envelope).success) {
      throw new DiscoveryRequestError(422, "validation_failed");
    }
    return envelope;
  }

  async function reloadSnapshot(signal?: AbortSignal): Promise<DiscoverySnapshotV1> {
    const response = await fetch(`/api/projects/${snapshot.projectId}/discovery`, {
      method: "GET",
      cache: "no-store",
      ...(signal === undefined ? {} : { signal }),
    });
    return parseResponse(response, discoverySnapshotSchema);
  }

  function applySnapshot(
    nextSnapshot: DiscoverySnapshotV1,
    nextAnnouncement?: string,
    preserveEditing = false,
  ): void {
    setSnapshot(nextSnapshot);
    setEditingQuestionId((currentQuestionId) => {
      if (!preserveEditing || currentQuestionId === null) return null;
      return questionFor(nextSnapshot, currentQuestionId) === null ? null : currentQuestionId;
    });
    setAnnouncement(nextAnnouncement ?? initialAnnouncement(nextSnapshot));
  }

  async function refreshAfterConflict(): Promise<void> {
    try {
      const latest = await reloadSnapshot();
      applySnapshot(
        latest,
        "The latest project state is loaded. Your unsent answer text was kept.",
      );
    } catch {
      setError(GENERIC_ERROR);
    }
  }

  async function sendCommand(
    action: "advance" | "answer" | "abandon" | "resume",
    command: DiscoveryCommandV1,
    existingEnvelope?: DiscoveryCommandEnvelopeV1,
  ): Promise<void> {
    if (pending || sendingRef.current) return;
    retryRef.current = null;
    const controller = new AbortController();
    controllerRef.current = controller;
    sendingRef.current = true;
    setPendingAction(action);
    setError(null);
    let sentEnvelope: DiscoveryCommandEnvelopeV1 | undefined;

    try {
      sentEnvelope = existingEnvelope ?? commandEnvelope(command);
      const response = await fetch(`/api/projects/${snapshot.projectId}/discovery/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sentEnvelope),
        signal: controller.signal,
      });

      if (action === "advance") {
        const result = await parseResponse(response, advanceResponseSchema);
        if (result.status === "completed") {
          const nextPath = safeNextPath(result.nextPath);
          setCompletedPath(nextPath);
          setAnnouncement("Discovery is complete. Moving to the project brief.");
          if (nextPath !== null) router.push(nextPath);
        } else {
          applySnapshot(result.snapshot);
        }
        retryRef.current = null;
        return;
      }

      await parseResponse(response, receiptSchema);
      // Once the receipt is durable, finish the authoritative reload even if the user cancelled
      // the provider-bound POST while its response was in flight.
      const latest = await reloadSnapshot();
      applySnapshot(latest);
      retryRef.current = null;
    } catch (caught) {
      if (isAbortError(caught)) {
        if (action !== "advance") {
          try {
            const latest = await reloadSnapshot();
            applySnapshot(
              latest,
              "Request cancelled. The latest saved discovery state is loaded; the request may have completed before cancellation.",
              true,
            );
            retryRef.current = null;
          } catch {
            if (sentEnvelope !== undefined) {
              const retryEnvelope = sentEnvelope;
              retryRef.current = () => void sendCommand(action, command, retryEnvelope);
            }
            setError(CANCELLATION_UNKNOWN_ERROR);
            setAnnouncement(
              "Request status is unknown. The request may have been saved, but the latest project state could not be loaded.",
            );
          }
        } else {
          setAnnouncement("Request cancelled. Its outcome could not be confirmed.");
        }
        return;
      }
      if (caught instanceof DiscoveryRequestError && caught.status === 409) {
        setError(STALE_ERROR);
        await refreshAfterConflict();
        return;
      }
      if (sentEnvelope !== undefined) {
        const retryEnvelope = sentEnvelope;
        retryRef.current = () => void sendCommand(action, command, retryEnvelope);
      }
      setError(errorForRequest(caught));
      setAnnouncement("Discovery needs another attempt.");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      sendingRef.current = false;
      setPendingAction(null);
    }
  }

  function advance(): void {
    void sendCommand("advance", { type: "advance_discovery" });
  }

  function submitAnswer(answerText: string, source: DiscoveryAnswerSource): void {
    if (activeQuestion === null) return;
    const predecessor =
      editingQuestionId === null ? null : currentAnswerFor(snapshot, editingQuestionId);
    const command: DiscoveryCommandV1 =
      editingQuestionId === null || predecessor === null
        ? { type: "confirm_answer", questionId: activeQuestion.id, source, answerText }
        : {
            type: "revise_answer",
            questionId: activeQuestion.id,
            predecessorAnswerId: predecessor.id,
            source,
            answerText,
          };
    void sendCommand("answer", command);
  }

  function abandon(): void {
    void sendCommand("abandon", { type: "abandon_discovery" });
  }

  function resume(): void {
    void sendCommand("resume", { type: "resume_discovery" });
  }

  const status = snapshot.session.status;
  const workspaceStatus =
    error === null
      ? status === "abandoned"
        ? {
            variant: "abandoned" as const,
            title: "Your answers are saved",
            description: "Resume when you are ready. Your saved context will stay here.",
            action: { label: "Resume workspace", onClick: resume, disabled: pending },
            secondaryAction: {
              label: "Reload",
              onClick: () => void refreshAfterConflict(),
              disabled: pending,
            },
          }
        : status === "blocked"
          ? {
              variant: "blocked" as const,
              title: "This workspace needs attention",
              description: "The discovery limit was reached before enough context was collected.",
              action: {
                label: "Pause project",
                onClick: abandon,
                disabled: pending,
                variant: "destructive" as const,
              },
            }
          : null
      : {
          variant: error.variant,
          title: error.title,
          description: error.description,
          action:
            error.variant === "stale"
              ? { label: "Reload latest state", onClick: () => void refreshAfterConflict() }
              : {
                  label: "Try again",
                  onClick: () => {
                    const retry = retryRef.current;
                    setError(null);
                    retry?.();
                  },
                },
        };

  return (
    <>
      <DiscoveryWorkspace
        snapshot={snapshot}
        pending={pending}
        status={workspaceStatus}
        editingQuestionId={editingQuestionId}
        onAnswerSubmit={submitAnswer}
        onAdvance={advance}
        onEditAnswer={beginCorrection}
        onCancelEdit={cancelCorrection}
        onOpenBrief={() => {
          if (completedPath !== null) router.push(completedPath);
        }}
        completedPath={completedPath}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {pending ? (
        <div className="sr-only" role="status" aria-live="polite">
          Saving this step…
        </div>
      ) : null}
    </>
  );
}
