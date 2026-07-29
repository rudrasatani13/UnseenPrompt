import type { ReactNode } from "react";

import { MaintenanceNotice } from "@/components/shell/maintenance-notice";
import { ProductApplicationShell } from "@/components/shell/product-application-shell";
import { getServerEnvironment } from "@/config/env/server";

/**
 * Product route-group layout.
 *
 * Production returns children directly so the application shell never streams.
 * Non-production keeps the Phase 2 shell and maintenance boundary.
 */
export default function ProductLayout({ children }: Readonly<{ children: ReactNode }>) {
  const environment = getServerEnvironment();

  if (environment.APP_ENV === "production") {
    return children;
  }

  const isMaintenance = environment.MAINTENANCE_MODE === "on";

  return (
    <ProductApplicationShell>
      {isMaintenance ? <MaintenanceNotice /> : children}
    </ProductApplicationShell>
  );
}
