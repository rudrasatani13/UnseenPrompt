"use client";

import { ArrowUp, Check, Copy, RotateCcw, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { intentDetectionSchema } from "@/domain/model/schemas";
import { MAX_INITIAL_REQUEST_UTF8_BYTES } from "@/domain/discovery/schemas";

interface StudioMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly improved?: boolean;
}

const INTENT = intentDetectionSchema;

function improvedPromptFor(input: string, mode: string, rationale: string): string {
  const modeLine = `Goal: ${input.trim()}`;
  const context = `Context: ${rationale.trim()}`;
  const guidance =
    "Instructions:\n" +
    "1. Treat the goal above as the single source of truth.\n" +
    "2. Use the context to scope the request precisely.\n" +
    "3. Ask only for output that directly serves the goal.\n" +
    "4. Return a complete, ready-to-run response with no preamble.";
  return `${modeLine}\n${context}\n\n${guidance}\n\nMode: ${mode}`;
}

function errorMessage(code: unknown): string {
  if (typeof code !== "string") return "We could not improve that prompt. Try again in a moment.";
  if (code === "provider_unavailable" || code === "rate_limited")
    return "The prompt improver is busy right now. Try again in a moment.";
  return "We could not improve that prompt. Try again in a moment.";
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

export function PromptStudio() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<readonly StudioMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = scrollRef.current;
    if (target === null || typeof target.scrollTo !== "function") return;
    target.scrollTo({ top: target.scrollHeight });
  }, [messages, pending]);

  async function send(promptText: string): Promise<void> {
    if (sendingRef.current) return;
    const controller = new AbortController();
    sendingRef.current = true;
    setPending(true);
    setError(null);
    const userMessage: StudioMessage = {
      id: `user-${Date.now().toString(36)}`,
      role: "user",
      text: promptText.trim(),
    };
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch("/api/prompt-studio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: promptText.trim() }),
        signal: controller.signal,
      });
      if (!response.ok) throw await responseError(response);
      const payload: unknown = await response.json();
      const parsed = INTENT.safeParse((payload as { readonly intent?: unknown }).intent ?? payload);
      if (!parsed.success) throw new Error("invalid_response");
      const intent = parsed.data;
      const improved = improvedPromptFor(promptText, intent.mode, intent.rationale);
      const assistantMessage: StudioMessage = {
        id: `assistant-${Date.now().toString(36)}`,
        role: "assistant",
        text: improved,
        improved: true,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(
        caught instanceof Error && caught.message !== "invalid_response"
          ? caught.message
          : errorMessage("unknown"),
      );
    } finally {
      sendingRef.current = false;
      setPending(false);
      void controller;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = input.trim();
    if (value.length === 0 || pending) return;
    setInput("");
    void send(value);
  }

  async function copyMessage(message: StudioMessage): Promise<void> {
    const text = message.text;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 1800);
    } catch {
      // Clipboard can be unavailable in embedded contexts; the button stays usable.
    }
  }

  const canSend = input.trim().length > 0 && !pending;

  return (
    <section
      data-slot="prompt-studio"
      className="mx-auto flex min-h-[calc(100dvh-14rem)] w-full max-w-3xl flex-col gap-6"
      aria-busy={pending}
    >
      <header className="grid justify-items-center gap-3 pt-8 text-center">
        <p className="text-sm font-medium tracking-wide text-ink-muted">Prompt Studio</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-ink md:text-5xl">
          Turn lazy prompts into great ones
        </h1>
        <p className="max-w-xl text-base leading-7 text-ink-muted">
          Paste a rough idea. We will shape it into a clear, high-performing prompt you can copy.
        </p>
      </header>

      <form
        className="grid gap-3 rounded-lg border border-control bg-surface p-3 shadow-sm"
        onSubmit={submit}
        aria-label="Prompt improver"
      >
        <label className="sr-only" htmlFor="prompt-studio-input">
          Prompt input
        </label>
        <textarea
          id="prompt-studio-input"
          className="min-h-32 w-full resize-none rounded-md bg-transparent px-2 py-1 text-base leading-7 text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="I want to build a coffee website that…"
          rows={5}
          autoComplete="off"
          spellCheck
          disabled={pending}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">
            {input.length > MAX_INITIAL_REQUEST_UTF8_BYTES
              ? `Use at most ${MAX_INITIAL_REQUEST_UTF8_BYTES} bytes.`
              : `${input.length} characters`}
          </span>
          <Button type="submit" disabled={!canSend} aria-label="Send message">
            {pending ? "Improving…" : "Improve prompt"}
            {pending ? null : <ArrowUp aria-hidden="true" />}
          </Button>
        </div>
      </form>

      {error === null ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              setError(null);
              const last = messages[messages.length - 1];
              if (last?.role === "user") void send(last.text);
            }}
            disabled={pending}
          >
            <RotateCcw aria-hidden="true" /> Try again
          </Button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="grid min-h-0 flex-1 gap-4 overflow-y-auto rounded-lg border border-subtle bg-surface p-4"
        data-slot="prompt-thread"
      >
        {messages.length === 0 ? (
          <div className="grid min-h-40 place-items-center text-center">
            <div className="grid max-w-sm gap-2">
              <Sparkles aria-hidden="true" className="mx-auto size-6 text-brand" />
              <p className="text-sm text-ink-muted">
                Your improved prompt will appear here. No account setup needed to start.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-brand px-4 py-3 text-surface">
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex justify-start">
                <div className="max-w-[85%] rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-ink">
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles aria-hidden="true" className="size-3.5 text-brand" />
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                      Improved prompt
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void copyMessage(message)}
                  >
                    {copiedId === message.id ? (
                      <>
                        <Check aria-hidden="true" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy aria-hidden="true" /> Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ),
          )
        )}
        {pending ? (
          <div className="flex justify-start">
            <div
              role="status"
              className="inline-flex items-center gap-2 rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-sm text-ink-muted"
            >
              <span className="size-2 animate-pulse rounded-full bg-brand" />
              Shaping your prompt…
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
