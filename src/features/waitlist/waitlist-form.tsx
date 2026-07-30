"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
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
  const consentId = useId();
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
      } else if (response.status === 429) {
        setStatus({
          kind: "error",
          message: "Too many attempts. Wait a minute and try again.",
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
      ? "Check your inbox to confirm your email."
      : status.kind === "error"
        ? status.message
        : "";

  return (
    <form
      data-slot="waitlist-form"
      className="grid gap-4"
      onSubmit={onSubmit}
      noValidate
      aria-busy={pending}
    >
      <div className="grid gap-2">
        <Label htmlFor={emailId}>Email address</Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <Input
            id={emailId}
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            aria-describedby={`${consentId} ${liveId}`}
            aria-invalid={status.kind === "error"}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            required
            className="min-h-11 sm:flex-1"
          />
          <Button type="submit" disabled={pending} className="min-h-11 sm:min-w-44">
            {pending ? "Sending…" : "Tell me when I can try it"}
          </Button>
        </div>
      </div>

      <p id={consentId} className="text-sm text-neutral-700">
        One confirmation email now. After that, we’ll only write when there’s something worth
        trying. Unsubscribe anytime.
      </p>

      <TurnstileWidget siteKey={turnstileSiteKey} onReady={handleTurnstileReady} />

      <div
        id={liveId}
        role={status.kind === "error" && status.alert ? "alert" : "status"}
        aria-live="polite"
        className="flex min-h-5 items-start gap-2 text-sm font-medium text-ink"
      >
        {status.kind === "accepted" ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : null}
        {status.kind === "error" ? (
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : null}
        {liveMessage ? <span>{liveMessage}</span> : null}
      </div>
    </form>
  );
}
