import type { ReactNode } from "react";

import { ApplicationShell } from "@/components/shell/application-shell";
import { MaintenanceNotice } from "@/components/shell/maintenance-notice";
import { productNavigation } from "@/components/shell/navigation";
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
    <ApplicationShell navigation={productNavigation}>
      {isMaintenance ? <MaintenanceNotice /> : children}
    </ApplicationShell>
  );
}
