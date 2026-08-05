"use client";

import { ArrowRight, ArrowUp, Check, Copy, RotateCcw, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MAX_INITIAL_REQUEST_UTF8_BYTES } from "@/domain/discovery/schemas";
import { intentDetectionSchema } from "@/domain/model/schemas";

interface Result {
  readonly id: string;
  readonly prompt: string;
}

function improvedPromptFor(input: string, mode: string, rationale: string): string {
  return `You are helping with this ${mode} request:\n\n${input.trim()}\n\nMake the response practical and specific. Use this signal while shaping the answer: ${rationale.trim()}\n\nReturn the best possible result for the request. State assumptions briefly, organize the response clearly, and do not add unrelated work.`;
}

function errorMessage(code: unknown): string {
  if (code === "provider_unavailable" || code === "rate_limited") {
    return "The prompt improver is busy right now. Try again in a moment.";
  }
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
  const [results, setResults] = useState<readonly Result[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (results.length > 0)
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [results]);

  async function submitPrompt(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || pending || sendingRef.current) return;
    sendingRef.current = true;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/prompt-studio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) throw await responseError(response);
      const payload = (await response.json()) as { readonly intent?: unknown };
      const parsed = intentDetectionSchema.safeParse(payload.intent);
      if (!parsed.success) throw new Error("invalid_response");
      setResults((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          prompt: improvedPromptFor(prompt, parsed.data.mode, parsed.data.rationale),
        },
      ]);
      setInput("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : errorMessage("unknown"));
    } finally {
      sendingRef.current = false;
      setPending(false);
    }
  }

  async function copyPrompt(result: Result): Promise<void> {
    await navigator.clipboard.writeText(result.prompt);
    setCopied(result.id);
    window.setTimeout(() => setCopied((current) => (current === result.id ? null : current)), 1600);
  }

  const canSubmit = input.trim().length > 0 && !pending;

  return (
    <main className="min-h-[calc(100dvh-5rem)] bg-surface px-4 py-8 text-ink sm:px-8 md:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center">
        <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-muted px-4 py-2 text-xs font-medium text-ink-muted">
          <Sparkles aria-hidden="true" className="size-3.5 text-brand" />
          Your shortcut to better AI results <ArrowRight aria-hidden="true" className="size-3.5" />
        </div>

        <h1 className="max-w-4xl text-center text-4xl font-medium tracking-[-0.04em] text-ink sm:text-5xl md:text-6xl">
          Turn lazy prompts into great ones
        </h1>
        <p className="mt-3 max-w-xl text-center text-base leading-7 text-ink-muted md:text-lg">
          Paste a rough idea and get a clear prompt that works better with any AI.
        </p>

        <form
          onSubmit={submitPrompt}
          className="mt-8 w-full max-w-3xl overflow-hidden rounded-xl border border-control bg-surface shadow-[0_18px_60px_rgba(0,0,0,0.08)]"
          aria-label="Prompt improver"
        >
          <label className="sr-only" htmlFor="prompt-studio-input">
            Prompt input
          </label>
          <textarea
            id="prompt-studio-input"
            className="min-h-32 w-full resize-none border-0 bg-transparent px-5 py-5 text-base leading-7 text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-brand"
            placeholder="Create a resume that lands me a job as a product manager…"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={5}
            disabled={pending}
          />
          <div className="flex items-center justify-between gap-3 border-t border-subtle px-3 py-2">
            <div className="hidden items-center gap-1 text-xs text-ink-muted sm:flex">
              <button type="button" className="rounded-md px-2 py-2 hover:bg-surface-muted">
                Prompt type: Auto
              </button>
              <button type="button" className="rounded-md px-2 py-2 hover:bg-surface-muted">
                Basic model
              </button>
            </div>
            <span className="ml-auto text-xs text-ink-muted">
              {input.length > MAX_INITIAL_REQUEST_UTF8_BYTES
                ? `Use at most ${MAX_INITIAL_REQUEST_UTF8_BYTES} bytes.`
                : `${input.length} characters`}
            </span>
            <Button type="submit" size="icon" disabled={!canSubmit} aria-label="Improve prompt">
              {pending ? (
                <Sparkles aria-hidden="true" className="animate-pulse" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
            </Button>
          </div>
        </form>

        <div className="mt-4 inline-flex rounded-full border border-subtle bg-surface-muted p-1 text-xs font-medium">
          <button type="button" className="rounded-full bg-surface px-4 py-2 text-ink shadow-sm">
            Prompt
          </button>
          <button type="button" className="rounded-full px-4 py-2 text-ink-muted hover:text-ink">
            Template
          </button>
        </div>

        {error === null ? null : (
          <div
            role="alert"
            className="mt-5 w-full max-w-3xl rounded-md border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger"
          >
            <p>{error}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setError(null)}
            >
              <RotateCcw aria-hidden="true" /> Dismiss
            </Button>
          </div>
        )}

        {results.length > 0 ? (
          <section ref={resultRef} className="mt-16 w-full max-w-4xl" aria-label="Improved prompts">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Your prompts
                </p>
                <h2 className="mt-1 text-2xl font-medium tracking-tight text-ink">Ready to use</h2>
              </div>
              <button
                type="button"
                className="text-sm text-ink-muted hover:text-ink"
                onClick={() => setResults([])}
              >
                New prompt
              </button>
            </div>
            <div className="grid gap-4">
              {results.map((result) => (
                <article
                  key={result.id}
                  className="rounded-xl border border-control bg-surface p-6 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      <Sparkles aria-hidden="true" className="size-3.5 text-brand" /> Improved
                      prompt
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void copyPrompt(result)}
                    >
                      {copied === result.id ? (
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
                  <pre className="mt-5 whitespace-pre-wrap font-sans text-sm leading-7 text-ink">
                    {result.prompt}
                  </pre>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <p className="mt-20 max-w-md text-center text-xs leading-5 text-ink-muted">
            Prompt Studio is ready. Start with anything — a rough idea, a task, or a half-finished
            thought.
          </p>
        )}
      </div>
    </main>
  );
}
