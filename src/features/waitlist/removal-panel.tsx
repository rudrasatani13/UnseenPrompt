"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type PanelState =
  | { readonly kind: "ready"; readonly token: string }
  | { readonly kind: "missing" }
  | { readonly kind: "pending" }
  | { readonly kind: "success" }
  | { readonly kind: "invalid" }
  | { readonly kind: "temporary" };

/**
 * Fragment-driven removal. Loading the page never removes an address.
 */
export function RemovalPanel() {
  const [state, setState] = useState<PanelState>({ kind: "missing" });

  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const token = params.get("token");

    if (token) {
      setState({ kind: "ready", token });
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    } else {
      setState({ kind: "missing" });
    }
  }, []);

  async function onRemove() {
    if (state.kind !== "ready") {
      return;
    }

    const token = state.token;
    setState({ kind: "pending" });

    try {
      const response = await fetch("/api/waitlist/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => null)) as { kind?: string } | null;

      if (response.ok && payload?.kind === "removed") {
        setState({ kind: "success" });
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
    <div data-slot="removal-panel" className="mx-auto grid w-full max-w-xl gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Remove your email</h1>
      <p className="text-base text-ink-muted">
        Press the button below to remove this address from the UnseenPrompt waitlist.
      </p>

      {state.kind === "ready" || state.kind === "pending" ? (
        <Button
          type="button"
          variant="destructive"
          onClick={onRemove}
          disabled={state.kind === "pending"}
          className="min-h-11 w-fit"
        >
          {state.kind === "pending" ? "Removing…" : "Remove my email"}
        </Button>
      ) : null}

      <div role="status" aria-live="polite" className="text-sm font-medium">
        {state.kind === "success" ? "Your email has been removed." : null}
        {state.kind === "invalid" || state.kind === "missing"
          ? "This confirmation link is no longer available."
          : null}
        {state.kind === "temporary"
          ? "We couldn’t send the confirmation email. Try again in a minute."
          : null}
      </div>
    </div>
  );
}
