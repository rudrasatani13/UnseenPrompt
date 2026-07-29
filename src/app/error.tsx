"use client";

import { CircleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export interface ErrorBoundaryProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * Recoverable route error boundary. Retry is an explicit user action; the
 * message never dumps stack traces or environment secrets.
 */
export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-canvas px-4 py-10">
      <Card data-slot="route-error" className="w-full max-w-[640px]">
        <CardHeader>
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" focusable="false" />
            <AlertTitle>
              <h1 className="text-base font-semibold">Something went wrong</h1>
            </AlertTitle>
            <AlertDescription>
              The page could not be displayed. You can try again without losing the rest of your
              session.
            </AlertDescription>
          </Alert>
        </CardHeader>
        <CardContent>
          {process.env.NODE_ENV === "development" && error.digest ? (
            <p className="text-xs text-ink-muted">Reference: {error.digest}</p>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
