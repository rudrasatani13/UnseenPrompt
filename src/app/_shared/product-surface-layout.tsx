import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getServerEnvironment } from "@/config/env/server";
import { isProductSurfaceEnabled } from "@/lib/security/product-surface";

/**
 * Runs synchronously before an async protected page can stream. This preserves a real HTTP 404 in
 * production; the page still repeats the gate so direct page execution also fails closed.
 */
export function ProductSurfaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  if (!isProductSurfaceEnabled(getServerEnvironment())) {
    notFound();
  }

  return children;
}
