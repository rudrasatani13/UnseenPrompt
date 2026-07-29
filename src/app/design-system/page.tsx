import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesignSystemGallery } from "@/app/design-system/gallery-client";
import { isDesignSystemAvailable } from "@/app/design-system/gallery-data";
import { getServerEnvironment } from "@/config/env/server";

export const metadata: Metadata = {
  title: "Design System",
  robots: { index: false, follow: false },
};

/**
 * Always evaluate availability at request time. A static prerender would bake a
 * non-production gallery (or a soft not-found) into the HTML and break the
 * production exposure guard.
 */
export const dynamic = "force-dynamic";

/**
 * Non-production design-system gallery. Production resolves to not-found with
 * HTTP 404. This is a UI exposure guard, not authorization.
 *
 * The product-group loading UI lives under `(product)/loading.tsx` so this
 * route never streams the shell skeleton before `notFound()` runs.
 */
export default function DesignSystemPage() {
  const environment = getServerEnvironment();

  if (!isDesignSystemAvailable(environment.APP_ENV)) {
    notFound();
  }

  return <DesignSystemGallery />;
}
