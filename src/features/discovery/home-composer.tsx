"use client";

import { ArrowUp, LoaderCircle, PencilLine, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  COMPOSER_DRAFT_COMMAND_SCHEMA,
  COMPOSER_DRAFT_INPUT_SCHEMA,
  DISCOVERY_SCHEMA_VERSION,
  type ProjectMode,
} from "@/domain/discovery/contracts";
import {
  composerDraftCommandEnvelopeSchema,
  composerDraftCreateInputSchema,
  MAX_INITIAL_REQUEST_UTF8_BYTES,
  utf8ByteLength,
} from "@/domain/discovery/schemas";
import { intentDetectionSchema } from "@/domain/model/schemas";

import { IntentConfirmation, type ComposerIntent } from "./intent-confirmation";

type ComposerState = "composing" | "submitting" | "confirming" | "confirming_submission";

interface DraftStartAwaitingResponse {
  readonly draftId: string;
  readonly version: number;
  readonly status: "awaiting_confirmation";
  readonly intent: ComposerIntent;
  readonly replayed: boolean;
}

interface DraftStartRetryResponse {
  readonly draftId: string;
  readonly version: number;
  readonly status: "retry_required";
  readonly lastErrorCode: string;
  readonly replayed: boolean;
}

type DraftStartResponse = DraftStartAwaitingResponse | DraftStartRetryResponse;

interface PromotionResponse {
  readonly draftId: string;
  readonly version: number;
  readonly status: "promoted";
  readonly projectId: string;
  readonly replayed: boolean;
}

const draftStartResponseSchema = z.union([
  z.strictObject({
    draftId: z.uuid(),
    version: z.number().int().safe().positive(),
    status: z.literal("awaiting_confirmation"),
    intent: intentDetectionSchema,
    replayed: z.boolean(),
  }),
  z.strictObject({
    draftId: z.uuid(),
    version: z.number().int().safe().positive(),
    status: z.literal("retry_required"),
    lastErrorCode: z.string().trim().min(1).max(80),
    replayed: z.boolean(),
  }),
]);

const promotionResponseSchema = z.strictObject({
  draftId: z.uuid(),
  version: z.number().int().safe().positive(),
  status: z.literal("promoted"),
  projectId: z.uuid(),
  replayed: z.boolean(),
});

