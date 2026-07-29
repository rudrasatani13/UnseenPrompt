"use client";

import { useCallback, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/features/waitlist/turnstile-widget";

export interface WaitlistFormProps {
  readonly turnstileSiteKey: string;
}

type FormStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "accepted" }
  | { readonly kind: "error"; readonly message: string; readonly alert: boolean };

export function WaitlistForm({ turnstileSiteKey }: WaitlistFormProps) {
  const emailId = useId();
  const liveId = useId();
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  const handleTurnstileReady = useCallback((handle: TurnstileWidgetHandle) => {
    turnstileRef.current = handle;
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !email.includes("@")) {
      setStatus({
        kind: "error",
        message: "Enter a complete email address.",
        alert: true,
      });
      return;
    }

    setStatus({ kind: "pending" });

    const token = (await turnstileRef.current?.execute()) ?? null;
    if (!token) {
      turnstileRef.current?.reset();
      setStatus({
        kind: "error",
        message: "We couldn’t verify this submission. Please try again.",
        alert: true,
      });
      return;
    }

    try {
      const response = await fetch("/api/waitlist/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          turnstileToken: token,
          requestId: crypto.randomUUID(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { kind?: string } | null;

      if (response.ok && payload?.kind === "accepted") {
        setStatus({ kind: "accepted" });
        turnstileRef.current?.reset();
        return;
      }

      if (payload?.kind === "invalid_email") {
        setStatus({
          kind: "error",
          message: "Enter a complete email address.",
          alert: true,
        });
      } else if (payload?.kind === "verification_failed" || response.status === 403) {
        setStatus({
          kind: "error",
          message: "We couldn’t verify this submission. Please try again.",
          alert: true,
        });
      } else {
        setStatus({
          kind: "error",
          message: "We couldn’t send the confirmation email. Try again in a minute.",
          alert: true,
        });
      }
      turnstileRef.current?.reset();
    } catch {
      turnstileRef.current?.reset();
      setStatus({
        kind: "error",
        message: "We couldn’t send the confirmation email. Try again in a minute.",
        alert: true,
      });
    }
  }

  const pending = status.kind === "pending";
  const liveMessage =
    status.kind === "accepted"
      ? "Check your inbox. We sent a confirmation email."
      : status.kind === "error"
        ? status.message
        : "";

  return (
    <form data-slot="waitlist-form" className="grid gap-4" onSubmit={onSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor={emailId}>Email address</Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <Input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            required
            className="min-h-11 sm:flex-1"
          />
          <Button type="submit" disabled={pending} className="min-h-11 sm:min-w-44">
            {pending ? "Sending…" : "Keep me posted"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-ink-muted">
        Email me when UnseenPrompt is ready. I can unsubscribe at any time.
      </p>

      <TurnstileWidget siteKey={turnstileSiteKey} onReady={handleTurnstileReady} />

      <div
        id={liveId}
        role={status.kind === "error" && status.alert ? "alert" : "status"}
        aria-live="polite"
        className="min-h-5 text-sm font-medium text-ink"
      >
        {liveMessage}
      </div>
    </form>
  );
}
