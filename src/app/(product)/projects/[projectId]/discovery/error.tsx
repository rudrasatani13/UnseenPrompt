"use client";

import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface DiscoveryErrorBoundaryProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

export default function DiscoveryErrorBoundary({ reset }: DiscoveryErrorBoundaryProps) {
  return (
    <Card data-slot="discovery-error" className="w-full max-w-3xl">
      <CardContent>
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" focusable="false" />
          <AlertTitle>
            <h1 className="text-base font-semibold">Discovery could not be loaded</h1>
          </AlertTitle>
          <AlertDescription>
            <p>Your saved project state was not changed. Try again without leaving this project.</p>
            <Button type="button" onClick={reset} className="mt-3">
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