const ERROR_COPY: Record<string, string> = {
  provider_unavailable: "The intent check is unavailable right now. Try again in a moment.",
  auth_required: "Your session has expired. Refresh the page and try again.",
  validation_failed: "Add a little more detail, then try again.",
  conflict: "This request changed while it was being submitted. Start it again to continue.",
};

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `composer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function deriveTitle(value: string): string {
  const firstLine = value
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

function errorMessage(code: unknown): string {
  return typeof code === "string" && ERROR_COPY[code]
    ? ERROR_COPY[code]
    : "We couldn’t finish that step. Try again in a moment.";
}

async function responseError(response: Response): Promise<Error> {
  let code: unknown;
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const nested = (body as { readonly error?: unknown }).error;
      if (typeof nested === "object" && nested !== null && "code" in nested) {
        code = (nested as { readonly code?: unknown }).code;
      }
    }
  } catch {
    code = undefined;
  }
  return new Error(errorMessage(code));
}

function parseResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("invalid_response");
  return parsed.data;
}

function titleWithinBudget(value: string): boolean {
  return value.trim().length > 0 && utf8ByteLength(value) <= 240;
}

export interface ComposerPrefill {
  /** Monotonic token so the same template can be applied twice in a row. */
  readonly token: number;
  readonly value: string;
}

export interface HomeComposerProps {
  readonly prefill?: ComposerPrefill | null;
  /**
   * Reports whether the composer is still showing its home form. The home
   * surface uses this to step the hero and Discover sections aside once the
   * confirmation flow takes over.
   */
  readonly onHomeStateChange?: (inHomeView: boolean) => void;
}

/**
 * Authenticated Home Composer. It owns only browser state and direct API calls; provider and
 * persistence adapters stay server-side behind the authenticated routes.
 */
export function HomeComposer({ prefill = null, onHomeStateChange }: HomeComposerProps = {}) {
  const router = useRouter();
  const [requestText, setRequestText] = useState("");
  const [state, setState] = useState<ComposerState>("composing");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftStartResponse | null>(null);
  const [selectedMode, setSelectedMode] = useState<ProjectMode | null>(null);
  const [title, setTitle] = useState("");
  const [promotedProjectId, setPromotedProjectId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const [lastPrefillToken, setLastPrefillToken] = useState<number | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  // Apply Discover prefills while rendering so the textarea updates in the
  // same pass as the new token instead of a follow-up effect render.
  if (prefill !== null && prefill.token !== lastPrefillToken) {
    setLastPrefillToken(prefill.token);
    setRequestText(prefill.value);
  }

  const pending = state === "submitting" || state === "confirming_submission";
  const requestBytes = utf8ByteLength(requestText);
  const requestError =
    requestText.trim().length === 0 ? "Tell us what you want to work on." : undefined;

  // The home form is only the composing view; every other state belongs to the
  // confirmation flow. Report transitions while rendering so the parent can
  // hide the hero in the same pass as the state that caused the change.
  const inHomeView = draft === null && promotedProjectId === null && state === "composing";
  const [lastReportedInHomeView, setLastReportedInHomeView] = useState<boolean | null>(null);
  if (lastReportedInHomeView !== inHomeView) {
    setLastReportedInHomeView(inHomeView);
    onHomeStateChange?.(inHomeView);
  }

  async function sendStart(inputText: string, idempotencyKey: string): Promise<void> {
    if (submittingRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    submittingRef.current = true;
    setState("submitting");
    setError(null);

    try {
      const body = {
        schema: COMPOSER_DRAFT_INPUT_SCHEMA,
        schemaVersion: DISCOVERY_SCHEMA_VERSION,
        initialRequestText: inputText,
        idempotencyKey,
      } as const;
      if (!composerDraftCreateInputSchema.safeParse(body).success) {
        throw new Error("validation_failed");
      }
      const response = await fetch("/api/composer/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw await responseError(response);
      const parsed = parseResponse(draftStartResponseSchema, await response.json());
      setDraft(parsed);
      if (parsed.status === "awaiting_confirmation") {
        setSelectedMode(parsed.intent.mode);
        setTitle(deriveTitle(inputText));
      } else {
        setSelectedMode(null);
        setTitle("");
      }
      setState("confirming");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setState("composing");
      setError(
        caught instanceof Error && caught.message !== "invalid_response"
          ? caught.message
          : errorMessage("unknown"),
      );
    } finally {
      submittingRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || requestError !== undefined) return;
    await sendStart(requestText, createIdempotencyKey());
  }

  async function retryIntent(): Promise<void> {
    if (draft === null || draft.status !== "retry_required" || pending || submittingRef.current)
      return;
    const controller = new AbortController();
    controllerRef.current = controller;
    submittingRef.current = true;
    setState("confirming_submission");
    setError(null);

    try {
      const envelope = {
        schema: COMPOSER_DRAFT_COMMAND_SCHEMA,
        schemaVersion: DISCOVERY_SCHEMA_VERSION,
        draftId: draft.draftId,
        expectedVersion: draft.version,
        idempotencyKey: createIdempotencyKey(),
        command: { type: "retry_intent" },
      } as const;
      if (!composerDraftCommandEnvelopeSchema.safeParse(envelope).success) {
        throw new Error("validation_failed");
      }
      const response = await fetch(`/api/composer/drafts/${draft.draftId}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
      if (!response.ok) throw await responseError(response);
      const parsed = parseResponse(draftStartResponseSchema, await response.json());
      setDraft(parsed);
      if (parsed.status === "awaiting_confirmation") {
        setSelectedMode(parsed.intent.mode);
        setTitle(deriveTitle(requestText));
      } else {
        setSelectedMode(null);
        setTitle("");
      }
      setState("confirming");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setState("confirming");
      setError(
        caught instanceof Error && caught.message !== "invalid_response"
          ? caught.message
          : errorMessage("unknown"),
      );
    } finally {
      submittingRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  async function confirmIntent(): Promise<void> {
    if (
      draft === null ||
      draft.status !== "awaiting_confirmation" ||
      selectedMode === null ||
      !titleWithinBudget(title) ||
      pending ||
      submittingRef.current
    )
      return;
    const controller = new AbortController();
    controllerRef.current = controller;
    submittingRef.current = true;
    setState("confirming_submission");
    setError(null);

    try {
      const envelope = {
        schema: COMPOSER_DRAFT_COMMAND_SCHEMA,
        schemaVersion: DISCOVERY_SCHEMA_VERSION,
        draftId: draft.draftId,
        expectedVersion: draft.version,
        idempotencyKey: createIdempotencyKey(),
        command: {
          type: "confirm_and_promote",
          confirmedMode: selectedMode,
          confirmedTitle: title.trim(),
        },
      } as const;
      if (!composerDraftCommandEnvelopeSchema.safeParse(envelope).success) {
        throw new Error("validation_failed");
      }
      const response = await fetch(`/api/composer/drafts/${draft.draftId}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
      if (!response.ok) throw await responseError(response);
      const promotion = parseResponse(promotionResponseSchema, await response.json());
      // Clear the draft immediately so a second click cannot re-submit confirm_and_promote
      // against an already-promoted draft (which would surface as a 409 invalid_draft_state).
      setDraft(null);
      setSelectedMode(null);
      setPromotedProjectId(promotion.projectId);
      router.push(`/projects/${promotion.projectId}/discovery`);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setState("confirming");
      setError(
        caught instanceof Error && caught.message !== "invalid_response"
          ? caught.message
          : errorMessage("unknown"),
      );
    } finally {
      submittingRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  if (draft?.status === "retry_required") {
    return (
      <section
        data-slot="composer-retry-required"
        className="grid w-full max-w-3xl gap-6"
        aria-labelledby="composer-retry-heading"
        aria-busy={pending}
      >
        <div className="grid gap-3">
          <p className="text-sm font-medium tracking-wide text-brand">One more try</p>
          <h1
            id="composer-retry-heading"
            className="text-2xl font-semibold tracking-tight text-ink md:text-3xl"
          >
            We saved your request, but the route check needs another attempt.
          </h1>
          <p className="max-w-prose text-sm leading-6 text-ink-muted">
            Your original text stays private and is not shown here. Try the check again when you are
            ready.
          </p>
        </div>
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <Alert variant="destructive">
              <AlertTitle>Route check paused</AlertTitle>
              <AlertDescription>{errorMessage(draft.lastErrorCode)}</AlertDescription>
            </Alert>
            {error === null ? null : (
              <Alert variant="destructive">
                <AlertTitle>We could not finish that step.</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="border-t border-subtle">
            <Button type="button" onClick={() => void retryIntent()} disabled={pending}>
              {pending ? "Checking again…" : "Try the route check again"}
              {pending ? null : <RotateCcw aria-hidden="true" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (!pending) {
                  setDraft(null);
                  setSelectedMode(null);
                  setState("composing");
                  setError(null);
                }
              }}
              disabled={pending}
            >
              <PencilLine aria-hidden="true" />
              Edit request
            </Button>
          </CardFooter>
        </Card>
      </section>
    );
  }

  if (promotedProjectId !== null) {
    return (
      <section
        data-slot="composer-promoted"
        className="grid w-full max-w-3xl gap-6"
        aria-labelledby="composer-promoted-heading"
        aria-busy
      >
        <header className="grid gap-3">
          <h1
            id="composer-promoted-heading"
            className="text-2xl font-semibold tracking-tight text-ink md:text-3xl"
          >
            Creating your project…
          </h1>
          <p className="max-w-prose text-sm leading-6 text-ink-muted">
            Opening the discovery workspace for your new project.
          </p>
        </header>
      </section>
    );
  }

  if (draft?.status === "awaiting_confirmation" && selectedMode !== null) {
    return (
      <IntentConfirmation
        intent={draft.intent}
        title={title}
        selectedMode={selectedMode}
        pending={state === "confirming_submission"}
        error={error}
        onTitleChange={setTitle}
        onModeChange={setSelectedMode}
        onConfirm={() => void confirmIntent()}
        onEditRequest={() => {
          if (!pending) {
            setDraft(null);
            setSelectedMode(null);
            setState("composing");
            setError(null);
          }
        }}
        onRetry={() => void confirmIntent()}
      />
    );
  }

  return (
    <form
      data-slot="home-composer"
      className="grid w-full max-w-3xl gap-4"
      onSubmit={(event) => void submitRequest(event)}
      noValidate
      aria-busy={pending}
      aria-labelledby="home-composer-heading"
    >
      <h1 id="home-composer-heading" className="sr-only">
        Start a new prompt
      </h1>

      <div className="rounded-xl border border-subtle bg-surface p-3 shadow-sm">
        <label htmlFor="home-composer-input" className="sr-only">
          What do you want to work on?
        </label>
        <textarea
          id="home-composer-input"
          value={requestText}
          onChange={(event) => setRequestText(event.target.value)}
          placeholder="Create a resume that lands me a job as a product manager…"
          rows={3}
          dir="auto"
          lang="auto"
          spellCheck
          autoComplete="off"
          className="max-h-40 w-full resize-y rounded-lg bg-transparent px-1.5 py-1.5 text-sm leading-6 text-ink outline-none placeholder:text-ink-muted"
        />

        {error === null ? null : (
          <div className="px-1.5 pb-1.5">
            <Alert variant="destructive">
              <AlertTitle>We could not check that request.</AlertTitle>
              <AlertDescription>
                <p>{error}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void sendStart(requestText, createIdempotencyKey())}
                    disabled={pending || requestError !== undefined}
                  >
                    <RotateCcw aria-hidden="true" />
                    Try again
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setError(null)}
                    disabled={pending}
                  >
                    <X aria-hidden="true" />
                    Dismiss
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-1.5 pt-1.5">
          <span aria-hidden="true" className="text-xs text-ink-muted tabular-nums">
            {requestBytes} / {MAX_INITIAL_REQUEST_UTF8_BYTES} bytes
          </span>
          <button
            type="submit"
            disabled={pending || requestError !== undefined}
            className="inline-flex size-9 items-center justify-center rounded-full bg-brand text-surface outline-none transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40"
          >
            <span className="sr-only">Continue</span>
            {pending ? (
              <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />
            ) : (
              <ArrowUp aria-hidden="true" size={16} />
            )}
          </button>
        </div>
      </div>

      <p className="text-center text-xs leading-5 text-ink-muted">
        You stay in control: a suggested route never creates a project until you confirm it.
      </p>
    </form>
  );
}

export type { DraftStartResponse, PromotionResponse };
