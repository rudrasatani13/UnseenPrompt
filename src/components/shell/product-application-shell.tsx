"use client";

import type { ReactNode } from "react";

import { ApplicationShell } from "@/components/shell/application-shell";
import { productNavigation } from "@/components/shell/navigation";

/**
 * Client boundary that owns the product navigation fixture.
 *
 * Lucide icon components cannot be serialized from a Server Component into a
 * Client Component. Keeping the fixture on the client preserves the typed
 * navigation contract without crossing the RSC boundary.
 */
export function ProductApplicationShell({ children }: Readonly<{ children: ReactNode }>) {
  return <ApplicationShell navigation={productNavigation}>{children}</ApplicationShell>;
}
