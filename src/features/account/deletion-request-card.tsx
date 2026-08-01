"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { RiskWarning } from "@/components/product/risk-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface DeletionRequestCardProps {
  readonly deletionRequestedAt: string | null;
}

const REQUEST_COPY =
  "Submitting this request does not delete any data. A later operational phase will perform the removal after the required safeguards are in place.";
const FAILURE_COPY = "We couldn’t update the deletion request. Try again.";

export function DeletionRequestCard({ deletionRequestedAt }: DeletionRequestCardProps) {
  const router = useRouter();
  const [requestedAt, setRequestedAt] = useState(deletionRequestedAt);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(method: "POST" | "DELETE") {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/account/deletion-request", {
        method,
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        throw new Error("request_failed");
      }

      const payload = (await response.json()) as { deletionRequestedAt: string | null };
      setRequestedAt(payload.deletionRequestedAt);
      router.refresh();
    } catch {
      setError(FAILURE_COPY);
    } finally {
      setPending(false);
    }
  }

  if (requestedAt === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account deletion</CardTitle>
          <CardDescription>No deletion request is pending.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <RiskWarning
            level="danger"
            title="Request account deletion"
            description={REQUEST_COPY}
            confirmation={{
              triggerLabel: pending ? "Submitting…" : "Request account deletion",
              confirmLabel: "Submit deletion request",
              cancelLabel: "Keep my account",
              onConfirm: () => void mutate("POST"),
            }}
          />
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deletion request pending</CardTitle>
        <CardDescription>
          Requested at {requestedAt}. Your data has not been deleted and the request can still be
          cancelled.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button variant="outline" disabled={pending} onClick={() => void mutate("DELETE")}>
          {pending ? "Cancelling…" : "Cancel deletion request"}
        </Button>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
