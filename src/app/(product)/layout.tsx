import type { ReactNode } from "react";

import { MaintenanceNotice } from "@/components/shell/maintenance-notice";
import { ProductApplicationShell } from "@/components/shell/product-application-shell";
import { getServerEnvironment } from "@/config/env/server";

/**
 * Product route-group layout. Owns the application shell and the maintenance
 * presentation boundary. Health and design-system routes stay outside this
 * group.
 */
export default function ProductLayout({ children }: Readonly<{ children: ReactNode }>) {
  const environment = getServerEnvironment();
  const isMaintenance = environment.MAINTENANCE_MODE === "on";

  return (
    <ProductApplicationShell>
      {isMaintenance ? <MaintenanceNotice /> : children}
    </ProductApplicationShell>
  );
}
