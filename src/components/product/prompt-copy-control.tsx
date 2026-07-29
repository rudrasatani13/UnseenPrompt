"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Check } from "@/components/ui/icons/check";
import { Copy } from "@/components/ui/icons/copy";

const COPY_FAILURE_TEXT = "Copy failed. Select the prompt text and copy it manually.";

export interface PromptCopyControlProps {
  readonly prompt: string;
  readonly copyText?: (text: string) => Promise<void>;
}

async function writeToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API is unavailable");
  }

  await navigator.clipboard.writeText(text);
}

type CopyState = "idle" | "copied" | "failed";

/**
 * The only client-side part of the prompt panel.
 *
 * Success and failure are both reported inline and in text, so the feedback
 * survives reduced motion and never depends on a transient toast. A failure is
 * cleared only by a later success, and the prompt itself is never logged.
 */
export function PromptCopyControl({ prompt, copyText = writeToClipboard }: PromptCopyControlProps) {
  const [state, setState] = useState<CopyState>("idle");

  async function handleCopy(): Promise<void> {
    try {
      await copyText(prompt);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div data-slot="prompt-copy" data-state={state} className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => {
          void handleCopy();
        }}
      >
        {state === "copied" ? (
          <Check aria-hidden="true" focusable="false" size={16} animate />
        ) : (
          <Copy aria-hidden="true" focusable="false" size={16} />
        )}
        Copy prompt
      </Button>
      {/*
       * Stable live region so success is announced without relying on motion or
       * a toast. Empty while idle so the region itself stays mounted.
       */}
      <p role="status" aria-live="polite" className="text-sm font-medium text-success">
        {state === "copied" ? "Copied" : null}
      </p>
      {state === "failed" ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {COPY_FAILURE_TEXT}
        </p>
      ) : null}
    </div>
  );
}
