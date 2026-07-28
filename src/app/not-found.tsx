import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Application-level not-found page with a clear path back to the homepage.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-canvas px-4 py-10">
      <Card data-slot="not-found" className="w-full max-w-[640px]">
        <CardHeader>
          <CardTitle>
            <h1 className="text-lg font-semibold">Page not found</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-muted">
            The page you requested is unavailable. It may have moved, or the address may be
            incorrect.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
