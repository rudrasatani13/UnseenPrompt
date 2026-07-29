"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type PanelState =
  | { readonly kind: "ready"; readonly token: string }
  | { readonly kind: "missing" }
  | { readonly kind: "pending" }
  | { readonly kind: "success" }
  | { readonly kind: "expired" }
  | { readonly kind: "invalid" }
  | { readonly kind: "temporary" };

/**
 * Fragment-driven confirmation. Never mutates on load; requires an explicit button press.
 */
export function ConfirmationPanel() {
  const [state, setState] = useState<PanelState>({ kind: "missing" });

  useEffect(() => {
    // Fragment tokens must never be read during SSR or in the initial server HTML.
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const token = params.get("token");

    /* eslint-disable react-hooks/set-state-in-effect -- client-only fragment token hydration */
    if (token) {
      setState({ kind: "ready", token });
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    } else {
      setState({ kind: "missing" });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function onConfirm() {
    if (state.kind !== "ready") {
      return;
    }

    const token = state.token;
    setState({ kind: "pending" });

    try {
      const response = await fetch("/api/waitlist/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => null)) as { kind?: string } | null;

      if (response.ok && payload?.kind === "confirmed") {
        setState({ kind: "success" });
        return;
      }
      if (payload?.kind === "expired") {
        setState({ kind: "expired" });
        return;
      }
      if (response.status >= 500) {
        setState({ kind: "temporary" });
        return;
      }
      setState({ kind: "invalid" });
    } catch {
      setState({ kind: "temporary" });
    }
  }

  return (
    <div data-slot="confirmation-panel" className="mx-auto grid w-full max-w-xl gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Confirm your email</h1>
      <p className="text-base text-ink-muted">
        Confirm this address and we’ll write when there is something ready to try.
      </p>

      {state.kind === "ready" || state.kind === "pending" ? (
        <Button
          type="button"
          onClick={onConfirm}
          disabled={state.kind === "pending"}
          className="min-h-11 w-fit"
        >
          {state.kind === "pending" ? "Confirming…" : "Confirm my email"}
        </Button>
      ) : null}

      <div role="status" aria-live="polite" className="text-sm font-medium">
        {state.kind === "success" ? (
          <>
            <p>You’re on the list.</p>
            <p className="mt-2 text-ink-muted">We’ll write when there’s something ready to try.</p>
          </>
        ) : null}
        {state.kind === "expired" ? "This confirmation has expired. Enter your email again." : null}
        {state.kind === "invalid" || state.kind === "missing"
          ? "This confirmation link is no longer available."
          : null}
        {state.kind === "temporary"
          ? "We couldn’t confirm your email. Try again in a minute."
          : null}
      </div>
    </div>
  );
}
