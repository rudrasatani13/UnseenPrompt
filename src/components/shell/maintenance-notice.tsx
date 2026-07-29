import { ConstructionIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Static maintenance presentation for the product shell.
 *
 * No countdown, polling, or status estimate is claimed. Retry is left to the
 * user; this is a presentation boundary, not an HTTP 503 response.
 */
export function MaintenanceNotice() {
  return (
    <Card data-slot="maintenance-notice" className="max-w-[800px]">
      <CardContent className="py-2">
        <Alert variant="info">
          <ConstructionIcon aria-hidden="true" focusable="false" />
          <AlertTitle>
            <h1 className="text-base font-semibold">UnseenPrompt is temporarily unavailable</h1>
          </AlertTitle>
          <AlertDescription>
            Maintenance is in progress. Please try again later. No estimated recovery time is
            available from this screen.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
