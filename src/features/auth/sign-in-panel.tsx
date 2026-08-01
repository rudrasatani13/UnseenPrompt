"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeAccountEmail } from "@/domain/account/email";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

/**
 * Neutral by contract: success and account-state errors share one message, so the page never
 * reveals whether an address already has an account.
 */
const MAGIC_LINK_SENT =
  "If that address can sign in, a link is on its way. Check your inbox and spam folder.";
const MAGIC_LINK_RETRY = "We couldn’t send the sign-in link. Try again in a minute.";
const INVALID_EMAIL = "Enter a complete email address.";

const SIGN_IN_ERROR_COPY = {
  auth_callback_failed: "We couldn’t complete that sign-in. Please try again.",
  magic_link_invalid: "That sign-in link is no longer valid. Request a new one.",
} as const;

export interface SignInPanelProps {
  readonly nextPath: string;
  readonly errorCode?: string;
}

type PanelStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "sent" }
  | { readonly kind: "error"; readonly message: string };

function knownErrorCopy(errorCode: string | undefined): string | null {
  if (errorCode === undefined) {
    return null;
  }

  return Object.hasOwn(SIGN_IN_ERROR_COPY, errorCode)
    ? SIGN_IN_ERROR_COPY[errorCode as keyof typeof SIGN_IN_ERROR_COPY]
    : null;
}

export function SignInPanel({ nextPath, errorCode }: SignInPanelProps) {
  const emailId = useId();
  const liveId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<PanelStatus>({ kind: "idle" });

  const arrivalError = knownErrorCopy(errorCode);
  const pending = status.kind === "pending";

  async function onGoogleSignIn() {
    setStatus({ kind: "pending" });

    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) {
        setStatus({ kind: "error", message: "We couldn’t start that sign-in. Try again." });
      }
    } catch {
      setStatus({ kind: "error", message: "We couldn’t start that sign-in. Try again." });
    }
  }

  async function onMagicLinkSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = normalizeAccountEmail(email);
    if (!normalized) {
      setStatus({ kind: "error", message: INVALID_EMAIL });
      return;
    }

    setStatus({ kind: "pending" });

    try {
      const supabase = getSupabaseBrowserClient();
      /*
       * The result is deliberately unread: Supabase reports account state through this error,
       * and branching on it would turn the form into an account-existence oracle.
       */
      await supabase.auth.signInWithOtp({
        email: normalized,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      setStatus({ kind: "sent" });
    } catch {
      setStatus({ kind: "error", message: MAGIC_LINK_RETRY });
    }
  }

  const liveMessage =
    status.kind === "sent" ? MAGIC_LINK_SENT : status.kind === "error" ? status.message : "";

  return (
    <div data-slot="sign-in-panel" className="grid w-full max-w-md gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="text-sm text-ink-muted">
          Use Google, or have a one-time sign-in link sent to your email.
        </p>
      </div>

      {arrivalError ? (
        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{arrivalError}</span>
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={onGoogleSignIn}
        disabled={pending}
        className="min-h-11 w-full"
      >
        Continue with Google
      </Button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-subtle" />
        <span className="text-xs tracking-wide text-ink-muted uppercase">or</span>
        <span className="h-px flex-1 bg-subtle" />
      </div>

      <form className="grid gap-4" onSubmit={onMagicLinkSubmit} noValidate aria-busy={pending}>
        <div className="grid gap-2">
          <Label htmlFor={emailId}>Email address</Label>
          <Input
            id={emailId}
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            aria-describedby={liveId}
            aria-invalid={status.kind === "error"}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            required
            className="min-h-11"
          />
        </div>

        <Button type="submit" disabled={pending} className="min-h-11 w-full">
          {pending ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>

      <div
        id={liveId}
        role={status.kind === "error" ? "alert" : "status"}
        aria-live="polite"
        className="flex min-h-5 items-start gap-2 text-sm font-medium text-ink"
      >
        {status.kind === "sent" ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : null}
        {status.kind === "error" ? (
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : null}
        {liveMessage ? <span>{liveMessage}</span> : null}
      </div>
    </div>
  );
}
